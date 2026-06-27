#!/usr/bin/env python3
"""
ASDP Bridge — AudioSystem DSP ↔ Browser bridge.

Runs on the operator's PC (the one with the Ethernet cable plugged into
the DSPPRIMARY hardware). Translates between:

  Browser ⇄ WebSocket (ws://localhost:8765)
  Bridge  ⇄ UDP (port 6001) ⇄ Hardware DSP

The web app at https://code-fixer-248.emergent.host opens a WebSocket
to ws://localhost:8765 and starts sending/receiving JSON messages. The
bridge translates those into the binary ASDP frames documented in
/app/memory/ASDP_PROTOCOL.md.

Why ws:// from an https:// page works:
    Browsers treat ws://localhost as a "potentially trustworthy origin"
    (RFC 6761 + Secure Contexts spec) and allow it from https pages.
    Confirmed in Chrome, Firefox, Safari 16+ ✅. No TLS needed.

Run:
    python3 asdp_bridge.py

Or build a clickable .app on your Mac:
    pip install pyinstaller websockets
    pyinstaller --onefile --windowed --name "ASDP-Bridge" asdp_bridge.py
    open dist/ASDP-Bridge.app
"""
import asyncio
import json
import logging
import socket
import sys
import threading
import time
from contextlib import suppress

# ---------- Configuration -----------------------------------------------------

DSP_IP = "169.254.10.227"      # Default DSPPRIMARY link-local address
DSP_PORT = 6001
LOCAL_BIND_IP = "0.0.0.0"
WEBSOCKET_PORT = 8765
HEARTBEAT_INTERVAL_S = 0.7

# ---------- Protocol primitives ----------------------------------------------

MAGIC = b"\xA5\x5A"

# Header layout (16 bytes): MAGIC(2) LEN(2 LE) CMD(2 LE) CTR(2 LE) FLAGS(8)
HEADER_FLAGS_CONTROL = b"\x55\x65\x00\x00\x00\x00\x00\x00"   # PC->DSP heartbeat
HEADER_FLAGS_PARAM = b"\x00\x00\x00\x00\x00\x00\x00\x00"     # parameter set

# Command codes (from /app/memory/ASDP_PROTOCOL.md)
CMD_HEARTBEAT = 0x0000
CMD_FADER = 0x002D
CMD_PARAM = 0x0021      # actually the "21 xx" pattern; cmd field is 0x0000 with marker at offset 8
CMD_SAVE = 0x0015

# Parameter IDs (the (param_id, sub_param) pairs we know)
PARAM_MUTE = (0x012B, 0x0005)
PARAM_PHASE = (0x0127, 0x0002)
PARAM_DELAY = (0x00F4, 0x0002)        # value = ms (LE32)
PARAM_EQ_FREQ = (0x0061, 0x0003)      # value = freq index LE16 with "01 00" prefix
PARAM_EQ_GAIN = (0x0061, 0x0004)      # value = gain × 100 LE16
PARAM_EQ_Q = (0x0061, 0x0005)         # value = Q × 100 LE16
PARAM_MATRIX = (0x00A6, 0x0001)       # value = <row><col><state><pad>

# Meter packet headers
METER_PEAK_HEADER = b"\xA5\x5A\xF0\x03"   # 1024-byte peak meter frame
METER_RMS_HEADER = b"\xA5\x5A\xD0\x02"    # 736-byte RMS frame


def build_heartbeat(counter: int) -> bytes:
    """PC keepalive: 32-byte frame with fixed flags."""
    body = (
        MAGIC
        + (16).to_bytes(2, "little")
        + (0x0000).to_bytes(2, "little")
        + (counter & 0xFFFF).to_bytes(2, "little")
        + HEADER_FLAGS_CONTROL
        + b"\x00" * 16
    )
    return body


def build_fader(counter: int, channel: int, value: int) -> bytes:
    """Fader / direct channel control — cmd 0x002D, 32-byte frame.
    Layout: MAGIC(2) LEN(2) CMD(2) CTR(2) CH(1) VAL(1) 22×00
    """
    # Channel + value sit directly at offset 8 (right after counter); the
    # remaining 22 bytes are zero padding to the 32-byte frame size.
    body_after_header = bytes([channel & 0xFF, value & 0x7F]) + b"\x00" * 22
    return (
        MAGIC
        + (16).to_bytes(2, "little")
        + (CMD_FADER).to_bytes(2, "little")
        + (counter & 0xFFFF).to_bytes(2, "little")
        + body_after_header
    )


def build_param(counter: int, param: tuple, value4: bytes) -> bytes:
    """Generic parameter-set frame (24 bytes total)."""
    if len(value4) != 4:
        raise ValueError("value4 must be exactly 4 bytes")
    param_id, sub = param
    return (
        MAGIC
        + (8).to_bytes(2, "little")
        + (0x0000).to_bytes(2, "little")
        + (0x0000).to_bytes(2, "little")
        + bytes([0x21, counter & 0xFF])
        + b"\x00" * 6
        + param_id.to_bytes(2, "little")
        + sub.to_bytes(2, "little")
        + value4
    )


def mute_payload(on: bool) -> bytes:
    return b"\x01\x00" + (b"\x01\x00" if on else b"\x00\x00")


def phase_payload(invert: bool) -> bytes:
    return b"\x01\x00" + (b"\x01\x00" if invert else b"\x00\x00")


def delay_payload(ms: int) -> bytes:
    return max(0, min(ms, 0xFFFFFFFF)).to_bytes(4, "little")


def eq_value_payload(raw_value: int) -> bytes:
    """EQ values share the prefix 01 00 then LE16 of the scaled value."""
    return b"\x01\x00" + max(-32768, min(raw_value, 32767)).to_bytes(2, "little", signed=True)


def matrix_payload(row: int, col: int, on: bool) -> bytes:
    return bytes([row & 0xFF, col & 0xFF, 1 if on else 0, 0])


# ---------- UDP transport -----------------------------------------------------

class DspLink:
    """Owns the UDP socket to the DSP and a TX-counter."""

    def __init__(self, dsp_ip: str, dsp_port: int):
        self.dsp_ip = dsp_ip
        self.dsp_port = dsp_port
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        # OS picks the ephemeral port. Bind to ANY so we receive replies/meters.
        self.sock.bind((LOCAL_BIND_IP, 0))
        self.sock.settimeout(0.2)
        self.local_port = self.sock.getsockname()[1]
        self._tx_ctr = 0
        self._lock = threading.Lock()
        # Last seen meter sample, indexed by channel (set by reader thread).
        self.last_peaks = [0.0] * 32
        self.last_rms = [0.0] * 32
        self.dsp_seen = False  # flips True once we see the first DSP packet

    def _next_ctr(self) -> int:
        with self._lock:
            self._tx_ctr = (self._tx_ctr + 1) & 0xFFFF
            return self._tx_ctr

    def send(self, frame: bytes) -> None:
        try:
            self.sock.sendto(frame, (self.dsp_ip, self.dsp_port))
        except OSError as e:
            logging.warning("DSP send failed: %s", e)

    def send_heartbeat(self) -> None:
        self.send(build_heartbeat(self._next_ctr()))

    def send_fader(self, channel: int, value: int) -> None:
        self.send(build_fader(self._next_ctr(), channel, value))

    def send_param(self, param: tuple, value4: bytes) -> None:
        self.send(build_param(self._next_ctr(), param, value4))

    # --- High-level helpers exposed via WebSocket commands -------------------

    def cmd_fader(self, channel: int, db: float) -> None:
        # Hardware uses a 0..127 fader index. Map -∞..+10 dB → 0..127 linearly.
        # The official software's exact curve is non-linear (audio taper) but
        # this is a good starting point; refine with a real fader-curve capture.
        idx = max(0, min(int((db + 60) * 127 / 70), 127))
        self.send_fader(channel, idx)

    def cmd_mute(self, channel: int, on: bool) -> None:
        # NOTE: the captured mute packet only carries on/off, the channel id is
        # implicit (selected channel in the official software). Once we capture
        # multi-channel mute we'll add an explicit channel byte here.
        _ = channel
        self.send_param(PARAM_MUTE, mute_payload(on))

    def cmd_phase(self, channel: int, inverted: bool) -> None:
        _ = channel
        self.send_param(PARAM_PHASE, phase_payload(inverted))

    def cmd_delay_ms(self, channel: int, ms: int) -> None:
        _ = channel
        self.send_param(PARAM_DELAY, delay_payload(ms))

    def cmd_eq(self, channel: int, band: int, freq_idx: int = None,
               gain_db: float = None, q: float = None) -> None:
        _ = channel
        _ = band  # multi-band addressing needs more captures to pin down
        if freq_idx is not None:
            self.send_param(PARAM_EQ_FREQ, eq_value_payload(int(freq_idx)))
        if gain_db is not None:
            self.send_param(PARAM_EQ_GAIN, eq_value_payload(int(round(gain_db * 100))))
        if q is not None:
            self.send_param(PARAM_EQ_Q, eq_value_payload(int(round(q * 100))))

    def cmd_matrix(self, row: int, col: int, on: bool) -> None:
        self.send_param(PARAM_MATRIX, matrix_payload(row, col, on))

    # --- Meter receive --------------------------------------------------------

    def parse_meters(self, data: bytes) -> None:
        """Parse a meter frame. Peak frame = 1024 B, RMS frame = 736 B."""
        if data.startswith(METER_PEAK_HEADER) and len(data) >= 1024:
            # The first 16 bytes are the header. The remaining payload is the
            # array of 16-bit unsigned meter samples. Cap to 32 channels.
            body = data[16:]
            for i in range(32):
                off = i * 2
                if off + 2 > len(body):
                    break
                v = int.from_bytes(body[off:off + 2], "little")
                # Map 0..65535 → 0..1.0 (rough; real curve is dB-shaped)
                self.last_peaks[i] = v / 65535.0
        elif data.startswith(METER_RMS_HEADER) and len(data) >= 736:
            body = data[16:]
            for i in range(32):
                off = i * 2
                if off + 2 > len(body):
                    break
                v = int.from_bytes(body[off:off + 2], "little")
                self.last_rms[i] = v / 65535.0


def heartbeat_loop(link: DspLink, stop_event: threading.Event) -> None:
    """Keeps the DSP↔PC link alive."""
    while not stop_event.is_set():
        link.send_heartbeat()
        stop_event.wait(HEARTBEAT_INTERVAL_S)


def receiver_loop(link: DspLink, stop_event: threading.Event) -> None:
    """Drains incoming UDP packets and updates meter arrays."""
    while not stop_event.is_set():
        try:
            data, addr = link.sock.recvfrom(2048)
            if addr[0] == link.dsp_ip:
                link.dsp_seen = True
                link.parse_meters(data)
        except socket.timeout:
            continue
        except OSError:
            return


# ---------- WebSocket server --------------------------------------------------

try:
    import websockets
except ImportError:
    print("ERROR: `websockets` package missing. Install with:\n"
          "  pip install websockets\n", file=sys.stderr)
    sys.exit(1)


async def ws_handler(websocket, link: DspLink):
    """One WebSocket connection per browser tab. Bidirectional protocol:

    Browser → Bridge (JSON):
        {"op": "fader",  "channel": 0, "db": -3.5}
        {"op": "mute",   "channel": 0, "on": true}
        {"op": "phase",  "channel": 0, "inverted": false}
        {"op": "delay",  "channel": 0, "ms": 5}
        {"op": "eq",     "channel": 0, "band": 0,
                         "freq": 250, "gain_db": 3.0, "q": 1.2}
        {"op": "matrix", "row": 0, "col": 0, "on": true}
        {"op": "ping"}

    Bridge → Browser (JSON):
        {"op": "hello", "dsp_ip": "169.254.10.227", "dsp_seen": true}
        {"op": "meters", "peak": [...32...], "rms": [...32...]}
        {"op": "ack", "echo": <original_op>}
        {"op": "error", "msg": "..."}
    """
    logging.info("Browser connected: %s", websocket.remote_address)
    await websocket.send(json.dumps({
        "op": "hello",
        "dsp_ip": link.dsp_ip,
        "dsp_seen": link.dsp_seen,
    }))

    # Push meter snapshots at 25 Hz back to this browser.
    async def meter_pusher():
        while True:
            await asyncio.sleep(0.04)
            try:
                await websocket.send(json.dumps({
                    "op": "meters",
                    "peak": [round(v, 4) for v in link.last_peaks],
                    "rms": [round(v, 4) for v in link.last_rms],
                    "dsp_seen": link.dsp_seen,
                }))
            except websockets.ConnectionClosed:
                return

    pusher_task = asyncio.create_task(meter_pusher())
    try:
        async for raw in websocket:
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send(json.dumps({"op": "error", "msg": "bad JSON"}))
                continue
            op = msg.get("op")
            try:
                if op == "ping":
                    await websocket.send(json.dumps({"op": "pong"}))
                elif op == "fader":
                    link.cmd_fader(int(msg["channel"]), float(msg["db"]))
                elif op == "mute":
                    link.cmd_mute(int(msg["channel"]), bool(msg["on"]))
                elif op == "phase":
                    link.cmd_phase(int(msg["channel"]), bool(msg.get("inverted", False)))
                elif op == "delay":
                    link.cmd_delay_ms(int(msg["channel"]), int(msg["ms"]))
                elif op == "eq":
                    link.cmd_eq(
                        int(msg["channel"]),
                        int(msg.get("band", 0)),
                        freq_idx=msg.get("freq"),
                        gain_db=msg.get("gain_db"),
                        q=msg.get("q"),
                    )
                elif op == "matrix":
                    link.cmd_matrix(int(msg["row"]), int(msg["col"]), bool(msg["on"]))
                else:
                    await websocket.send(json.dumps({"op": "error", "msg": f"unknown op '{op}'"}))
                    continue
                await websocket.send(json.dumps({"op": "ack", "echo": op}))
            except (KeyError, ValueError, TypeError) as e:
                await websocket.send(json.dumps({"op": "error", "msg": f"{op}: {e}"}))
    except websockets.ConnectionClosed:
        pass
    finally:
        pusher_task.cancel()
        with suppress(asyncio.CancelledError):
            await pusher_task
        logging.info("Browser disconnected: %s", websocket.remote_address)


async def main_async(dsp_ip: str, ws_port: int):
    link = DspLink(dsp_ip, DSP_PORT)
    logging.info("ASDP Bridge listening on UDP %s (local port %d) <-> DSP %s:%d",
                 LOCAL_BIND_IP, link.local_port, dsp_ip, DSP_PORT)

    stop = threading.Event()
    hb_th = threading.Thread(target=heartbeat_loop, args=(link, stop), daemon=True)
    rx_th = threading.Thread(target=receiver_loop, args=(link, stop), daemon=True)
    hb_th.start()
    rx_th.start()

    async with websockets.serve(lambda ws: ws_handler(ws, link), "localhost", ws_port):
        logging.info("WebSocket server: ws://localhost:%d", ws_port)
        logging.info("Open the web app — it should connect automatically.")
        await asyncio.Future()  # run forever


def cli():
    import argparse
    p = argparse.ArgumentParser(description="AudioSystem DSP <-> Browser bridge")
    p.add_argument("--dsp-ip", default=DSP_IP, help=f"DSP IP (default {DSP_IP})")
    p.add_argument("--ws-port", type=int, default=WEBSOCKET_PORT,
                   help=f"WebSocket port (default {WEBSOCKET_PORT})")
    p.add_argument("-v", "--verbose", action="store_true")
    args = p.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        datefmt="%H:%M:%S",
    )

    try:
        asyncio.run(main_async(args.dsp_ip, args.ws_port))
    except KeyboardInterrupt:
        logging.info("Bridge stopped.")


if __name__ == "__main__":
    cli()

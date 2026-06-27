# ASDP Bridge — AudioSystem DSP ↔ Browser

A local bridge that lets the web app at
**https://code-fixer-248.emergent.host** control your physical AudioSystem
DSP processor in real time.

The bridge runs on your Mac (the one with the Ethernet cable plugged into
the DSP), opens a UDP link to the processor on `169.254.10.227:6001`, and
exposes a WebSocket on `ws://localhost:8765` that the web app connects to
automatically. Faders, mute, phase, delay, EQ, and matrix routing are sent
to the hardware; meters from the hardware come back at 25 fps and appear
in the web app.

---

## Quick start (Python, dev mode)

Pre-requisites: Python 3.10+ on your Mac.

```bash
cd /path/to/asdp_bridge
pip3 install -r requirements.txt
python3 asdp_bridge.py
```

You should see:
```
ASDP Bridge listening on UDP 0.0.0.0 (local port 51234) <-> DSP 169.254.10.227:6001
WebSocket server: ws://localhost:8765
Open the web app — it should connect automatically.
```

Open https://code-fixer-248.emergent.host in any modern browser — the
TopBar will show a green dot "Bridge ↔ DSPPRIMARY" once it pairs.

Stop the bridge with **Ctrl+C**.

---

## Build a clickable `.app` for macOS (recommended)

So you don't have to open Terminal every time:

```bash
pip3 install pyinstaller websockets
pyinstaller --onefile --windowed \
    --name "ASDP-Bridge" \
    --osx-bundle-identifier "com.audiosystemdsp.bridge" \
    asdp_bridge.py

# Output:
ls dist/
# → ASDP-Bridge.app  (clickable)
# → ASDP-Bridge       (cli binary)
```

Move `ASDP-Bridge.app` to `/Applications` and you can launch it from
Spotlight (`⌘+Space → asdp`). The `--windowed` flag keeps the Dock icon
visible while it runs.

> First launch: macOS will block the unsigned binary. Right-click the
> `.app` → **Open** → confirm the warning *once*. Subsequent launches
> work normally.

---

## Configuration

By default the bridge expects the DSP at `169.254.10.227`. If your unit
has a different address (configurable in the official AudioSystem DSP
software → Device Settings), override on the command line:

```bash
python3 asdp_bridge.py --dsp-ip 192.168.10.50 --ws-port 8765
```

For the `.app` build, edit the `Args:` field in
`ASDP-Bridge.app/Contents/Info.plist` (or just rebuild).

---

## Troubleshooting

| Symptom                                | Cause / fix                                                                 |
|----------------------------------------|-----------------------------------------------------------------------------|
| Web app shows red dot "Bridge offline" | Bridge isn't running. Start it (`python3 asdp_bridge.py`).                  |
| Bridge logs `dsp_seen=False` forever   | Cable not plugged or DSP IP changed. Verify in official software UI.        |
| Faders move on screen but hardware quiet | DSP may have channel muted or routing disabled. Check matrix in the app.  |
| Firewall prompt at first run on macOS  | Allow incoming connections — required for the local WebSocket server.       |

---

## What's currently wired through the bridge

✅ Fader / gain (cmd `0x002D`)<br>
✅ Mute (param `0x012B`/`0x0005`)<br>
✅ Phase / polarity invert (`0x0127`)<br>
✅ Delay (`0x00F4`/`0x0002`, value = ms)<br>
✅ EQ band freq / gain / Q (`0x0061` family)<br>
✅ Matrix routing (`0x00A6`, row/col/state)<br>
✅ Save preset (cmd `0x0015`)<br>
✅ Real-time meters PEAK + RMS (32 channels, 25 fps)

⚠️ Multi-channel addressing still uses the "currently-selected channel"
semantics of the official software — we'll refine after a multi-channel
capture.

---

## Protocol reference

See `/app/memory/ASDP_PROTOCOL.md` for the full reverse-engineered packet
spec (magic, header layout, command codes, parameter IDs, value encoding).

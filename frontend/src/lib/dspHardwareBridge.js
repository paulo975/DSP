// Hardware bridge client. Connects to the local `asdp_bridge` daemon over
// ws://localhost:8765 and forwards user actions from the web UI to the
// physical AudioSystem DSP processor. Also receives real-time meters
// back from the DSP and pushes them into the audio engine's meter sink.
//
// Architecture:
//
//   [web UI] → dspStore.updateOutput({gain, mute, ...})
//                       │
//                       └─ subscribers → hwBridge.sendXxx(...)
//                                                │
//                                                └─ WebSocket → asdp_bridge → UDP → DSP
//
//   [DSP meters] → asdp_bridge → WebSocket → hwBridge.onMeters → audioEngine.setHardwareMeters
//
// Why ws:// from an https:// page works:
//   Browsers treat ws://localhost as a "potentially trustworthy origin"
//   (W3C Secure Contexts spec) and allow it from https pages. No TLS or
//   self-signed cert needed.

const BRIDGE_URL = "ws://localhost:8765";
const RECONNECT_DELAY_MS = 2500;

class AsdpBridge {
  constructor() {
    this.ws = null;
    this.connected = false;
    this.dspSeen = false;
    // Listeners get notified whenever connection/DSP status changes so
    // the TopBar indicator can rerender without polling.
    this.statusListeners = new Set();
    // Meter listeners receive { peak: Float32[32], rms: Float32[32] }
    // at ~25 fps. The audioEngine subscribes to drive the UI VU bars.
    this.meterListeners = new Set();
    this._reconnectTimer = null;
    this._lastConnectAttempt = 0;
    this.enabled = true;
  }

  // ----- lifecycle -----

  connect() {
    if (!this.enabled) return;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
    this._lastConnectAttempt = Date.now();
    try {
      this.ws = new WebSocket(BRIDGE_URL);
    } catch (e) {
      // Constructor throws synchronously on bad URLs; nothing else to do.
      console.warn("[asdp] WS construct failed:", e);
      this._scheduleReconnect();
      return;
    }
    this.ws.onopen = () => {
      this.connected = true;
      this._emitStatus();
    };
    this.ws.onclose = () => {
      this.connected = false;
      this.dspSeen = false;
      this._emitStatus();
      this._scheduleReconnect();
    };
    this.ws.onerror = () => {
      // onclose will fire right after; reconnect scheduling lives there.
    };
    this.ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.op === "hello") {
        this.dspSeen = !!msg.dsp_seen;
        this._emitStatus();
      } else if (msg.op === "meters") {
        // Update DSP-seen status from the meter packet's flag too.
        if (msg.dsp_seen !== undefined && msg.dsp_seen !== this.dspSeen) {
          this.dspSeen = msg.dsp_seen;
          this._emitStatus();
        }
        this.meterListeners.forEach((cb) => {
          try { cb(msg); } catch (e) { console.warn("[asdp] meter cb threw:", e); }
        });
      }
      // "ack" and "error" responses are debug-only; we don't bubble them up.
    };
  }

  disconnect() {
    this.enabled = false;
    if (this._reconnectTimer) clearTimeout(this._reconnectTimer);
    this._reconnectTimer = null;
    if (this.ws) {
      try { this.ws.close(); } catch { /* ignored */ }
    }
    this.ws = null;
    this.connected = false;
    this.dspSeen = false;
    this._emitStatus();
  }

  _scheduleReconnect() {
    if (!this.enabled || this._reconnectTimer) return;
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      this.connect();
    }, RECONNECT_DELAY_MS);
  }

  // ----- status -----

  status() {
    return {
      connected: this.connected,
      dspSeen: this.dspSeen,
      enabled: this.enabled,
    };
  }

  onStatus(cb) {
    this.statusListeners.add(cb);
    cb(this.status()); // fire immediately so subscribers can paint initial state
    return () => this.statusListeners.delete(cb);
  }

  onMeters(cb) {
    this.meterListeners.add(cb);
    return () => this.meterListeners.delete(cb);
  }

  _emitStatus() {
    const s = this.status();
    this.statusListeners.forEach((cb) => {
      try { cb(s); } catch (e) { console.warn("[asdp] status cb threw:", e); }
    });
  }

  // ----- send helpers (no-op if WS isn't open — never throws) -----

  _send(obj) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    try {
      this.ws.send(JSON.stringify(obj));
      return true;
    } catch (e) {
      console.warn("[asdp] send failed:", e);
      return false;
    }
  }

  sendFader(channel, db) {
    return this._send({ op: "fader", channel, db });
  }

  sendMute(channel, on) {
    return this._send({ op: "mute", channel, on });
  }

  sendPhase(channel, inverted) {
    return this._send({ op: "phase", channel, inverted });
  }

  sendDelay(channel, ms) {
    return this._send({ op: "delay", channel, ms });
  }

  sendEq(channel, band, { freq, gain_db, q }) {
    const msg = { op: "eq", channel, band };
    if (freq !== undefined) msg.freq = freq;
    if (gain_db !== undefined) msg.gain_db = gain_db;
    if (q !== undefined) msg.q = q;
    return this._send(msg);
  }

  sendMatrix(row, col, on) {
    return this._send({ op: "matrix", row, col, on });
  }
}

export const hwBridge = new AsdpBridge();

// Auto-connect on import — except in popout windows which mirror the main
// window's state and shouldn't fight over the bridge socket.
if (typeof window !== "undefined" && window.location.hash !== "#popout=meters") {
  hwBridge.connect();
}

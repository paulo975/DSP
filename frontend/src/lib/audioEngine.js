// Web Audio engine for AudioSystem DSP Web.
// Designed for low latency (latencyHint: 'interactive') and instantaneous
// parameter updates without rebuilding the audio graph.
import { dbToGain, delayToMs } from "./dspDefaults";

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.fileBuffer = null;
    this.sourceNode = null;
    this.splitter = null;
    this.testToneNodes = {}; // inputId -> { osc, gain }
    this.inputBuses = {}; // inputId -> GainNode (summed signal feeding into matrix)
    this.inputBusAnalysers = {}; // inputId -> AnalyserNode (input bus meter)
    this.outputChains = {}; // outputId -> { input, hpf, lpf, eqs[], comp, makeup, delay, panL, panR, gainL, gainR, analyser }
    this.outputRouteGains = {}; // `${inputId}->${outputId}` -> GainNode
    this.analysers = {}; // outputId -> AnalyserNode
    this.playing = false;
    this.startedAt = 0;
    this.startOffset = 0;
  }

  ensureContext() {
    if (!this.ctx) {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      this.ctx = new Ctor({ latencyHint: "interactive" });
      this.master = this.ctx.createGain();
      this.master.gain.value = 1;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
    return this.ctx;
  }

  // Generate pink noise buffer once using Paul Kellet's economy algorithm.
  // Cached on the engine so all chains share the same memory.
  _ensurePinkBuffer() {
    if (this._pinkBuffer) return this._pinkBuffer;
    const ctx = this.ensureContext();
    const seconds = 5;
    const length = ctx.sampleRate * seconds;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    }
    this._pinkBuffer = buffer;
    return buffer;
  }

  // Build / rebuild graph based on the dsp state.
  buildGraph(state) {
    this.teardownGraph();
    const ctx = this.ensureContext();

    // 1. Create per-input bus + analyser (for input-side meters).
    [...state.inputs].forEach((inp) => {
      const bus = ctx.createGain();
      bus.gain.value = 1;
      const a = ctx.createAnalyser();
      a.fftSize = 256;
      a.smoothingTimeConstant = 0.6;
      bus.connect(a);
      this.inputBuses[inp.id] = bus;
      this.inputBusAnalysers[inp.id] = a;
    });

    // 2. Create per-output processing chain.
    state.outputs.forEach((out) => {
      const chain = this.createOutputChain(ctx, out);
      this.outputChains[out.id] = chain;
      chain.outL.connect(this.master);
      chain.outR.connect(this.master);
    });

    // 3. Wire routing matrix.
    Object.entries(state.matrix).forEach(([outId, inIds]) => {
      const chain = this.outputChains[outId];
      if (!chain) return;
      inIds.forEach((inId) => {
        const bus = this.inputBuses[inId];
        if (!bus) return;
        const routeGain = ctx.createGain();
        routeGain.gain.value = 1;
        bus.connect(routeGain);
        routeGain.connect(chain.input);
        this.outputRouteGains[`${inId}->${outId}`] = routeGain;
      });
    });

    // 4. Wire file source (if loaded) into IN1/IN2 input buses.
    this.wireFileSource(state);
    // 5. Apply parameters.
    state.outputs.forEach((o) => this.applyChannel(o));
    this.applyMaster(state.masterGain, state.masterMute);
  }

  createOutputChain(ctx, out) {
    const input = ctx.createGain();
    const inputAnalyser = ctx.createAnalyser();
    inputAnalyser.fftSize = 256;
    inputAnalyser.smoothingTimeConstant = 0.6;
    input.connect(inputAnalyser);

    // Pink noise generator dedicated to this output chain. Always running;
    // gain is what makes it audible. Feeds into chain input alongside routing.
    const pinkSrc = ctx.createBufferSource();
    pinkSrc.buffer = this._ensurePinkBuffer();
    pinkSrc.loop = true;
    const pinkGain = ctx.createGain();
    pinkGain.gain.value = 0; // silent until enabled
    pinkSrc.connect(pinkGain);
    pinkGain.connect(input);
    try {
      pinkSrc.start(0);
    } catch (err) {
      console.warn("[audioEngine] pink noise source start failed:", err);
    }

    const hpf = ctx.createBiquadFilter();
    hpf.type = "highpass";
    hpf.frequency.value = out.crossover.hpf.freq;
    hpf.Q.value = 0.707;
    const lpf = ctx.createBiquadFilter();
    lpf.type = "lowpass";
    lpf.frequency.value = out.crossover.lpf.freq;
    lpf.Q.value = 0.707;

    const eqs = out.eq.bands.map((b) => {
      const f = ctx.createBiquadFilter();
      f.type = b.type;
      f.frequency.value = b.freq;
      f.Q.value = b.q;
      f.gain.value = b.gain;
      return f;
    });

    const comp = ctx.createDynamicsCompressor();
    const makeup = ctx.createGain();

    const delay = ctx.createDelay(2); // up to 2s
    delay.delayTime.value = delayToMs(out.delay) / 1000;

    // Pan implemented via gainL/gainR
    const gainL = ctx.createGain();
    const gainR = ctx.createGain();
    const outMerger = ctx.createGain();

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.6;
    this.analysers[out.id] = analyser;

    // Series chain: input -> hpf -> lpf -> EQ chain -> comp -> makeup -> delay
    let node = input;
    node.connect(hpf);
    hpf.connect(lpf);
    node = lpf;
    eqs.forEach((eq) => {
      node.connect(eq);
      node = eq;
    });
    node.connect(comp);
    comp.connect(makeup);
    makeup.connect(delay);
    delay.connect(outMerger);
    outMerger.connect(analyser);
    outMerger.connect(gainL);
    outMerger.connect(gainR);

    return {
      input,
      inputAnalyser,
      pinkSrc,
      pinkGain,
      hpf,
      lpf,
      eqs,
      comp,
      makeup,
      delay,
      gainL,
      gainR,
      outL: gainL,
      outR: gainR,
      analyser,
    };
  }

  teardownGraph() {
    try {
      Object.values(this.outputRouteGains).forEach((g) => g.disconnect());
      Object.values(this.inputBuses).forEach((g) => g.disconnect());
      Object.values(this.inputBusAnalysers).forEach((a) => {
        try { a.disconnect(); } catch (e) { /* noop */ }
      });
      Object.values(this.outputChains).forEach((c) => {
        try { c.pinkSrc.stop(); } catch (e) { /* expected when source already stopped */ }
        [c.input, c.inputAnalyser, c.pinkSrc, c.pinkGain, c.hpf, c.lpf, ...c.eqs, c.comp, c.makeup, c.delay, c.gainL, c.gainR, c.analyser].forEach((n) => {
          try {
            n.disconnect();
          } catch (e) { /* noop */ }
        });
      });
    } catch (e) { /* noop */ }
    this.outputRouteGains = {};
    this.inputBuses = {};
    this.inputBusAnalysers = {};
    this.outputChains = {};
    this.analysers = {};
    this.stopFile();
  }

  // ---------- Apply parameter updates ----------
  applyChannel(out) {
    const chain = this.outputChains[out.id];
    if (!chain || !this.ctx) return;
    const now = this.ctx.currentTime;
    const tc = 0.005; // 5ms ramp for click-free updates

    // gain & mute
    const linGain = out.mute ? 0 : dbToGain(out.gain);
    chain.input.gain.setTargetAtTime(linGain, now, tc);

    // crossover
    chain.hpf.frequency.setTargetAtTime(
      out.crossover.hpf.enabled ? out.crossover.hpf.freq : 10,
      now,
      tc,
    );
    chain.lpf.frequency.setTargetAtTime(
      out.crossover.lpf.enabled ? out.crossover.lpf.freq : 22000,
      now,
      tc,
    );

    // eq
    out.eq.bands.forEach((b, i) => {
      const f = chain.eqs[i];
      if (!f) return;
      f.frequency.setTargetAtTime(b.freq, now, tc);
      f.Q.setTargetAtTime(b.q, now, tc);
      f.gain.setTargetAtTime(out.eq.enabled ? b.gain : 0, now, tc);
    });

    // compressor
    if (out.comp.enabled) {
      chain.comp.threshold.setTargetAtTime(out.comp.threshold, now, tc);
      chain.comp.ratio.setTargetAtTime(out.comp.ratio, now, tc);
      chain.comp.attack.setTargetAtTime(out.comp.attack / 1000, now, tc);
      chain.comp.release.setTargetAtTime(out.comp.release / 1000, now, tc);
      chain.comp.knee.setTargetAtTime(out.comp.knee, now, tc);
      chain.makeup.gain.setTargetAtTime(dbToGain(out.comp.makeup), now, tc);
    } else {
      chain.comp.threshold.setTargetAtTime(0, now, tc);
      chain.comp.ratio.setTargetAtTime(1, now, tc);
      chain.makeup.gain.setTargetAtTime(1, now, tc);
    }

    // limiter: emulate with extra compressor settings inside makeup gain (soft cap)
    if (out.limiter.enabled) {
      chain.makeup.gain.setTargetAtTime(
        Math.min(dbToGain(out.comp.makeup), dbToGain(out.limiter.ceiling)),
        now,
        tc,
      );
    }

    // delay (CRITICAL — applies instantly without rebuild)
    const ms = delayToMs(out.delay);
    chain.delay.delayTime.setTargetAtTime(ms / 1000, now, tc);

    // pan: equal-power L/R
    const p = (out.pan + 100) / 200; // 0..1
    const angle = p * (Math.PI / 2);
    const left = Math.cos(angle);
    const right = Math.sin(angle);
    chain.gainL.gain.setTargetAtTime(left, now, tc);
    chain.gainR.gain.setTargetAtTime(right, now, tc);

    // pink noise generator (per-output test signal)
    const pn = out.pinkNoise || { enabled: false, level: -20 };
    chain.pinkGain.gain.setTargetAtTime(
      pn.enabled ? dbToGain(pn.level) : 0,
      now,
      tc,
    );
  }

  applyMaster(masterGainDb, mute) {
    if (!this.master || !this.ctx) return;
    const now = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(mute ? 0 : dbToGain(masterGainDb), now, 0.005);
  }

  applySoloLogic(state) {
    const anySolo = state.outputs.some((o) => o.solo);
    state.outputs.forEach((o) => {
      const chain = this.outputChains[o.id];
      if (!chain || !this.ctx) return;
      const audible = (!anySolo || o.solo) && !o.mute;
      chain.input.gain.setTargetAtTime(audible ? dbToGain(o.gain) : 0, this.ctx.currentTime, 0.005);
    });
  }

  // ---------- Routing ----------
  applyRouting(state) {
    // Disconnect old route gains
    Object.values(this.outputRouteGains).forEach((g) => {
      try {
        g.disconnect();
      } catch (e) { /* noop */ }
    });
    this.outputRouteGains = {};
    Object.entries(state.matrix).forEach(([outId, inIds]) => {
      const chain = this.outputChains[outId];
      if (!chain) return;
      inIds.forEach((inId) => {
        const bus = this.inputBuses[inId];
        if (!bus) return;
        const routeGain = this.ctx.createGain();
        routeGain.gain.value = 1;
        bus.connect(routeGain);
        routeGain.connect(chain.input);
        this.outputRouteGains[`${inId}->${outId}`] = routeGain;
      });
    });
  }

  // ---------- File / source ----------
  async loadFile(file) {
    const ctx = this.ensureContext();
    const arrayBuf = await file.arrayBuffer();
    this.fileBuffer = await ctx.decodeAudioData(arrayBuf.slice(0));
    return { duration: this.fileBuffer.duration };
  }

  wireFileSource(state) {
    // Nothing to wire yet if not playing; sourceNode is recreated on play.
    void state;
  }

  playFile(state) {
    if (!this.fileBuffer) return;
    this.stopFile();
    const ctx = this.ensureContext();
    const src = ctx.createBufferSource();
    src.buffer = this.fileBuffer;
    src.loop = true;

    const splitter = ctx.createChannelSplitter(2);
    src.connect(splitter);

    // Stereo L -> IN1 (in_phy_0), R -> IN2 (in_phy_1)
    const in1 = this.inputBuses[state.inputs[0]?.id];
    const in2 = this.inputBuses[state.inputs[1]?.id];
    if (in1) splitter.connect(in1, 0);
    if (in2) splitter.connect(in2, this.fileBuffer.numberOfChannels > 1 ? 1 : 0);

    src.start(0);
    this.sourceNode = src;
    this.splitter = splitter;
    this.playing = true;
  }

  stopFile() {
    if (this.sourceNode) {
      try {
        this.sourceNode.stop();
        this.sourceNode.disconnect();
      } catch (e) { /* noop */ }
    }
    if (this.splitter) {
      try {
        this.splitter.disconnect();
      } catch (e) { /* noop */ }
    }
    this.sourceNode = null;
    this.splitter = null;
    this.playing = false;
  }

  // Test tone generator into a specific input bus
  startTestTone(inputId, freq = 1000) {
    const ctx = this.ensureContext();
    this.stopTestTone(inputId);
    const bus = this.inputBuses[inputId];
    if (!bus) return;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = 0.2;
    osc.connect(g);
    g.connect(bus);
    osc.start();
    this.testToneNodes[inputId] = { osc, gain: g };
  }

  stopTestTone(inputId) {
    const t = this.testToneNodes[inputId];
    if (!t) return;
    try {
      t.osc.stop();
      t.osc.disconnect();
      t.gain.disconnect();
    } catch (e) { /* noop */ }
    delete this.testToneNodes[inputId];
  }

  stopAllTones() {
    Object.keys(this.testToneNodes).forEach((id) => this.stopTestTone(id));
  }

  // Return RMS-like level (0..1) for an output channel using its analyser.
  getOutputLevel(outId) {
    const a = this.analysers[outId];
    return this._readAnalyser(a);
  }

  // Return RMS-like level (0..1) at the input of the chain (pre-DSP, post-routing).
  getInputLevel(outId) {
    const chain = this.outputChains[outId];
    return this._readAnalyser(chain?.inputAnalyser);
  }

  // Return RMS-like level (0..1) of the raw input bus (post-summing, pre-routing).
  getInputBusLevel(inputId) {
    return this._readAnalyser(this.inputBusAnalysers[inputId]);
  }

  _readAnalyser(a) {
    if (!a) return 0;
    const buf = new Uint8Array(a.fftSize);
    a.getByteTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = (buf[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / buf.length);
    return Math.min(1, rms * 3);
  }
}

export const audioEngine = new AudioEngine();

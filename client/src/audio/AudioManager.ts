/**
 * Procedural audio with the Web Audio API: rain, wind, a low drone,
 * distant thunder and subtle UI sounds. Everything is synthesised at
 * runtime – no audio files, no licensing questions.
 *
 * Browsers only allow audio after a user gesture, so call `unlock()`
 * from a click / key handler.
 */

export type UiSound = 'hover' | 'select' | 'back' | 'error' | 'join';

interface Volumes {
  master: number;
  ambience: number;
  sfx: number;
}

class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private ambience: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private ambienceNodes: AudioScheduledSourceNode[] = [];
  private volumes: Volumes = { master: 0.8, ambience: 0.7, sfx: 0.8 };
  private ambienceOn = false;
  private lastHover = 0;
  /** Low-pass on the outdoor ambience: muffles the rain when you're under a roof. */
  private ambienceFilter: BiquadFilterNode | null = null;
  private indoors = false;

  get unlocked(): boolean {
    return this.ctx?.state === 'running';
  }

  unlock(): void {
    try {
      if (!this.ctx) {
        const Ctor =
          window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        const ctx = new Ctor();
        this.ctx = ctx;
        this.master = ctx.createGain();
        this.master.connect(ctx.destination);
        this.ambience = ctx.createGain();
        this.ambience.connect(this.master);
        this.sfxBus = ctx.createGain();
        this.sfxBus.connect(this.master);
        this.noise = this.makeNoise(ctx, 3);
        this.applyVolumes();
        document.addEventListener('visibilitychange', () => {
          if (!this.ctx) return;
          if (document.hidden) void this.ctx.suspend();
          else void this.ctx.resume();
        });
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      if (this.ambienceOn && !this.ambienceNodes.length) this.buildAmbience();
    } catch (e) {
      console.warn('[audio] unavailable', e);
    }
  }

  setVolumes(v: Volumes): void {
    this.volumes = v;
    this.applyVolumes();
  }

  private applyVolumes(): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.ambience || !this.sfxBus) return;
    const t = ctx.currentTime;
    this.master.gain.setTargetAtTime(this.volumes.master, t, 0.08);
    this.ambience.gain.setTargetAtTime(this.volumes.ambience, t, 0.08);
    this.sfxBus.gain.setTargetAtTime(this.volumes.sfx * 0.8, t, 0.08);
  }

  private makeNoise(ctx: AudioContext, seconds: number): AudioBuffer {
    const buf = ctx.createBuffer(2, ctx.sampleRate * seconds, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return buf;
  }

  /* ───────────── ambience ───────────── */

  startAmbience(): void {
    this.ambienceOn = true;
    if (this.ctx && !this.ambienceNodes.length) this.buildAmbience();
  }

  stopAmbience(): void {
    this.ambienceOn = false;
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    this.ambienceNodes.forEach((n) => {
      try {
        n.stop(t + 1.2);
      } catch {
        /* already stopped */
      }
    });
    this.ambienceNodes = [];
  }

  /** Muffle the rain and wind while under a roof. */
  setIndoors(indoors: boolean): void {
    if (indoors === this.indoors) return;
    this.indoors = indoors;
    const ctx = this.ctx;
    const f = this.ambienceFilter;
    if (!ctx || !f) return;
    f.frequency.cancelScheduledValues(ctx.currentTime);
    f.frequency.setTargetAtTime(indoors ? 700 : 18000, ctx.currentTime, 0.25);
  }

  /** One footstep. Surfaces sound different; `loudness` 0…1 (crouch ≈ 0.3, sprint 1). */
  footstep(surface: 'mud' | 'wood' | 'concrete' | 'metal', loudness: number): void {
    const ctx = this.ctx;
    const out = this.sfxBus;
    if (!ctx || !out || !this.noise || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    const v = 0.12 + loudness * 0.28;
    const burst = (freq: number, q: number, gain: number, dur: number, type: BiquadFilterType = 'bandpass', at = t) => {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq * (0.9 + Math.random() * 0.2);
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(gain, at + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      src.connect(f).connect(g).connect(out);
      src.start(at, Math.random() * 2);
      src.stop(at + dur + 0.05);
    };
    const thump = (freq: number, gain: number, dur: number) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.setValueAtTime(freq, t);
      o.frequency.exponentialRampToValueAtTime(freq * 0.6, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + dur + 0.05);
    };
    switch (surface) {
      case 'mud':
        // wet squelch: low body + a short sticky tail
        burst(420, 1.2, v * 0.9, 0.16, 'lowpass');
        burst(1600, 3, v * 0.25, 0.09, 'bandpass', t + 0.03);
        break;
      case 'wood':
        // hollow plank knock, sometimes a creak
        thump(110, v * 0.9, 0.12);
        burst(900, 4, v * 0.5, 0.07);
        if (Math.random() < 0.18) {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.type = 'sawtooth';
          o.frequency.setValueAtTime(180 + Math.random() * 60, t + 0.05);
          o.frequency.linearRampToValueAtTime(140, t + 0.4);
          const f = ctx.createBiquadFilter();
          f.type = 'bandpass';
          f.frequency.value = 700;
          f.Q.value = 8;
          g.gain.setValueAtTime(0.0001, t + 0.05);
          g.gain.exponentialRampToValueAtTime(v * 0.06, t + 0.12);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
          o.connect(f).connect(g).connect(out);
          o.start(t + 0.05);
          o.stop(t + 0.5);
        }
        break;
      case 'concrete':
        burst(2400, 1.5, v * 0.55, 0.06);
        burst(600, 1, v * 0.4, 0.08, 'lowpass');
        break;
      case 'metal':
        burst(3200, 6, v * 0.4, 0.12);
        thump(240, v * 0.4, 0.1);
        break;
    }
  }

  /** Game sound effects (pickups, locks, puzzles). `gain` 0…1 for distance. */
  sfx(name: 'pickup' | 'unlock' | 'locked' | 'trip' | 'switch' | 'power' | 'gate' | 'lever' | 'radio' | 'revived' | 'downed' | 'wrong' | 'page', gain = 1): void {
    const ctx = this.ctx;
    const out = this.sfxBus;
    if (!ctx || !out || !this.noise || ctx.state !== 'running' || gain <= 0.01) return;
    const t = ctx.currentTime;
    const tone = (freq: number, dur: number, g0: number, type: OscillatorType = 'sine', at = 0, to?: number) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t + at);
      if (to) o.frequency.exponentialRampToValueAtTime(to, t + at + dur);
      g.gain.setValueAtTime(0.0001, t + at);
      g.gain.exponentialRampToValueAtTime(g0 * gain, t + at + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + at + dur);
      o.connect(g).connect(out);
      o.start(t + at);
      o.stop(t + at + dur + 0.05);
    };
    const noise = (freq: number, q: number, g0: number, dur: number, at = 0, type: BiquadFilterType = 'bandpass') => {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + at);
      g.gain.exponentialRampToValueAtTime(g0 * gain, t + at + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + at + dur);
      src.connect(f).connect(g).connect(out);
      src.start(t + at, Math.random() * 2);
      src.stop(t + at + dur + 0.05);
    };
    switch (name) {
      case 'pickup':
        noise(2400, 3, 0.2, 0.08);
        tone(520, 0.25, 0.08, 'triangle', 0.03);
        break;
      case 'page':
        noise(3800, 1, 0.12, 0.25, 0, 'highpass');
        break;
      case 'unlock':
        noise(1800, 6, 0.35, 0.05);
        noise(1200, 6, 0.3, 0.06, 0.09);
        tone(180, 0.3, 0.1, 'square', 0.09, 120);
        break;
      case 'locked':
        noise(900, 8, 0.3, 0.06);
        noise(700, 8, 0.25, 0.06, 0.08);
        break;
      case 'wrong':
        tone(140, 0.25, 0.12, 'sawtooth');
        break;
      case 'switch':
        noise(2600, 4, 0.35, 0.03);
        break;
      case 'trip':
        noise(400, 1, 0.6, 0.4, 0, 'lowpass');
        noise(3000, 2, 0.4, 0.15);
        tone(60, 0.5, 0.2, 'sawtooth', 0, 40);
        break;
      case 'power':
        tone(100, 2.5, 0.08, 'sawtooth', 0.1);
        tone(120, 2.5, 0.05, 'square', 0.3);
        noise(5000, 1, 0.05, 2.5, 0.1, 'highpass');
        break;
      case 'gate':
        tone(210, 2.2, 0.12, 'sawtooth', 0, 140);
        tone(330, 1.8, 0.06, 'sawtooth', 0.3, 260);
        noise(500, 1, 0.25, 2.2, 0, 'lowpass');
        break;
      case 'lever':
        noise(700, 4, 0.4, 0.15);
        tone(90, 0.3, 0.12, 'square', 0.05, 60);
        break;
      case 'radio':
        noise(2000, 0.5, 0.18, 1.6);
        tone(440, 1.2, 0.03, 'sine', 0.4, 460);
        break;
      case 'revived':
        tone(330, 0.6, 0.08, 'triangle');
        tone(440, 0.8, 0.06, 'triangle', 0.15);
        break;
      case 'downed':
        tone(220, 1.4, 0.14, 'sawtooth', 0, 70);
        noise(200, 1, 0.4, 0.5, 0, 'lowpass');
        break;
    }
  }

  /** One heartbeat ("lub-dub"); called by the game while afraid. */
  heartbeat(strength: number): void {
    const ctx = this.ctx;
    const out = this.sfxBus;
    if (!ctx || !out || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    for (const [at, f] of [
      [0, 62],
      [0.18, 52],
    ] as const) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.setValueAtTime(f, t + at);
      o.frequency.exponentialRampToValueAtTime(f * 0.6, t + at + 0.15);
      g.gain.setValueAtTime(0.0001, t + at);
      g.gain.exponentialRampToValueAtTime(0.5 * strength, t + at + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + at + 0.18);
      o.connect(g).connect(out);
      o.start(t + at);
      o.stop(t + at + 0.25);
    }
  }

  /** Landing after a fall. */
  land(strength: number): void {
    const ctx = this.ctx;
    const out = this.sfxBus;
    if (!ctx || !out || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(90, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.2);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.25 + strength * 0.35, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.3);
  }

  /** Torch switch click (a double click: press + release). */
  flashlight(on: boolean): void {
    const ctx = this.ctx;
    const out = this.sfxBus;
    if (!ctx || !out || !this.noise || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    for (const [at, freq, gain] of [
      [0, on ? 3800 : 3000, 0.35],
      [0.045, on ? 2600 : 2200, 0.18],
    ] as const) {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = freq;
      f.Q.value = 5;
      const g = ctx.createGain();
      g.gain.setValueAtTime(gain, t + at);
      g.gain.exponentialRampToValueAtTime(0.0001, t + at + 0.03);
      src.connect(f).connect(g).connect(out);
      src.start(t + at, Math.random());
      src.stop(t + at + 0.05);
    }
  }



  /* ───────────────────────── music ───────────────────────── */

  private musicMood: 'none' | 'calm' | 'tense' | 'chase' = 'none';
  private musicTimer: ReturnType<typeof setInterval> | null = null;
  private musicStep = 0;

  /**
   * Sparse generative score: a few low "piano" notes when calm, a dissonant
   * swell when tense, a pulsing ostinato during a chase. Uses the ambience
   * volume slider.
   */
  setMusic(mood: 'none' | 'calm' | 'tense' | 'chase'): void {
    if (mood === this.musicMood) return;
    this.musicMood = mood;
    if (mood === 'none') {
      if (this.musicTimer) clearInterval(this.musicTimer);
      this.musicTimer = null;
      return;
    }
    if (!this.musicTimer) this.musicTimer = setInterval(() => this.musicTick(), 550);
  }

  private musicTick(): void {
    const ctx = this.ctx;
    const out = this.ambience;
    if (!ctx || !out || ctx.state !== 'running' || !this.ambienceOn) return;
    const t = ctx.currentTime + 0.02;
    const step = this.musicStep++;
    const scale = [146.8, 174.6, 196.0, 220.0, 261.6, 293.7]; // D minor-ish
    const piano = (f: number, g: number, dur = 3.2) => {
      // two slightly detuned partials with a quick attack and a long, soft decay
      for (const [mul, gg] of [
        [1, g],
        [2.001, g * 0.25],
      ] as const) {
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = f * mul;
        const env = ctx.createGain();
        env.gain.setValueAtTime(0.0001, t);
        env.gain.exponentialRampToValueAtTime(gg, t + 0.01);
        env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(env).connect(out);
        o.start(t);
        o.stop(t + dur + 0.05);
      }
    };
    switch (this.musicMood) {
      case 'calm':
        if (step % 4 === 0 && Math.random() < 0.45) piano(scale[Math.floor(Math.random() * scale.length)], 0.05);
        break;
      case 'tense':
        if (step % 2 === 0 && Math.random() < 0.5) piano(scale[Math.floor(Math.random() * 3)] / 2, 0.07, 4);
        if (step % 12 === 0) {
          // tritone swell
          for (const f of [73.4, 103.8]) {
            const o = ctx.createOscillator();
            o.type = 'sawtooth';
            o.frequency.value = f;
            const lp = ctx.createBiquadFilter();
            lp.type = 'lowpass';
            lp.frequency.value = 300;
            const g = ctx.createGain();
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(0.05, t + 3);
            g.gain.exponentialRampToValueAtTime(0.0001, t + 6.5);
            o.connect(lp).connect(g).connect(out);
            o.start(t);
            o.stop(t + 6.6);
          }
        }
        break;
      case 'chase': {
        // pulsing low ostinato: D – D – Eb – D
        const f = [73.4, 73.4, 77.8, 73.4][step % 4];
        for (const at of [0, 0.27]) {
          const o = ctx.createOscillator();
          o.type = 'square';
          o.frequency.value = f;
          const lp = ctx.createBiquadFilter();
          lp.type = 'lowpass';
          lp.frequency.value = 420;
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, t + at);
          g.gain.exponentialRampToValueAtTime(0.09, t + at + 0.01);
          g.gain.exponentialRampToValueAtTime(0.0001, t + at + 0.24);
          o.connect(lp).connect(g).connect(out);
          o.start(t + at);
          o.stop(t + at + 0.26);
        }
        if (step % 8 === 0) piano(587.3 * (Math.random() < 0.5 ? 1 : 1.06), 0.04, 1.5);
        break;
      }
    }
  }

  /* ───────────────────────── 3D / horror sounds ───────────────────────── */

  private listener = { x: 0, y: 0, z: 0, yaw: 0 };

  /** Where the player's ears are (call every frame). */
  setListener(x: number, y: number, z: number, yaw: number): void {
    this.listener = { x, y, z, yaw };
  }

  /**
   * A short-lived output placed in the world: left/right panning from the
   * listener's view direction, distance attenuation and a duller sound
   * further away. Returns null when the sound is out of earshot.
   */
  private spatial(x: number, y: number, z: number, range = 35): AudioNode | null {
    const ctx = this.ctx;
    const out = this.sfxBus;
    if (!ctx || !out || ctx.state !== 'running') return null;
    const l = this.listener;
    const dx = x - l.x;
    const dz = z - l.z;
    const d = Math.hypot(dx, y - l.y, dz);
    if (d > range) return null;
    // right vector = (cos yaw, −sin yaw)
    const side = d > 0.01 ? (dx * Math.cos(l.yaw) - dz * Math.sin(l.yaw)) / Math.max(1, Math.hypot(dx, dz)) : 0;
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.max(-0.95, Math.min(0.95, side));
    const g = ctx.createGain();
    g.gain.value = Math.pow(1 - d / range, 1.6);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 18000 - Math.min(1, d / range) * 15500;
    g.connect(lp).connect(pan).connect(out);
    return g;
  }

  private burstTo(out: AudioNode, at: number, freq: number, q: number, gain: number, dur: number, type: BiquadFilterType = 'bandpass'): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(f).connect(g).connect(out);
    src.start(at, Math.random() * 2);
    src.stop(at + dur + 0.05);
  }

  private toneTo(out: AudioNode, at: number, freq: number, dur: number, gain: number, type: OscillatorType = 'sine', to?: number, vibrato = 0): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, at);
    if (to) o.frequency.exponentialRampToValueAtTime(to, at + dur);
    if (vibrato) {
      const lfo = ctx.createOscillator();
      const lg = ctx.createGain();
      lfo.frequency.value = 5.5;
      lg.gain.value = vibrato;
      lfo.connect(lg).connect(o.frequency);
      lfo.start(at);
      lfo.stop(at + dur + 0.05);
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + Math.min(0.08, dur / 3));
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(out);
    o.start(at);
    o.stop(at + dur + 0.05);
  }

  /** Scripted scares placed in the world. */
  horror(kind: 'footsteps' | 'whisper' | 'childVoice' | 'knock' | 'doorSlam' | 'flicker' | 'silhouette' | 'illusion' | 'laugh', x: number, y: number, z: number, indoors = false): void {
    const out = this.spatial(x, y, z, 40);
    if (!out || !this.noise) return;
    const t = this.ctx!.currentTime + 0.02;
    switch (kind) {
      case 'footsteps': {
        // slow, heavy steps – they stop when you turn around
        const n = 4 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) {
          const at = t + i * (0.55 + Math.random() * 0.12);
          if (indoors) {
            this.toneTo(out, at, 105, 0.12, 0.5, 'sine', 70);
            this.burstTo(out, at, 900, 4, 0.3, 0.07);
          } else {
            this.burstTo(out, at, 420, 1.2, 0.55, 0.16, 'lowpass');
            this.burstTo(out, at + 0.03, 1600, 3, 0.15, 0.08);
          }
        }
        break;
      }
      case 'knock':
        for (let i = 0; i < 3; i++) {
          const at = t + i * 0.32 + (i === 2 ? 0.25 : 0);
          this.toneTo(out, at, 140, 0.14, 0.7, 'sine', 90);
          this.burstTo(out, at, 1200, 3, 0.35, 0.05);
        }
        break;
      case 'doorSlam':
        this.toneTo(out, t, 70, 0.6, 1.0, 'sine', 40);
        this.burstTo(out, t, 600, 0.7, 0.9, 0.35, 'lowpass');
        this.burstTo(out, t + 0.01, 2400, 2, 0.25, 0.12);
        break;
      case 'whisper':
      case 'illusion': {
        // breathy noise through moving "vowel" filters
        for (let i = 0; i < 6; i++) {
          const at = t + i * 0.22;
          this.burstTo(out, at, 1800 + Math.random() * 1600, 6, 0.12, 0.3);
          this.burstTo(out, at + 0.05, 700 + Math.random() * 500, 5, 0.08, 0.25);
        }
        if (kind === 'illusion') this.toneTo(out, t, 55, 2.2, 0.25, 'sine', 38);
        break;
      }
      case 'childVoice': {
        // a child humming an off-key nursery tune, far away
        const notes = [659, 587, 523, 587, 659, 659, 659];
        notes.forEach((f, i) => this.toneTo(out, t + i * 0.34, f * (0.98 + Math.random() * 0.03), 0.42, 0.09, 'triangle', undefined, 4));
        break;
      }
      case 'laugh':
        for (let i = 0; i < 5; i++) this.toneTo(out, t + i * 0.13, 520 - i * 25, 0.11, 0.08, 'triangle', 420 - i * 25, 9);
        break;
      case 'flicker':
        // electrical buzz
        for (let i = 0; i < 4; i++) this.toneTo(out, t + i * 0.18 + Math.random() * 0.1, 120, 0.08, 0.12, 'sawtooth');
        break;
      case 'silhouette':
        this.toneTo(out, t, 46, 3, 0.35, 'sine', 41);
        break;
    }
  }

  /** The Watcher's sounds: its scream before a chase, vanishing, the hit. */
  watcher(kind: 'scream' | 'vanish' | 'hit', x: number, y: number, z: number): void {
    const out = this.spatial(x, y, z, kind === 'scream' ? 80 : 45);
    if (!out || !this.noise) return;
    const t = this.ctx!.currentTime + 0.01;
    switch (kind) {
      case 'scream':
        // a wrong, inhuman shriek: detuned saws sweeping down + noise
        for (const f of [880, 932, 1245]) this.toneTo(out, t, f, 1.4, 0.16, 'sawtooth', f * 0.45, 30);
        this.burstTo(out, t, 3000, 1.5, 0.5, 1.2);
        this.toneTo(out, t + 0.1, 48, 2.5, 0.6, 'sine', 32);
        break;
      case 'vanish':
        // reversed whoosh
        for (let i = 0; i < 8; i++) this.burstTo(out, t + i * 0.05, 400 + i * 450, 2, 0.06 + i * 0.03, 0.12);
        this.toneTo(out, t, 200, 0.5, 0.15, 'sine', 1200);
        break;
      case 'hit':
        this.toneTo(out, t, 90, 0.5, 1.0, 'square', 40);
        this.burstTo(out, t, 900, 0.8, 1.0, 0.4, 'lowpass');
        this.toneTo(out, t + 0.05, 1400, 0.6, 0.2, 'sawtooth', 500, 40);
        break;
    }
  }

  /** Low breathing / drone that swells while it is near (call ~every second). */
  presence(x: number, y: number, z: number, strength: number): void {
    const out = this.spatial(x, y, z, 30);
    if (!out || !this.noise || strength <= 0.02) return;
    const t = this.ctx!.currentTime;
    this.burstTo(out, t, 500, 1.5, 0.25 * strength, 1.1, 'lowpass');
    this.burstTo(out, t + 1.3, 380, 1.5, 0.18 * strength, 0.9, 'lowpass');
    this.toneTo(out, t, 41, 2.2, 0.3 * strength, 'sine', 39);
  }

  /** A short musical stinger (not positional) when a chase starts. */
  stinger(): void {
    const ctx = this.ctx;
    const out = this.sfxBus;
    if (!ctx || !out || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    for (const f of [55, 58.3, 82.4]) this.toneTo(out, t, f, 3.5, 0.28, 'sawtooth');
    this.toneTo(out, t, 1046, 0.9, 0.06, 'sine', 980, 20);
  }

  private noiseSource(ctx: AudioContext, offset = Math.random() * 2): AudioBufferSourceNode {
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.start(ctx.currentTime, offset);
    this.ambienceNodes.push(src);
    return src;
  }

  private lfo(ctx: AudioContext, target: AudioParam, rate: number, depth: number): void {
    const o = ctx.createOscillator();
    o.frequency.value = rate;
    const g = ctx.createGain();
    g.gain.value = depth;
    o.connect(g).connect(target);
    o.start();
    this.ambienceNodes.push(o);
  }

  private buildAmbience(): void {
    const ctx = this.ctx;
    const out = this.ambience;
    if (!ctx || !out || !this.noise) return;
    const bus = ctx.createGain();
    bus.gain.setValueAtTime(0.0001, ctx.currentTime);
    bus.gain.exponentialRampToValueAtTime(1, ctx.currentTime + 4); // slow fade-in
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = this.indoors ? 700 : 18000;
    bus.connect(filter).connect(out);
    this.ambienceFilter = filter;

    // Rain: bright hiss + a softer body.
    const rainHi = ctx.createBiquadFilter();
    rainHi.type = 'highpass';
    rainHi.frequency.value = 2600;
    const rainHiGain = ctx.createGain();
    rainHiGain.gain.value = 0.12;
    this.noiseSource(ctx).connect(rainHi).connect(rainHiGain).connect(bus);

    const rainBody = ctx.createBiquadFilter();
    rainBody.type = 'bandpass';
    rainBody.frequency.value = 900;
    rainBody.Q.value = 0.6;
    const rainBodyGain = ctx.createGain();
    rainBodyGain.gain.value = 0.18;
    this.noiseSource(ctx).connect(rainBody).connect(rainBodyGain).connect(bus);
    this.lfo(ctx, rainBodyGain.gain, 0.11, 0.05);

    // Wind: low-passed noise whose colour and level slowly breathe.
    const wind = ctx.createBiquadFilter();
    wind.type = 'lowpass';
    wind.frequency.value = 380;
    wind.Q.value = 3;
    const windGain = ctx.createGain();
    windGain.gain.value = 0.22;
    this.noiseSource(ctx).connect(wind).connect(windGain).connect(bus);
    this.lfo(ctx, wind.frequency, 0.05, 160);
    this.lfo(ctx, windGain.gain, 0.07, 0.12);

    // Drone: two detuned low sines – barely audible unease.
    const drone = ctx.createGain();
    drone.gain.value = 0.035;
    const droneFilter = ctx.createBiquadFilter();
    droneFilter.type = 'lowpass';
    droneFilter.frequency.value = 220;
    drone.connect(droneFilter).connect(bus);
    for (const f of [49, 49.6, 73.4]) {
      const o = ctx.createOscillator();
      o.type = f > 70 ? 'triangle' : 'sine';
      o.frequency.value = f;
      o.connect(drone);
      o.start();
      this.ambienceNodes.push(o);
    }
    this.lfo(ctx, drone.gain, 0.03, 0.02);
  }

  /** Distant thunder; `delay` seconds after the flash (sound travels slower). */
  thunder(delay = 1.5, strength = 1): void {
    const ctx = this.ctx;
    const out = this.ambience;
    if (!ctx || !out || !this.noise || !this.ambienceOn) return;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(420, t);
    lp.frequency.exponentialRampToValueAtTime(70, t + 4.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.9 * strength, t + 0.12);
    g.gain.exponentialRampToValueAtTime(0.35 * strength, t + 0.9);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 5.5);
    src.connect(lp).connect(g).connect(out);
    src.start(t, Math.random());
    src.stop(t + 6);
  }

  /* ───────────── UI ───────────── */

  ui(sound: UiSound): void {
    const ctx = this.ctx;
    const out = this.sfxBus;
    if (!ctx || !out || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    const tone = (freq: number, dur: number, gain: number, type: OscillatorType = 'sine', at = t, to?: number) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, at);
      if (to) o.frequency.exponentialRampToValueAtTime(to, at + dur);
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(gain, at + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      o.connect(g).connect(out);
      o.start(at);
      o.stop(at + dur + 0.05);
    };
    const knock = (at: number, gain: number, freq = 1400) => {
      if (!this.noise) return;
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = freq;
      bp.Q.value = 2;
      const g = ctx.createGain();
      g.gain.setValueAtTime(gain, at);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.06);
      src.connect(bp).connect(g).connect(out);
      src.start(at, Math.random());
      src.stop(at + 0.08);
    };
    switch (sound) {
      case 'hover': {
        const now = performance.now();
        if (now - this.lastHover < 60) return;
        this.lastHover = now;
        knock(t, 0.05, 2600);
        break;
      }
      case 'select':
        // like a typewriter key and a low wooden thump
        knock(t, 0.18, 1800);
        tone(92, 0.35, 0.22, 'sine', t, 58);
        break;
      case 'back':
        knock(t, 0.12, 1100);
        tone(70, 0.25, 0.14, 'sine', t, 50);
        break;
      case 'error':
        tone(110, 0.4, 0.16, 'sawtooth', t, 82);
        tone(116, 0.4, 0.1, 'sawtooth', t);
        break;
      case 'join':
        // a soft, slightly wrong-sounding music-box interval
        tone(622, 1.2, 0.08, 'triangle', t);
        tone(659, 1.4, 0.06, 'sine', t + 0.18);
        break;
    }
  }
}

export const audio = new AudioManager();

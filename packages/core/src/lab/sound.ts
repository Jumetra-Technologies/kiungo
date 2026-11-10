/**
 * Sound for the Engineering Lab: buzzers you can hear.
 *
 * A 12 mm active buzzer has its own oscillator: give it voltage and a piezo
 * disc sings at one fixed pitch, about 2.3 kHz, a harsh, square-ish tone
 * shaped by the disc's resonance. The beeping comes from the sketch
 * switching the pin. So each buzzer here is one voice (a square wave
 * through a resonant filter, the piezo) behind a gate that opens and closes
 * exactly when the pin does.
 *
 * The lab's clock only ticks every 100 ms, far too coarse for 150 ms beeps,
 * so the gate isn't driven tick by tick. The simulation describes the pin
 * as a steady on/off pattern; this engine maps simulated time onto the
 * sound card's clock and schedules every edge a little ahead, so beeps are
 * crisp and stay in step with the sketch at any speed.
 */

import type { PinPattern } from "./simulate";

/** How far ahead to schedule, in real seconds. */
const LOOKAHEAD_S = 0.2;
/** How often to top the schedule up, in milliseconds. */
const PUMP_MS = 25;
/** Re-sync with the lab's clock when the two drift further apart than this (simulated seconds, at 1×). */
const RESYNC_S = 0.25;
/** A piezo responds in a millisecond or two and rings briefly after: attack and release time constants. */
const ATTACK_S = 0.0015;
const RELEASE_S = 0.003;
/** Overall level. A real buzzer is ~85 dB at 10 cm; this is kept comfortable for a classroom. */
const MASTER = 0.1;

/** Whether the pattern's pin is high at simulated time t (the same rule as the simulation's square()). */
export function isHigh(p: PinPattern, t: number): boolean {
  const x = (((t + p.phase) % p.period) + p.period) % p.period;
  return x < p.period * p.duty;
}

/** Every on/off edge of the pattern in (from, to], in order. */
export function edgesBetween(p: PinPattern, from: number, to: number): Array<{ t: number; on: boolean }> {
  if (!(to > from) || !(p.period > 0) || p.duty <= 0 || p.duty >= 1) return [];
  const out: Array<{ t: number; on: boolean }> = [];
  const first = Math.floor((from + p.phase) / p.period) - 1;
  const last = Math.ceil((to + p.phase) / p.period) + 1;
  for (let n = first; n <= last; n++) {
    const rise = n * p.period - p.phase;
    const fall = rise + p.period * p.duty;
    if (rise > from && rise <= to) out.push({ t: rise, on: true });
    if (fall > from && fall <= to) out.push({ t: fall, on: false });
  }
  return out.sort((a, b) => a.t - b.t);
}

export interface SoundVoice {
  id: string;
  hz: number;
  pattern: PinPattern;
}

export interface SoundState {
  running: boolean;
  /** Simulated time now, seconds. */
  t: number;
  /** Simulated seconds per real second. */
  speed: number;
  voices: SoundVoice[];
}

interface Voice {
  key: string;
  pattern: PinPattern;
  osc: OscillatorNode;
  gate: GainNode;
  /** Simulated time scheduled up to. */
  until: number;
}

/** A small, stable detune per part (±1.5 %), so two buzzers beat against each other as real ones do. */
function detune(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return 1 + ((((h % 1000) + 1000) % 1000) / 1000 - 0.5) * 0.03;
}

type AudioContextCtor = new () => AudioContext;

export class LabSound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private voices = new Map<string, Voice>();
  private pump: ReturnType<typeof setInterval> | null = null;
  private anchor = { sim: 0, audio: 0, speed: 1 };
  private state: SoundState = { running: false, t: 0, speed: 1, voices: [] };
  private enabled = true;
  private onVisibility = () => {
    if (!this.ctx) return;
    if (document.hidden) void this.ctx.suspend?.();
    else void this.ctx.resume?.();
  };

  constructor(private readonly makeContext: () => AudioContext | null = defaultContext) {}

  /** Browsers only allow sound after a click: call this from one (Run, the sound button). */
  unlock(): void {
    if (!this.ctx) {
      this.ctx = this.makeContext();
      if (!this.ctx) return;
      this.master = this.ctx.createGain();
      this.master.gain.value = this.enabled ? MASTER : 0;
      this.master.connect(this.ctx.destination);
      if (typeof document !== "undefined") document.addEventListener("visibilitychange", this.onVisibility);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume?.();
    this.apply();
  }

  get ready(): boolean {
    return !!this.ctx;
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(on ? MASTER : 0, this.ctx.currentTime, 0.01);
    this.apply();
  }

  /**
   * The snap of a USB plug seating: a few milliseconds of filtered noise (the
   * shell scraping home) and a short high tick (the latch), at `delay`
   * seconds from now.
   */
  click(delay = 0): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.enabled) return;
    const at = ctx.currentTime + Math.max(0, delay);
    const noise = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.03), ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.004));
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 3200;
    band.Q.value = 1.2;
    const snap = ctx.createGain();
    snap.gain.value = 2.2;
    src.connect(band).connect(snap).connect(this.master);
    src.start(at);
    const tick = ctx.createOscillator();
    tick.type = "triangle";
    tick.frequency.setValueAtTime(4200, at);
    tick.frequency.exponentialRampToValueAtTime(1800, at + 0.02);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(0.9, at + 0.001);
    env.gain.exponentialRampToValueAtTime(0.0001, at + 0.025);
    tick.connect(env).connect(this.master);
    tick.start(at);
    tick.stop(at + 0.04);
  }

  /** The lab's latest frame: called on every tick. */
  update(next: SoundState): void {
    this.state = next;
    this.apply();
  }

  dispose(): void {
    this.stopPump();
    for (const id of [...this.voices.keys()]) this.drop(id);
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", this.onVisibility);
    void this.ctx?.close?.();
    this.ctx = null;
    this.master = null;
  }

  /** Simulated time at the sound card's "now". */
  private simNow(): number {
    if (!this.ctx) return this.state.t;
    return this.anchor.sim + (this.ctx.currentTime - this.anchor.audio) * this.anchor.speed;
  }

  private apply(): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const { running, t, speed, voices } = this.state;
    const active = running && this.enabled && speed > 0 ? voices : [];

    // Keep simulated time and the audio clock in step. Small differences are the
    // lab's 100 ms ticks; anything bigger is a step, a reset or a speed change.
    const resync = this.anchor.speed !== speed || Math.abs(this.simNow() - t) > RESYNC_S * Math.max(1, speed);
    if (resync) this.anchor = { sim: t, audio: ctx.currentTime, speed };

    const wanted = new Set(active.map((v) => v.id));
    for (const id of [...this.voices.keys()]) if (!wanted.has(id)) this.drop(id);

    for (const v of active) {
      const key = `${v.hz}|${v.pattern.period}|${v.pattern.duty}|${v.pattern.phase}`;
      let voice = this.voices.get(v.id);
      if (!voice) {
        voice = this.create(v, key);
        this.voices.set(v.id, voice);
      } else if (voice.key !== key || resync) {
        voice.key = key;
        voice.pattern = v.pattern;
        voice.osc.frequency.setValueAtTime(v.hz * detune(v.id), ctx.currentTime);
        this.restart(voice);
      }
    }

    if (this.voices.size) this.startPump();
    else this.stopPump();
    this.schedule();
  }

  private create(v: SoundVoice, key: string): Voice {
    const ctx = this.ctx!;
    // The driver: a square wave at the buzzer's pitch.
    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.value = v.hz * detune(v.id);
    // The piezo disc: a resonance at the drive pitch, and little above ~7 kHz.
    const body = ctx.createBiquadFilter();
    body.type = "peaking";
    body.frequency.value = v.hz;
    body.Q.value = 2.5;
    body.gain.value = 9;
    const top = ctx.createBiquadFilter();
    top.type = "lowpass";
    top.frequency.value = 7000;
    top.Q.value = 0.7;
    // The gate: the pin.
    const gate = ctx.createGain();
    gate.gain.value = 0;
    osc.connect(body).connect(top).connect(gate).connect(this.master!);
    osc.start();
    const voice: Voice = { key, pattern: v.pattern, osc, gate, until: this.simNow() };
    this.restart(voice);
    return voice;
  }

  /** Forget what was scheduled and pick up from now. */
  private restart(voice: Voice): void {
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    voice.gate.gain.cancelScheduledValues(now);
    voice.gate.gain.setTargetAtTime(isHigh(voice.pattern, this.simNow()) ? 1 : 0, now, ATTACK_S);
    voice.until = this.simNow();
  }

  private drop(id: string): void {
    const voice = this.voices.get(id);
    if (!voice || !this.ctx) return;
    const now = this.ctx.currentTime;
    voice.gate.gain.cancelScheduledValues(now);
    voice.gate.gain.setTargetAtTime(0, now, RELEASE_S);
    try {
      voice.osc.stop(now + 0.05);
    } catch {
      // Already stopped.
    }
    this.voices.delete(id);
  }

  /** Put every edge due in the next LOOKAHEAD_S on the audio clock. */
  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const simNow = this.simNow();
    const horizon = simNow + LOOKAHEAD_S * this.anchor.speed;
    for (const voice of this.voices.values()) {
      const from = Math.max(voice.until, simNow);
      for (const edge of edgesBetween(voice.pattern, from, horizon)) {
        const at = this.anchor.audio + (edge.t - this.anchor.sim) / this.anchor.speed;
        voice.gate.gain.setTargetAtTime(edge.on ? 1 : 0, Math.max(at, ctx.currentTime), edge.on ? ATTACK_S : RELEASE_S);
      }
      voice.until = horizon;
    }
  }

  private startPump(): void {
    if (this.pump) return;
    this.pump = setInterval(() => this.schedule(), PUMP_MS);
  }

  private stopPump(): void {
    if (!this.pump) return;
    clearInterval(this.pump);
    this.pump = null;
  }
}

function defaultContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = (window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext) as AudioContextCtor | undefined;
  return Ctor ? new Ctor() : null;
}

import type { ThemeId } from "../../theme/index.js";

const BPM = 128;
const SECONDS_PER_BEAT = 60 / BPM;
const SIXTEENTH_NOTE = SECONDS_PER_BEAT / 4;
const EIGHTH_NOTE = SECONDS_PER_BEAT / 2;
const LOOKAHEAD_SECONDS = 0.12;
const MAX_INPUT_QUEUE_NOTES = 8;

const CHORDS = [
  { bass: 65.41, notes: [261.63, 329.63, 392, 523.25] },
  { bass: 49, notes: [196, 246.94, 293.66, 392] },
  { bass: 55, notes: [220, 261.63, 329.63, 440] },
  { bass: 43.65, notes: [174.61, 220, 261.63, 349.23] },
] as const;
const HAT_VELOCITY = [0.34, 0.16, 0.42, 0.16] as const;
const GRID_PITCH_INDICES = [0, 2, 3] as const;
const SAMPLE_URLS = {
  da: new URL("../../client/assets/audio/dagou-tap/da.wav", import.meta.url).href,
  dingdongji_ding: new URL("../../client/assets/audio/dagou-tap/dingdongji_ding.wav", import.meta.url).href,
  dingdongji_dong: new URL("../../client/assets/audio/dagou-tap/dingdongji_dong.wav", import.meta.url).href,
  dingdongji_ji: new URL("../../client/assets/audio/dagou-tap/dingdongji_ji.wav", import.meta.url).href,
  gou: new URL("../../client/assets/audio/dagou-tap/gou.wav", import.meta.url).href,
  ha: new URL("../../client/assets/audio/dagou-tap/ha.wav", import.meta.url).href,
  ji: new URL("../../client/assets/audio/dagou-tap/ji.wav", import.meta.url).href,
  jiao: new URL("../../client/assets/audio/dagou-tap/jiao.wav", import.meta.url).href,
  mi: new URL("../../client/assets/audio/dagou-tap/mi.wav", import.meta.url).href,
} as const;

type SampleName = keyof typeof SAMPLE_URLS;

interface SampleDefinition {
  gain: number;
  label: string;
  name: SampleName;
  sourceMidi: number;
  targetMidi: readonly [number, number, number, number];
  url: string;
}

export interface EasterEggAudioTheme {
  label: string;
  samples: readonly [SampleDefinition, SampleDefinition, SampleDefinition];
}

function sample(
  name: SampleName,
  label: string,
  sourceMidi: number,
  targetMidi: readonly [number, number, number, number],
  gain: number,
): SampleDefinition {
  return {
    gain,
    label,
    name,
    sourceMidi,
    targetMidi,
    url: SAMPLE_URLS[name],
  };
}

export const EASTER_EGG_AUDIO_THEMES: Readonly<Record<ThemeId, EasterEggAudioTheme>> = {
  eastern_observation: {
    label: "哈基米",
    samples: [
      sample("ha", "哈", 72.732, [81, 79, 76, 72], 1.283378415934229),
      sample("ji", "基", 67.55506219280217, [74, 72, 69, 67], 1.4777851484035351),
      sample("mi", "米", 65.47641325112846, [72, 69, 67, 64], 1.4846115949156913),
    ],
  },
  jixing_doudou: {
    label: "叮咚鸡",
    samples: [
      sample("dingdongji_ding", "叮", 68.72369809072657, [74, 72, 69, 67], 2.5889190244772604),
      sample("dingdongji_dong", "咚", 68.20736701647688, [74, 72, 69, 67], 2.3637451111911507),
      sample("dingdongji_ji", "鸡", 69.48535473104747, [74, 72, 69, 67], 2.3501763429894065),
    ],
  },
  sunge: {
    label: "大狗叫",
    samples: [
      sample("da", "大", 71.1950846771, [79, 76, 72, 69], 1),
      sample("gou", "狗", 65.5950930881, [72, 69, 67, 64], 1.012898017161218),
      sample("jiao", "叫", 71.1226079346, [79, 76, 72, 69], 0.953577156471302),
    ],
  },
};

export class EasterEggAudioEngine {
  readonly theme: EasterEggAudioTheme;

  private backgroundBus: GainNode | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private context: AudioContext | null = null;
  private loadPromise: Promise<void> | null = null;
  private lastInputTime = Number.NEGATIVE_INFINITY;
  private master: GainNode | null = null;
  private nextStepTime = 0;
  private noiseBuffer: AudioBuffer | null = null;
  private scheduler: ReturnType<typeof setInterval> | null = null;
  private soundBus: GainNode | null = null;
  private startTime = 0;
  private stepCount = 0;
  private stopped = false;

  constructor(themeId: ThemeId) {
    this.theme = EASTER_EGG_AUDIO_THEMES[themeId];
  }

  getBeatPulse(): number {
    const context = this.context;
    if (!context || this.startTime <= 0 || context.currentTime < this.startTime) return 0;
    const phase = ((context.currentTime - this.startTime) / SECONDS_PER_BEAT) % 1;
    return Math.pow(1 - phase, 2.4);
  }

  async trigger(cellIndex: number): Promise<number | null> {
    await this.start();
    if (this.stopped || !this.context || !this.soundBus) return null;

    const row = Math.floor(cellIndex / 3);
    const column = cellIndex % 3;
    const definition = this.theme.samples[column]!;
    const buffer = this.buffers.get(definition.name);
    if (!buffer) return null;

    const pitchIndex = GRID_PITCH_INDICES[row] ?? GRID_PITCH_INDICES[1];
    const targetMidi = definition.targetMidi[pitchIndex];
    const playbackRate = Math.pow(2, (targetMidi - definition.sourceMidi) / 12);
    const when = this.quantizeToEighthNote();
    if (when === null) return null;
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    source.buffer = buffer;
    source.playbackRate.setValueAtTime(playbackRate, when);
    gain.gain.setValueAtTime(definition.gain, when);
    source.connect(gain);
    gain.connect(this.soundBus);
    source.addEventListener("ended", () => {
      source.disconnect();
      gain.disconnect();
    }, { once: true });
    source.start(when);
    return Math.max(0, (when - this.context.currentTime) * 1000);
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.scheduler) clearInterval(this.scheduler);
    this.scheduler = null;
    const context = this.context;
    this.context = null;
    this.buffers.clear();
    if (context && context.state !== "closed") await context.close();
  }

  private async start(): Promise<void> {
    if (this.loadPromise) return this.loadPromise;
    this.loadPromise = this.initialize();
    return this.loadPromise;
  }

  private async initialize(): Promise<void> {
    const AudioContextConstructor = window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) throw new Error("audio_context_unavailable");

    const context = new AudioContextConstructor();
    this.context = context;
    this.master = context.createGain();
    this.backgroundBus = context.createGain();
    this.soundBus = context.createGain();
    const compressor = context.createDynamicsCompressor();
    this.master.gain.value = 0.85;
    compressor.threshold.value = -14;
    compressor.knee.value = 24;
    compressor.ratio.value = 5;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.18;
    this.backgroundBus.connect(this.master);
    this.soundBus.connect(this.master);
    this.master.connect(compressor);
    compressor.connect(context.destination);
    await context.resume();

    this.noiseBuffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
    const noise = this.noiseBuffer.getChannelData(0);
    for (let index = 0; index < noise.length; index += 1) {
      noise[index] = Math.random() * 2 - 1;
    }

    await Promise.all(this.theme.samples.map(async (definition) => {
      const response = await fetch(definition.url);
      if (!response.ok) throw new Error(`audio_load_failed:${definition.name}`);
      const buffer = await context.decodeAudioData(await response.arrayBuffer());
      this.buffers.set(definition.name, buffer);
    }));
    if (this.stopped) return;

    this.startTime = context.currentTime + 0.05;
    this.nextStepTime = this.startTime;
    this.stepCount = 0;
    this.scheduler = setInterval(() => this.schedule(), 25);
    this.schedule();
  }

  private schedule(): void {
    const context = this.context;
    if (!context || context.state === "closed") return;
    const horizon = context.currentTime + LOOKAHEAD_SECONDS;
    while (this.nextStepTime < horizon) {
      this.scheduleStep(this.stepCount, this.nextStepTime);
      this.nextStepTime += SIXTEENTH_NOTE;
      this.stepCount = (this.stepCount + 1) % 64;
    }
  }

  private scheduleStep(step: number, time: number): void {
    const bar = Math.floor(step / 16);
    const position = step % 16;
    const chord = CHORDS[bar]!;
    if (bar === 0 && position === 0) this.crash(time);
    if (position % 4 === 0) this.kick(time);
    if (position === 4 || position === 12) this.snare(time, 0.5);
    if (bar === 3 && position === 14) this.snare(time, 0.3);
    this.hat(time, HAT_VELOCITY[position % 4]!, position === 14 ? 0.12 : 0.04);
    if (position % 4 === 2) this.stab(time, chord.notes);
    if (position % 2 === 0) this.bass(time, chord.bass, position % 4 === 0 ? 0.4 : 0.26);
  }

  private quantizeToEighthNote(): number | null {
    const context = this.context!;
    const step = Math.ceil((context.currentTime + 0.02 - this.startTime) / EIGHTH_NOTE);
    const gridTime = Math.max(context.currentTime, this.startTime + step * EIGHTH_NOTE);
    const latestQueueTime = context.currentTime + EIGHTH_NOTE * MAX_INPUT_QUEUE_NOTES;
    const when = Math.max(gridTime, this.lastInputTime + EIGHTH_NOTE);
    if (when > latestQueueTime) return null;
    this.lastInputTime = when;
    return when;
  }

  private kick(time: number): void {
    const context = this.context!;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(160, time);
    oscillator.frequency.exponentialRampToValueAtTime(45, time + 0.11);
    gain.gain.setValueAtTime(0.95, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.24);
    oscillator.connect(gain);
    gain.connect(this.backgroundBus!);
    oscillator.start(time);
    oscillator.stop(time + 0.26);
  }

  private snare(time: number, volume: number): void {
    const context = this.context!;
    const noise = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    noise.buffer = this.noiseBuffer;
    filter.type = "bandpass";
    filter.frequency.value = 1800;
    filter.Q.value = 0.9;
    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.16);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.backgroundBus!);
    noise.start(time);
    noise.stop(time + 0.18);

    const body = context.createOscillator();
    const bodyGain = context.createGain();
    body.type = "triangle";
    body.frequency.setValueAtTime(240, time);
    bodyGain.gain.setValueAtTime(volume * 0.5, time);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, time + 0.09);
    body.connect(bodyGain);
    bodyGain.connect(this.backgroundBus!);
    body.start(time);
    body.stop(time + 0.1);
  }

  private hat(time: number, volume: number, decay: number): void {
    const context = this.context!;
    const noise = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    noise.buffer = this.noiseBuffer;
    filter.type = "highpass";
    filter.frequency.value = 7500;
    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + decay);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.backgroundBus!);
    noise.start(time);
    noise.stop(time + decay + 0.02);
  }

  private crash(time: number): void {
    const context = this.context!;
    const noise = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    noise.buffer = this.noiseBuffer;
    noise.loop = true;
    filter.type = "highpass";
    filter.frequency.value = 5000;
    gain.gain.setValueAtTime(0.32, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 1.2);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.backgroundBus!);
    noise.start(time);
    noise.stop(time + 1.3);
  }

  private stab(time: number, frequencies: readonly number[]): void {
    const context = this.context!;
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(2600, time);
    filter.frequency.exponentialRampToValueAtTime(600, time + 0.28);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.14, time + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.28);
    filter.connect(gain);
    gain.connect(this.backgroundBus!);
    for (const frequency of frequencies) {
      for (const detune of [-6, 5]) {
        const oscillator = context.createOscillator();
        oscillator.type = "sawtooth";
        oscillator.frequency.value = frequency;
        oscillator.detune.value = detune;
        oscillator.connect(filter);
        oscillator.start(time);
        oscillator.stop(time + 0.3);
      }
    }
  }

  private bass(time: number, frequency: number, volume: number): void {
    const context = this.context!;
    const oscillator = context.createOscillator();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    oscillator.type = "square";
    oscillator.frequency.value = frequency * 2;
    filter.type = "lowpass";
    filter.frequency.value = 300;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(volume, time + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, time + EIGHTH_NOTE * 0.9);
    oscillator.connect(filter);
    filter.connect(gain);
    gain.connect(this.backgroundBus!);
    oscillator.start(time);
    oscillator.stop(time + EIGHTH_NOTE);
  }
}

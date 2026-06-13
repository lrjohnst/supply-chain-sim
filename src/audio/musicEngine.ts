// ============================================================
// SCS Music Engine — Web Audio API, no external dependencies
// Extracted from scs_music.html. Pure TS, no React imports.
// ============================================================

export interface MusicParams {
  bpm: number;
  chaosR: number;
  chaosInitialX: number;
  melodyGain: number;
  bassGain: number;
  arpGain: number;
  percGain: number;
  chaosFillThreshold: number;
  chaosStabThreshold: number;
  masterVolume: number;
  enabled: boolean;
}

// ---- Module state ----
let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let analyser: AnalyserNode | null = null;
let dataArray: Uint8Array | null = null;

let playing = false;
let scheduleAhead = 0.1;
let lookAhead = 25;
let nextNoteTime = 0;
let currentStep = 0;
let timerID: ReturnType<typeof setTimeout> | null = null;
let animFrame: number | null = null;

// Chaos state
let chaosX = 0.7;
export let currentChaosLevel = 0; // exported for debug panel reads

let params: MusicParams = defaultParams();

function defaultParams(): MusicParams {
  return {
    bpm: 174,
    chaosR: 3.82,
    chaosInitialX: 0.7,
    melodyGain: 0.18,
    bassGain: 0.22,
    arpGain: 0.10,
    percGain: 0.9,
    chaosFillThreshold: 0.82,
    chaosStabThreshold: 0.88,
    masterVolume: 0.8,
    enabled: true,
  };
}

// ---- Musical constants ----
const noteFreq: Record<string, number> = {
  C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61,
  G3: 196.00, A3: 220.00, Bb3: 233.08, B3: 246.94,
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23,
  G4: 392.00, A4: 440.00, Bb4: 466.16, B4: 493.88,
  C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46,
  G5: 783.99, A5: 880.00, Bb5: 932.33,
  C6: 1046.50, D6: 1174.66, E6: 1318.51,
  REST: 0,
};

const melody = [
  "C5","REST","E5","REST", "G5","F5","E5","D5",
  "C5","E5","G5","REST",  "Bb5","REST","A5","G5",
  "F5","REST","E5","D5",  "C5","D5","E5","F5",
  "G5","REST","Bb5","A5", "G5","E5","C5","REST",
];

const bass = [
  "C3","REST","C3","REST", "G3","REST","G3","REST",
  "F3","REST","F3","REST", "Bb3","REST","G3","REST",
  "A3","REST","A3","REST", "E3","REST","E3","REST",
  "G3","REST","G3","D3",   "C3","REST","C3","REST",
];

const arpBase = [
  "C4","E4","G4","B4", "D4","F4","A4","C5",
  "Bb3","D4","F4","A4", "G3","B3","D4","G4",
];

const perc     = [1,3,2,3, 1,3,2,3, 1,3,2,4, 1,3,2,3];
const chaosFill = [1,3,1,3, 2,3,1,4, 1,2,3,1, 3,1,2,3];

// ---- Chaos engine ----
function logisticStep(): number {
  chaosX = params.chaosR * chaosX * (1 - chaosX);
  return chaosX;
}

// ---- Audio helpers ----
function createOsc(
  freq: number, type: OscillatorType, gainVal: number,
  time: number, duration: number, detune = 0
) {
  if (!ctx || !analyser || !freq) return;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.connect(g);
  g.connect(analyser);
  osc.type = type;
  osc.frequency.setValueAtTime(freq, time);
  if (detune) osc.detune.setValueAtTime(detune, time);
  g.gain.setValueAtTime(0, time);
  g.gain.linearRampToValueAtTime(gainVal, time + 0.005);
  g.gain.exponentialRampToValueAtTime(0.001, time + duration);
  osc.start(time);
  osc.stop(time + duration + 0.01);
}

function playKick(time: number) {
  if (!ctx || !analyser) return;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.connect(g);
  g.connect(analyser);
  osc.frequency.setValueAtTime(160, time);
  osc.frequency.exponentialRampToValueAtTime(40, time + 0.08);
  g.gain.setValueAtTime(params.percGain, time);
  g.gain.exponentialRampToValueAtTime(0.001, time + 0.15);
  osc.start(time);
  osc.stop(time + 0.2);
}

function playSnare(time: number) {
  if (!ctx || !analyser) return;
  const bufSize = ctx.sampleRate * 0.1;
  const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 3000;
  filter.Q.value = 0.7;
  const g = ctx.createGain();
  src.connect(filter);
  filter.connect(g);
  g.connect(analyser);
  g.gain.setValueAtTime(params.percGain * 0.44, time);
  g.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
  src.start(time);
  src.stop(time + 0.15);
}

function playHihat(time: number, open = false) {
  if (!ctx || !analyser) return;
  const dur = open ? 0.15 : 0.05;
  const bufSize = ctx.sampleRate * dur;
  const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filter = ctx.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = 8000;
  const g = ctx.createGain();
  src.connect(filter);
  filter.connect(g);
  g.connect(analyser);
  g.gain.setValueAtTime(params.percGain * (open ? 0.28 : 0.17), time);
  g.gain.exponentialRampToValueAtTime(0.001, time + (open ? 0.15 : 0.04));
  src.start(time);
  src.stop(time + (open ? 0.2 : 0.08));
}

function scheduleNote(step: number, time: number) {
  const STEP = 60 / params.bpm / 4;
  const s32 = step % 32;
  const s16 = step % 16;
  const chaos = logisticStep();
  currentChaosLevel = chaos;

  const chaosIntensity = Math.abs(chaos - 0.5) * 2;
  const detune = (chaos - 0.5) * chaosIntensity * 80;

  // Melody
  const melFreq = noteFreq[melody[s32]] ?? 0;
  if (melFreq > 0) {
    createOsc(melFreq, "square", params.melodyGain, time, STEP * 0.85, detune * 0.3);
    createOsc(melFreq, "square", params.melodyGain * 0.33, time, STEP * 0.85, detune * 0.3 + 7);
  }

  // Bass
  const bassFreq = noteFreq[bass[s32]] ?? 0;
  if (bassFreq > 0) {
    createOsc(bassFreq, "sawtooth", params.bassGain, time, STEP * 1.8, 0);
    createOsc(bassFreq / 2, "square", params.bassGain * 0.55, time, STEP * 1.8, 0);
  }

  // Arpeggio
  let arpNote: string;
  if (chaosIntensity > 0.75 && s16 % 4 === 2) {
    arpNote = arpBase[Math.floor(chaos * 16)];
  } else {
    arpNote = arpBase[s16];
  }
  const arpFreq = noteFreq[arpNote] ?? 0;
  if (arpFreq > 0) {
    createOsc(arpFreq, "square", params.arpGain, time, STEP * 0.4, detune * 0.5);
  }

  // Percussion
  const percPattern = chaosIntensity > params.chaosFillThreshold ? chaosFill : perc;
  const p = percPattern[s16];
  if (p === 1) playKick(time);
  else if (p === 2) playSnare(time);
  else if (p === 3) playHihat(time, false);
  else if (p === 4) playHihat(time, true);

  // Chaos stab
  if (chaosIntensity > params.chaosStabThreshold && s16 % 8 === 3) {
    const stabFreqs = [noteFreq.C5, noteFreq.Bb4, noteFreq.G4, noteFreq.E5];
    const stabF = stabFreqs[Math.floor(chaos * stabFreqs.length)];
    if (stabF && ctx && analyser) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.connect(g);
      g.connect(analyser);
      osc.type = "square";
      osc.frequency.setValueAtTime(stabF * 1.5, time);
      osc.frequency.exponentialRampToValueAtTime(stabF, time + STEP * 0.3);
      g.gain.setValueAtTime(0.08, time);
      g.gain.exponentialRampToValueAtTime(0.001, time + STEP * 0.3);
      osc.start(time);
      osc.stop(time + STEP * 0.4);
    }
  }
}

function scheduler() {
  if (!ctx) return;
  const STEP = 60 / params.bpm / 4;
  while (nextNoteTime < ctx.currentTime + scheduleAhead) {
    scheduleNote(currentStep, nextNoteTime);
    nextNoteTime += STEP;
    currentStep++;
    if (currentStep >= 32) currentStep = 0;
  }
  timerID = setTimeout(scheduler, lookAhead);
}

// ---- Viz callback (optional — caller can use this to drive UI) ----
type VizCallback = (bars: number[], chaosIntensity: number) => void;
let vizCallback: VizCallback | null = null;

export function setVizCallback(cb: VizCallback | null) {
  vizCallback = cb;
}

function animateViz() {
  if (!playing || !analyser || !dataArray) return;
  analyser.getByteFrequencyData(dataArray);

  if (vizCallback) {
    const bars: number[] = [];
    const step = Math.floor(dataArray.length / 16);
    for (let i = 0; i < 16; i++) {
      bars.push(Math.max(2, ((dataArray[i * step] ?? 0) / 255) * 78));
    }
    const intensity = Math.abs(currentChaosLevel - 0.5) * 2;
    vizCallback(bars, intensity);
  }

  animFrame = requestAnimationFrame(animateViz);
}

// ---- Public API ----

export function startMusic(): void {
  if (playing) return;
  if (!params.enabled) return;

  ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(params.masterVolume, ctx.currentTime);
  analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  analyser.connect(masterGain);
  masterGain.connect(ctx.destination);
  dataArray = new Uint8Array(analyser.frequencyBinCount);

  nextNoteTime = ctx.currentTime + 0.05;
  currentStep = 0;
  chaosX = params.chaosInitialX;
  playing = true;
  scheduler();
  animateViz();
}

export function stopMusic(): void {
  if (!playing) return;
  if (timerID !== null) { clearTimeout(timerID); timerID = null; }
  if (animFrame !== null) { cancelAnimationFrame(animFrame); animFrame = null; }
  if (ctx) { ctx.close(); ctx = null; }
  masterGain = null;
  analyser = null;
  dataArray = null;
  playing = false;
  currentChaosLevel = 0;
}

export function isPlaying(): boolean {
  return playing;
}

export function updateParams(next: Partial<MusicParams>): void {
  const prev = params;
  params = { ...params, ...next };

  // Apply master volume live
  if (masterGain && ctx && next.masterVolume !== undefined) {
    masterGain.gain.setValueAtTime(next.masterVolume, ctx.currentTime);
  }

  // enabled toggle: start or stop
  if (next.enabled === false && playing) {
    stopMusic();
  } else if (next.enabled === true && !playing && prev.enabled === false) {
    startMusic();
  }

  // chaosInitialX change: update chaosX immediately for next logistic step
  if (next.chaosInitialX !== undefined) {
    chaosX = next.chaosInitialX;
  }
}

export function getParams(): MusicParams {
  return { ...params };
}

export function resetParams(): void {
  params = defaultParams();
  if (masterGain && ctx) {
    masterGain.gain.setValueAtTime(params.masterVolume, ctx.currentTime);
  }
  chaosX = params.chaosInitialX;
}

export function getCurrentChaosIntensity(): number {
  return Math.abs(currentChaosLevel - 0.5) * 2;
}

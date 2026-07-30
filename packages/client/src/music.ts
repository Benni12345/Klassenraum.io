/**
 * Background music: a calm 8-bar chiptune loop scheduled with Web Audio.
 *
 * Authored in code (like the sprites and the bitmap font) so the CrazyGames
 * build stays dependency- and asset-free. The loop is deliberately sparse and
 * quiet — it should sit under the classroom, not compete with it.
 */

import { isMusicEnabled, isPlatformMuted, musicTarget } from './audio';

const BPM = 96;
const STEP_S = 60 / BPM / 2; // eighth notes
const STEPS_PER_BAR = 8;
const BARS = 8;
const TOTAL_STEPS = BARS * STEPS_PER_BAR;

const LOOKAHEAD_S = 0.7;
const TICK_MS = 180;

interface Chord {
  bass: number;
  tones: [number, number, number];
}

/** Am – Am – F – C – Am – Am – F – G */
const PROGRESSION: readonly Chord[] = [
  { bass: 45, tones: [57, 60, 64] },
  { bass: 45, tones: [57, 60, 64] },
  { bass: 41, tones: [53, 57, 60] },
  { bass: 48, tones: [60, 64, 67] },
  { bass: 45, tones: [57, 60, 64] },
  { bass: 45, tones: [57, 60, 64] },
  { bass: 41, tones: [53, 57, 60] },
  { bass: 43, tones: [55, 59, 62] },
];

/** A-minor-pentatonic motif, one entry per step (0 = rest). */
const MELODY: readonly number[] = [
  // bars 1–2
  69, 0, 72, 0, 76, 0, 0, 74, 72, 0, 69, 0, 0, 0, 0, 0,
  // bars 3–4
  72, 0, 74, 0, 76, 0, 0, 0, 79, 0, 76, 0, 74, 0, 0, 0,
  // bars 5–6
  76, 0, 74, 0, 72, 0, 69, 0, 67, 0, 69, 0, 0, 0, 0, 0,
  // bars 7–8
  72, 0, 72, 0, 74, 0, 76, 0, 79, 0, 0, 0, 76, 0, 0, 0,
];

const ARPEGGIO_ORDER = [0, 1, 2, 1, 0, 2, 1, 2];

function freq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

let timer: number | null = null;
let step = 0;
let nextStepAt = 0;

function note(
  ctx: AudioContext,
  out: GainNode,
  at: number,
  midi: number,
  dur: number,
  type: OscillatorType,
  peak: number,
): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq(midi), at);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.linearRampToValueAtTime(peak, at + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(gain);
  gain.connect(out);
  osc.start(at);
  osc.stop(at + dur + 0.03);
}

function scheduleStep(ctx: AudioContext, out: GainNode, index: number, at: number): void {
  const bar = Math.floor(index / STEPS_PER_BAR) % BARS;
  const inBar = index % STEPS_PER_BAR;
  const chord = PROGRESSION[bar]!;

  if (inBar === 0 || inBar === 4) {
    note(ctx, out, at, chord.bass, STEP_S * 1.6, 'square', 0.035);
  }
  if (inBar === 2 || inBar === 6) {
    const tone = chord.tones[ARPEGGIO_ORDER[inBar]! % 3]!;
    note(ctx, out, at, tone, STEP_S * 1.1, 'triangle', 0.022);
  }
  const mel = MELODY[index % MELODY.length] ?? 0;
  if (mel > 0) {
    note(ctx, out, at, mel, STEP_S * 1.5, 'triangle', 0.03);
  }
}

function tick(): void {
  const target = musicTarget();
  if (!target) return;
  const { ctx, out } = target;
  if (nextStepAt < ctx.currentTime) nextStepAt = ctx.currentTime + 0.05;
  while (nextStepAt < ctx.currentTime + LOOKAHEAD_S) {
    scheduleStep(ctx, out, step, nextStepAt);
    step = (step + 1) % TOTAL_STEPS;
    nextStepAt += STEP_S;
  }
}

function shouldPlay(): boolean {
  return isMusicEnabled() && !isPlatformMuted() && document.visibilityState !== 'hidden';
}

/** Starts or stops the loop to match the current mute / visibility state. */
export function syncMusic(): void {
  if (shouldPlay()) {
    if (timer !== null) return;
    const target = musicTarget();
    if (!target) return;
    nextStepAt = target.ctx.currentTime + 0.08;
    tick();
    timer = window.setInterval(tick, TICK_MS);
  } else if (timer !== null) {
    clearInterval(timer);
    timer = null;
  }
}

export function initMusic(): void {
  document.addEventListener('visibilitychange', syncMusic);
  syncMusic();
}

/**
 * Lightweight Web Audio mixer for Classroom.io.
 *
 * CrazyGames Full Launch requires responding to `SDK.game.settings.muteAudio`.
 * Platform mute always wins over the player's own mute preference.
 */

type Tone = {
  freq: number;
  dur: number;
  type?: OscillatorType;
  gain?: number;
  slide?: number;
};

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let userMuted = false;
let platformMuted = false;
let adMuted = false;

function ensure(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.connect(ctx.destination);
    applyGain();
  }
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
  return ctx;
}

function applyGain(): void {
  if (!master || !ctx) return;
  const muted = platformMuted || adMuted || userMuted;
  master.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, 0.01);
}

/** Host / CrazyGames mute — overrides in-game audio settings. */
export function setPlatformMuted(muted: boolean): void {
  platformMuted = muted;
  applyGain();
}

/** Transient mute while a CrazyGames ad is showing. */
export function setAdMuted(muted: boolean): void {
  adMuted = muted;
  applyGain();
}

/** Optional in-game mute (never unmutes while platformMuted). */
export function setUserMuted(muted: boolean): void {
  userMuted = muted;
  applyGain();
}

export function isEffectivelyMuted(): boolean {
  return platformMuted || adMuted || userMuted;
}

export function isPlatformMuted(): boolean {
  return platformMuted;
}

/** Unlock audio on first gesture (iOS / Chromebook autoplay policy). */
export function unlockAudio(): void {
  ensure();
}

function playTone(t: Tone): void {
  if (isEffectivelyMuted()) return;
  const ac = ensure();
  if (!ac || !master) return;

  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = t.type ?? 'square';
  osc.frequency.setValueAtTime(t.freq, ac.currentTime);
  if (t.slide) {
    osc.frequency.linearRampToValueAtTime(t.freq + t.slide, ac.currentTime + t.dur);
  }
  const g = t.gain ?? 0.04;
  gain.gain.setValueAtTime(g, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + t.dur);
  osc.connect(gain);
  gain.connect(master);
  osc.start();
  osc.stop(ac.currentTime + t.dur + 0.02);
}

export function sfxClick(): void {
  playTone({ freq: 880, dur: 0.05, type: 'square', gain: 0.03 });
}

export function sfxBuy(): void {
  playTone({ freq: 520, dur: 0.08, type: 'triangle', gain: 0.045, slide: 180 });
}

export function sfxSteal(): void {
  playTone({ freq: 340, dur: 0.12, type: 'sawtooth', gain: 0.035, slide: -120 });
}

export function sfxSuccess(): void {
  playTone({ freq: 660, dur: 0.07, type: 'triangle', gain: 0.04 });
  window.setTimeout(() => playTone({ freq: 880, dur: 0.09, type: 'triangle', gain: 0.04 }), 70);
}

export function sfxError(): void {
  playTone({ freq: 180, dur: 0.14, type: 'square', gain: 0.04, slide: -40 });
}

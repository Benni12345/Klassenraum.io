/**
 * Lightweight Web Audio mixer for Classroom.io.
 *
 * Two buses hang off the master gain: short SFX and the background music loop
 * (see `music.ts`). CrazyGames Full Launch requires responding to
 * `SDK.game.settings.muteAudio`, so platform mute always wins over the player's
 * own preferences, and ads mute everything while they play.
 */

import { getPrefs, setPrefs } from './prefs';

type Tone = {
  freq: number;
  dur: number;
  type?: OscillatorType;
  gain?: number;
  slide?: number;
};

const MUSIC_LEVEL = 0.5;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let sfxBus: GainNode | null = null;
let musicBus: GainNode | null = null;
let platformMuted = false;
let adMuted = false;
let sfxEnabled = getPrefs().sfx;
let musicEnabled = getPrefs().music;

function ensure(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.connect(ctx.destination);
    sfxBus = ctx.createGain();
    sfxBus.connect(master);
    musicBus = ctx.createGain();
    musicBus.connect(master);
    applyGain();
  }
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
  return ctx;
}

function applyGain(): void {
  if (!ctx || !master || !sfxBus || !musicBus) return;
  const hardMuted = platformMuted || adMuted;
  const at = ctx.currentTime;
  master.gain.setTargetAtTime(hardMuted ? 0 : 1, at, 0.01);
  sfxBus.gain.setTargetAtTime(sfxEnabled ? 1 : 0, at, 0.01);
  musicBus.gain.setTargetAtTime(musicEnabled ? MUSIC_LEVEL : 0, at, 0.25);
}

/** Audio graph nodes for the music sequencer; null until audio is unlocked. */
export function musicTarget(): { ctx: AudioContext; out: GainNode } | null {
  const ac = ensure();
  if (!ac || !musicBus) return null;
  return { ctx: ac, out: musicBus };
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

export function setSfxEnabled(on: boolean): void {
  sfxEnabled = on;
  setPrefs({ sfx: on });
  applyGain();
}

export function setMusicEnabled(on: boolean): void {
  musicEnabled = on;
  setPrefs({ music: on });
  applyGain();
}

export function isSfxEnabled(): boolean {
  return sfxEnabled;
}

export function isMusicEnabled(): boolean {
  return musicEnabled;
}

export function isEffectivelyMuted(): boolean {
  return platformMuted || adMuted;
}

export function isPlatformMuted(): boolean {
  return platformMuted;
}

/** Unlock audio on first gesture (iOS / Chromebook autoplay policy). */
export function unlockAudio(): void {
  ensure();
}

function playTone(t: Tone): void {
  if (isEffectivelyMuted() || !sfxEnabled) return;
  const ac = ensure();
  if (!ac || !sfxBus) return;

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
  gain.connect(sfxBus);
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

import { getLocale } from './i18n';

const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No'];

/** Idle-game number formatting: 1234 -> "1,23 K" (de) / "1.23 K" (en). */
export function fmt(n: number): string {
  if (!Number.isFinite(n)) return '∞';
  if (n < 0) return '-' + fmt(-n);
  if (n < 1000) {
    return n < 10 && n % 1 !== 0 ? withDecimalSep(n.toFixed(1)) : String(Math.floor(n));
  }
  let tier = Math.floor(Math.log10(n) / 3);
  if (tier >= SUFFIXES.length) {
    return withDecimalSep(n.toExponential(2).replace('e+', 'e'));
  }
  const scaled = n / Math.pow(10, tier * 3);
  const digits = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
  return withDecimalSep(scaled.toFixed(digits)) + ' ' + SUFFIXES[tier];
}

function withDecimalSep(s: string): string {
  return getLocale() === 'de' ? s.replace('.', ',') : s;
}

/** "1h 23m" / "4m 05s" / "37s" */
export function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${String(sec).padStart(2, '0')}s`;
  return `${sec}s`;
}

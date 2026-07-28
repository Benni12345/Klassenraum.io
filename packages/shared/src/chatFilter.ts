/**
 * Lightweight English/German profanity list for chat moderation
 * (CrazyGames Full Launch requirement when chat is enabled).
 * Match whole words only; keep short to avoid false positives.
 */
const BLOCKED = [
  'fuck',
  'fucking',
  'fucker',
  'shit',
  'asshole',
  'bitch',
  'bastard',
  'cunt',
  'nigger',
  'nigga',
  'faggot',
  'retard',
  'whore',
  'slut',
  'dickhead',
  'motherfucker',
  'scheiße',
  'scheisse',
  'arschloch',
  'fotze',
  'hure',
  'hurensohn',
  'wichser',
  'schwuchtel',
  'kanake',
];

const PATTERN = new RegExp(
  `\\b(?:${BLOCKED.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`,
  'iu',
);

/** Returns text with blocked words replaced by asterisks, or null if empty after clean. */
export function moderateChat(text: string): string {
  return text.replace(PATTERN, (m) => '*'.repeat(Math.min(m.length, 8)));
}

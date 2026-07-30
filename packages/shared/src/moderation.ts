/**
 * Profanity moderation for chat ("passed notes") and usernames.
 *
 * CrazyGames requires a profanity filter on chat / UGC and on any username the
 * player can choose. The matcher is deliberately evasion-tolerant:
 *
 * - diacritics are folded (`schëiße` -> `scheisse`)
 * - leetspeak is folded (`sh1t`, `f4g`, `@ss`)
 * - repeated letters collapse (`fuuuuck`)
 * - up to two separators are allowed between letters (`f.u.c.k`, `s h i t`)
 *
 * Terms are split in two buckets to keep false positives low:
 *
 * - `SEVERE` matches anywhere in a word (`xXfuckerXx`), guarded by an allow list
 *   for innocent words that happen to contain them (`therapist`, `Scunthorpe`).
 * - `MILD` only matches as a whole word, because the stems are short and appear
 *   inside ordinary words (`ass` in `class`, `meth` in `method`).
 */

/** Matched anywhere inside a word. Long, unambiguous stems only. */
const SEVERE: readonly string[] = [
  // English — sexual / scatological
  'fuck', 'fuk', 'fcuk', 'phuck', 'fuking', 'fucking', 'fucker', 'motherfucker',
  'shit', 'bullshit', 'shitty', 'dipshit', 'shithead', 'horseshit',
  'bitch', 'biatch', 'bitches', 'asshole', 'arsehole', 'assclown', 'dumbass',
  'bastard', 'cunt', 'kunt', 'dickhead', 'cocksucker', 'cockhead',
  'whore', 'slut', 'skank', 'nympho',
  'blowjob', 'handjob', 'rimjob', 'jerkoff', 'jackoff', 'masturbat',
  'wanker', 'twat', 'pussy', 'pussies', 'penis', 'vagina', 'clitoris',
  'dildo', 'buttplug', 'buttfuck', 'assfuck', 'fisting', 'felching',
  'ejaculat', 'fellatio', 'cunnilingus', 'creampie', 'gangbang', 'bukkake',
  'cumshot', 'cumslut', 'deepthroat', 'strapon', 'anilingus',
  'bestiality', 'zoophil', 'pedophil', 'paedophil', 'molester', 'rapist',
  'incest', 'necrophil', 'coprophil', 'pornhub', 'xvideos', 'xhamster',
  'camwhore', 'prostitut', 'whorehouse', 'brothel',
  // English — slurs and hate
  'nigger', 'nigga', 'niggas', 'niggers', 'negroid', 'jigaboo', 'darkie',
  'wetback', 'sandnigger', 'towelhead', 'raghead', 'beaner', 'chinaman',
  'faggot', 'fagget', 'fggot', 'shemale', 'tranny', 'trannie', 'ladyboy',
  'retarded', 'retards', 'mongoloid', 'cripple',
  'holocaust', 'hitler', 'nazi', 'swastika', 'whitepower', 'heilhitler',
  'killyourself', 'killurself', 'kysnow',
  // German
  'scheisse', 'scheissdreck', 'arschloch', 'arschgeige', 'arschficker',
  'fotze', 'hurensohn', 'hurentochter', 'wichser', 'wichsen', 'schwuchtel',
  'kanake', 'kanacke', 'missgeburt', 'vollidiot', 'schwanzlutscher',
  'ficken', 'fickdich', 'verpissdich', 'pimmel', 'muschi', 'titten',
  'schlampe', 'hodensack', 'judensau', 'nazischwein', 'spastiker',
  // French
  'putain', 'salope', 'connard', 'conasse', 'enculer', 'encule', 'foutre',
  'batard', 'nique', 'niquer',
  // Spanish / Portuguese
  'mierda', 'cabron', 'pendejo', 'gilipollas', 'maricon', 'hijodeputa',
  'chingar', 'chinga', 'culero', 'caralho', 'buceta', 'filhadaputa',
  'putinha', 'cacete',
  // Italian
  'cazzo', 'stronzo', 'vaffanculo', 'coglione', 'figliodiputtana', 'merda',
  // Dutch
  'klootzak', 'neuken', 'kutwijf', 'oprotten',
  // Polish
  'kurwa', 'jebac', 'jebany', 'pierdol', 'spierdalaj', 'skurwysyn', 'chuj',
  // Russian (transliterated)
  'blyat', 'blyad', 'pizda', 'pizdec', 'mudak', 'zaebal', 'ebanyi',
  // Turkish
  'orospu', 'sikerim', 'sikeyim', 'yavsak', 'amina',
  // Misc spam / scam terms QA also flags in UGC
  'freerobux', 'freevbucks', 'crypto scam',
];

/** Matched as a whole word only — short stems that live inside normal words. */
const MILD: readonly string[] = [
  'ass', 'arse', 'anus', 'anal', 'cum', 'cums', 'jizz', 'spunk', 'smegma',
  'dick', 'dicks', 'cock', 'cocks', 'knob', 'prick', 'balls', 'nuts',
  'tit', 'tits', 'titty', 'titties', 'boob', 'boobs', 'nipple', 'nipples',
  'damn', 'goddamn', 'crap', 'piss', 'pissed', 'poop', 'turd', 'fart',
  'wtf', 'stfu', 'omfg', 'ffs', 'lmfao', 'kys', 'gtfo',
  'hoe', 'hoes', 'ho', 'slag', 'tramp', 'bimbo', 'bugger', 'bollocks',
  'tosser', 'minge', 'shag', 'snatch', 'queef', 'milf', 'dilf', 'thot',
  'incel', 'simp', 'coomer',
  'fag', 'fags', 'homo', 'queer', 'dyke', 'lesbo', 'lezzie', 'twink',
  'chink', 'gook', 'spic', 'kike', 'paki', 'wop', 'coon', 'coons', 'negro',
  'dago', 'honky', 'cracka', 'gypsy', 'gyppo',
  'retard', 'spaz', 'spastic', 'idiot', 'moron', 'imbecile',
  'sex', 'sexy', 'porn', 'porno', 'xxx', 'nude', 'nudes', 'horny', 'orgasm',
  'orgy', 'hooker', 'escort', 'stripper', 'condom', 'viagra', 'hentai',
  'rape', 'raped', 'rapes', 'raping', 'isis', 'jihad', 'terrorist',
  'meth', 'cocaine', 'heroin', 'weed', 'crackhead',
  // German
  'arsch', 'hure', 'huren', 'nutte', 'sau', 'kacke', 'pisse', 'furz',
  'fick', 'fickt', 'schwul', 'lesbe', 'mongo', 'spast', 'spasti', 'penner',
  'wixer', 'neger', 'negerin', 'trottel', 'depp', 'blöd', 'bloed',
  // Dutch / Nordic / other short stems
  'kut', 'hoer', 'kanker', 'lort', 'fitte', 'kuk', 'jävla', 'javla',
  'puta', 'pute', 'puto', 'foda', 'fodase', 'porra', 'viado', 'corno',
  'suka', 'huy', 'ebat', 'amk', 'sikim', 'troia', 'figa', 'zoccola',
];

/**
 * Innocent words that contain a SEVERE stem. Matches fully inside one of these
 * are ignored (the classic "Scunthorpe problem").
 */
const ALLOW: readonly string[] = [
  'scunthorpe', 'penistone', 'clitheroe', 'lightwater',
  'therapist', 'therapy', 'therapeutic',
  'shiitake', 'shitake',
  'cockpit', 'cocktail', 'cockroach', 'cockerel', 'peacock', 'shuttlecock',
  'hancock', 'woodcock', 'stopcock', 'cockney',
  'dickens', 'dickinson', 'dictionary', 'dictator',
  'titan', 'titanic', 'titanium', 'titration',
  'nazareth', 'nazarene',
  'homogeneous', 'homogenous', 'homosapiens', 'homework',
  'analysis', 'analyse', 'analyze', 'analytic', 'analogue', 'analog',
  'assassin', 'assassinate',
  'grape', 'grapes', 'drape', 'scrape', 'trapeze',
  'sussex', 'essex', 'middlesex', 'sexton', 'sextant',
  'mercury', 'method', 'methodical', 'methane', 'methodist',
  'reputation', 'computer', 'dispute', 'deputy', 'amputate',
  'debate', 'debated', 'rebate',
  'kanker bestrijding', 'kankerbestrijding',
];

// ---------------------------------------------------------------------------
// Character folding (1 input code point -> exactly 1 output char)

/** Non-decomposable letters that still need folding. */
const FOLD: Record<string, string> = {
  ß: 's',
  ø: 'o',
  æ: 'a',
  œ: 'o',
  đ: 'd',
  ð: 'd',
  þ: 't',
  ł: 'l',
  ı: 'i',
  ȷ: 'j',
};

/** Leetspeak and homoglyph folding. */
const LEET: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '6': 'g',
  '7': 't',
  '8': 'b',
  '9': 'g',
  '@': 'a',
  $: 's',
  '!': 'i',
  '|': 'l',
  '+': 't',
  '¡': 'i',
  '£': 'l',
  '€': 'e',
  '§': 's',
};

function foldChar(ch: string): string {
  const lower = ch.toLowerCase();
  const direct = FOLD[lower];
  if (direct) return direct;
  const base = lower.normalize('NFD').replace(/[\u0300-\u036f]/g, '')[0] ?? lower;
  const leet = LEET[base];
  if (leet) return leet;
  return /^[a-z0-9]$/.test(base) ? base : ' ';
}

/** Folds text to a same-length (per code point) lowercase a-z / space form. */
function fold(chars: readonly string[]): string {
  let out = '';
  for (const ch of chars) out += foldChar(ch);
  return out;
}

// ---------------------------------------------------------------------------
// Pattern compilation

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** `ass` -> `as`, `scheisse` -> `scheise` so both spellings match one pattern. */
function collapse(word: string): string[] {
  const out: string[] = [];
  for (const ch of word) {
    if (/[a-z0-9]/.test(ch) && out[out.length - 1] !== ch) out.push(ch);
  }
  return out;
}

const GAP = '[^a-z]{0,2}';

function compile(word: string, wholeWord: boolean): RegExp | null {
  const letters = collapse(fold([...word]));
  if (letters.length < 2) return null;
  const body = letters.map((c) => `${escapeRe(c)}+`).join(GAP);
  const src = wholeWord ? `(?<![a-z])${body}(?![a-z])` : body;
  return new RegExp(src, 'g');
}

let severeRes: RegExp[] | null = null;
let mildRes: RegExp[] | null = null;
let allowRes: RegExp[] | null = null;

function patterns(): { severe: RegExp[]; mild: RegExp[]; allow: RegExp[] } {
  if (!severeRes || !mildRes || !allowRes) {
    severeRes = SEVERE.map((w) => compile(w, false)).filter((r): r is RegExp => r !== null);
    mildRes = MILD.map((w) => compile(w, true)).filter((r): r is RegExp => r !== null);
    allowRes = ALLOW.map((w) => compile(w, false)).filter((r): r is RegExp => r !== null);
  }
  return { severe: severeRes, mild: mildRes, allow: allowRes };
}

interface Range {
  start: number;
  end: number;
}

function findAll(folded: string, res: readonly RegExp[]): Range[] {
  const out: Range[] = [];
  for (const re of res) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(folded)) !== null) {
      if (m[0].length === 0) {
        re.lastIndex += 1;
        continue;
      }
      out.push({ start: m.index, end: m.index + m[0].length });
    }
  }
  return out;
}

/** Ranges of blocked terms in the folded text, honouring the allow list. */
function blockedRanges(folded: string): Range[] {
  const { severe, mild, allow } = patterns();
  const hits = findAll(folded, severe);
  const kept = hits.length > 0 ? dropAllowed(folded, hits, allow) : hits;
  return [...kept, ...findAll(folded, mild)].sort((a, b) => a.start - b.start);
}

function dropAllowed(folded: string, hits: Range[], allow: readonly RegExp[]): Range[] {
  const safe = findAll(folded, allow);
  if (safe.length === 0) return hits;
  return hits.filter((h) => !safe.some((s) => h.start >= s.start && h.end <= s.end));
}

// ---------------------------------------------------------------------------
// Public API

/** True when the text contains a blocked term (chat, usernames, any UGC). */
export function containsProfanity(text: string): boolean {
  if (typeof text !== 'string' || text.length === 0) return false;
  return blockedRanges(fold([...text])).length > 0;
}

/** Replaces blocked terms with asterisks, preserving surrounding text. */
export function moderateText(text: string): string {
  if (typeof text !== 'string' || text.length === 0) return text;
  const chars = [...text];
  const ranges = blockedRanges(fold(chars));
  if (ranges.length === 0) return text;
  for (const r of ranges) {
    for (let i = r.start; i < r.end && i < chars.length; i++) chars[i] = '*';
  }
  return chars.join('');
}

/** Chat moderation: mask blocked words in a passed note. */
export function moderateChat(text: string): string {
  return moderateText(text);
}

/** Username moderation: usernames are rejected outright, never masked. */
export function isCleanUsername(name: string): boolean {
  return !containsProfanity(name);
}

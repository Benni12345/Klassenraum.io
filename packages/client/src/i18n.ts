export type Locale = 'de' | 'en';

type Dict = Record<string, string>;

const de: Dict = {
  'game.title': 'Klassenraum.io',
  unit: 'HS',
  'unit.long': 'Hirnschmalz',
  'hud.perSec': '{v} HS/s',
  'hud.click': '+{v} pro Klick',

  'shop.title': 'Schulkiosk',
  'shop.click': 'Mitschreiben!',
  'shop.upgrades': 'Upgrades',
  'shop.buyLabel': 'Kaufen:',
  'shop.max': 'Max',
  'shop.tip.owned': 'Besitzt',
  'shop.tip.each': 'Pro Stück',
  'shop.tip.total': 'Gesamt',
  'shop.tip.buy': 'Kauf',
  'shop.tip.base': 'Basis-Produktion',
  'shop.tip.locked': 'Noch gesperrt — kauf zuerst die vorherige Stufe.',
  'shop.tip.cantAfford': 'Nicht genug Hirnschmalz!',

  'gen.pencil.name': 'Bleistiftstummel',
  'gen.pencil.flavor': 'Angekaut, aber fleißig.',
  'gen.notes.name': 'Klebezettel',
  'gen.notes.flavor': 'Klebt an jeder Lösung.',
  'gen.calc.name': 'Taschenrechner',
  'gen.calc.flavor': 'Kann sogar Wurzeln.',
  'gen.group.name': 'Lerngruppe',
  'gen.group.flavor': 'Vier Gehirne, ein Ziel.',
  'gen.cheat.name': 'Spickzettel',
  'gen.cheat.flavor': 'Streng geheim!',
  'gen.espresso.name': 'Espressomaschine',
  'gen.espresso.flavor': 'Unterm Tisch. Sehr effektiv.',
  'gen.bot.name': 'Hausaufgaben-Bot',
  'gen.bot.flavor': 'Arbeitet, während du schläfst.',
  'gen.timeturner.name': 'Zeitumkehrer',
  'gen.timeturner.flavor': 'Hausaufgaben in drei Zeitlinien.',
  'gen.brain.name': 'Galaxienhirn',
  'gen.brain.flavor': 'Denkt in Dimensionen ohne Noten.',

  'upgrade.gen.name': '{gen} ×2',
  'upgrade.gen.desc': 'Alle {gen} produzieren doppelt so viel. (ab {n} Stück)',
  'upgrade.click0.name': 'Druckbleistift',
  'upgrade.click1.name': 'Turbo-Kuli',
  'upgrade.click2.name': 'Diamantfüller',
  'upgrade.click.desc': 'Mitschreiben bringt doppelt so viel.',
  'upgrade.tip.reqGen': 'Voraussetzung: {n}× {gen}',
  'upgrade.tip.reqClicks': 'Voraussetzung: {n} Klicks',
  'upgrade.tip.cost': 'Kosten',
  'upgrade.tip.cantAfford': 'Nicht genug Hirnschmalz!',
  'upgrade.tip.effect': 'Effekt',
  'upgrade.tip.requirement': 'Voraussetzung',

  'steal.throw': 'Papierflieger werfen',
  'steal.steals': 'klaut ca. {v} HS',
  'steal.cooldown': 'Wieder bereit in {t}',
  'steal.risky': 'Lehrer unterwegs! 50% Risiko: Nachsitzen',
  'steal.sleeping': 'Schläft… (geschützt)',
  'steal.self': 'Das bist du!',
  'steal.success': 'Du hast {v} HS von {b} geklaut!',
  'steal.hit.you': '{a} hat dir {v} HS geklaut!',
  'steal.hit.other': '{a} klaut {v} HS von {b}!',
  'steal.caught.you': 'Erwischt! Nachsitzen: 90 s nur 25% Produktion.',
  'steal.caught.other': '{a} wurde beim Werfen erwischt!',

  'event.quiz.title': 'KURZTEST!',
  'event.quiz.prompt': 'Antwort…',
  'event.quiz.submit': 'Abgeben',
  'event.quiz.sent': 'Abgegeben!',
  'event.quiz.win': 'Richtig! Extra-HS und ×2 für 2 min',
  'event.quiz.result': 'Kurztest vorbei! Lösung: {a} — {n} Schüler richtig.',
  'event.patrol.banner': 'LEHRER-RUNDGANG — Papierflieger sind riskant!',
  'event.sub.banner': 'VERTRETUNGSSTUNDE — alle ×2!',

  'goal.title': 'KLASSENZIEL',
  'goal.done': 'Klassenziel geschafft! Hausaufgabenfrei: ×3 für 5 min!',

  'prestige.button': 'Versetzung',
  'prestige.title': 'Versetzung beantragen',
  'prestige.desc':
    'Setzt Hirnschmalz, Käufe und Upgrades zurück. Dafür bekommst du {n} Goldsterne — jeder gibt +10% Produktion, für immer.',
  'prestige.locked': 'Noch {v} HS in dieser Runde bis zum ersten Goldstern.',
  'prestige.confirm': 'Versetzen!',
  'prestige.cancel': 'Doch nicht',
  'prestige.done': 'Versetzt! Willkommen in der {g}!',

  'grade.n': '{n}. Klasse',
  'grade.uni': 'Uni',
  'grade.prof': 'Prof',

  'leaderboard.title': 'Bestenliste',
  'leaderboard.lifetime': 'Gesamt-HS',
  'leaderboard.online': 'da',

  'chat.placeholder': 'Zettel schreiben…',
  'chat.send': 'Senden',
  'chat.title': 'Zettel',

  'join.title': 'Willkommen im Klassenraum!',
  'join.sub': 'Alle Spieler sitzen im selben Raum. Such dir einen Look aus:',
  'join.name': 'Dein Name',
  'join.start': 'Platz nehmen',
  'join.skin': 'Haut',
  'join.hair': 'Frisur',
  'join.hairColor': 'Haarfarbe',
  'join.shirt': 'Shirt',

  'settings.title': 'Einstellungen',
  'settings.lang': 'Sprache',
  'settings.stats': 'Statistik',
  'settings.stolen': 'Geklaut: {v} HS',
  'settings.lost': 'Verloren: {v} HS',
  'settings.clicks': 'Klicks: {v}',
  'settings.boss': 'Boss-Taste: Esc tarnt das Spiel als Mathe-Notizen.',
  'settings.rename': 'Name ändern',
  'settings.renameSave': 'Speichern',

  'conn.lost': 'Verbindung verloren — verbinde neu…',
  'conn.replaced': 'Der Klassenraum ist in einem anderen Tab geöffnet.',
  'conn.playHere': 'Hier weiterspielen',
  'conn.failed': 'Spielserver nicht erreichbar: {url}',
  'conn.failedVercel':
    'Auf Vercel läuft nur die Webseite — der Spielserver muss woanders laufen (Railway, Fly.io, …). Trage die WebSocket-URL in config.json oder VITE_WS_URL ein. Versucht: {url}',
  'conn.retry': 'Erneut verbinden',

  'offline.toast': 'Willkommen zurück! Dein Platz hat {v} HS erarbeitet ({t}).',

  'err.poor': 'Nicht genug Hirnschmalz!',
  'err.cooldown': 'Papierflieger noch nicht bereit!',
  'err.detention': 'Du sitzt nach!',
  'err.target': 'Ziel nicht verfügbar.',
  'err.prestige': 'Noch nicht genug für eine Versetzung.',

  'buff.quiz': 'Kurztest bestanden ×2',
  'buff.sub': 'Vertretungsstunde ×2',
  'buff.goal': 'Hausaufgabenfrei ×3',
  'buff.detention': 'Nachsitzen ×0,25',

  'misc.myDesk': 'Mein Platz',
  'misc.you': 'Du',
  'misc.sleeping': 'schläft',
  'misc.stars': 'Goldsterne',
  'misc.onHand': 'auf der Hand',

  'boss.title': 'Mathe – Notizen',
  'boss.hint': 'Esc zum Zurückkehren',
};

const en: Dict = {
  'game.title': 'Klassenraum.io',
  unit: 'BP',
  'unit.long': 'Brainpower',
  'hud.perSec': '{v} BP/s',
  'hud.click': '+{v} per click',

  'shop.title': 'School Kiosk',
  'shop.click': 'Take notes!',
  'shop.upgrades': 'Upgrades',
  'shop.buyLabel': 'Buy:',
  'shop.max': 'Max',
  'shop.tip.owned': 'Owned',
  'shop.tip.each': 'Per unit',
  'shop.tip.total': 'Total',
  'shop.tip.buy': 'Purchase',
  'shop.tip.base': 'Base production',
  'shop.tip.locked': 'Locked — buy the previous tier first.',
  'shop.tip.cantAfford': 'Not enough brainpower!',

  'gen.pencil.name': 'Stubby Pencil',
  'gen.pencil.flavor': 'Chewed on, but diligent.',
  'gen.notes.name': 'Sticky Notes',
  'gen.notes.flavor': 'Sticks to every solution.',
  'gen.calc.name': 'Calculator',
  'gen.calc.flavor': 'Even does square roots.',
  'gen.group.name': 'Study Group',
  'gen.group.flavor': 'Four brains, one goal.',
  'gen.cheat.name': 'Cheat Sheet',
  'gen.cheat.flavor': 'Top secret!',
  'gen.espresso.name': 'Espresso Machine',
  'gen.espresso.flavor': 'Under the desk. Very effective.',
  'gen.bot.name': 'Homework Bot',
  'gen.bot.flavor': 'Works while you sleep.',
  'gen.timeturner.name': 'Time-Turner',
  'gen.timeturner.flavor': 'Homework in three timelines.',
  'gen.brain.name': 'Galaxy Brain',
  'gen.brain.flavor': 'Thinks in dimensions beyond grades.',

  'upgrade.gen.name': '{gen} ×2',
  'upgrade.gen.desc': 'All {gen} produce twice as much. (needs {n})',
  'upgrade.click0.name': 'Mechanical Pencil',
  'upgrade.click1.name': 'Turbo Pen',
  'upgrade.click2.name': 'Diamond Fountain Pen',
  'upgrade.click.desc': 'Taking notes yields twice as much.',
  'upgrade.tip.reqGen': 'Requires: {n}× {gen}',
  'upgrade.tip.reqClicks': 'Requires: {n} clicks',
  'upgrade.tip.cost': 'Cost',
  'upgrade.tip.cantAfford': 'Not enough brainpower!',
  'upgrade.tip.effect': 'Effect',
  'upgrade.tip.requirement': 'Requires',

  'steal.throw': 'Throw paper airplane',
  'steal.steals': 'steals ~{v} BP',
  'steal.cooldown': 'Ready again in {t}',
  'steal.risky': 'Teacher on patrol! 50% risk: detention',
  'steal.sleeping': 'Sleeping… (protected)',
  'steal.self': "That's you!",
  'steal.success': 'You stole {v} BP from {b}!',
  'steal.hit.you': '{a} stole {v} BP from you!',
  'steal.hit.other': '{a} steals {v} BP from {b}!',
  'steal.caught.you': 'Caught! Detention: 90 s at 25% production.',
  'steal.caught.other': '{a} got caught throwing!',

  'event.quiz.title': 'POP QUIZ!',
  'event.quiz.prompt': 'Answer…',
  'event.quiz.submit': 'Submit',
  'event.quiz.sent': 'Submitted!',
  'event.quiz.win': 'Correct! Bonus BP and ×2 for 2 min',
  'event.quiz.result': 'Quiz over! Answer: {a} — {n} students got it.',
  'event.patrol.banner': 'TEACHER PATROL — paper airplanes are risky!',
  'event.sub.banner': 'SUBSTITUTE TEACHER — everyone ×2!',

  'goal.title': 'CLASS GOAL',
  'goal.done': 'Class goal reached! No homework: ×3 for 5 min!',

  'prestige.button': 'Graduate',
  'prestige.title': 'Request promotion',
  'prestige.desc':
    'Resets brainpower, purchases and upgrades. In return you get {n} gold stars — each gives +10% production, forever.',
  'prestige.locked': '{v} BP left this run until your first gold star.',
  'prestige.confirm': 'Graduate!',
  'prestige.cancel': 'Not yet',
  'prestige.done': 'Promoted! Welcome to {g}!',

  'grade.n': 'Grade {n}',
  'grade.uni': 'College',
  'grade.prof': 'Professor',

  'leaderboard.title': 'Leaderboard',
  'leaderboard.lifetime': 'Lifetime BP',
  'leaderboard.online': 'here',

  'chat.placeholder': 'Pass a note…',
  'chat.send': 'Send',
  'chat.title': 'Notes',

  'join.title': 'Welcome to the classroom!',
  'join.sub': 'Everyone plays in the same room. Pick your look:',
  'join.name': 'Your name',
  'join.start': 'Take a seat',
  'join.skin': 'Skin',
  'join.hair': 'Hair',
  'join.hairColor': 'Hair color',
  'join.shirt': 'Shirt',

  'settings.title': 'Settings',
  'settings.lang': 'Language',
  'settings.stats': 'Stats',
  'settings.stolen': 'Stolen: {v} BP',
  'settings.lost': 'Lost: {v} BP',
  'settings.clicks': 'Clicks: {v}',
  'settings.boss': 'Boss key: Esc disguises the game as math notes.',
  'settings.rename': 'Change name',
  'settings.renameSave': 'Save',

  'conn.lost': 'Connection lost — reconnecting…',
  'conn.replaced': 'The classroom is open in another tab.',
  'conn.playHere': 'Play here',
  'conn.failed': 'Game server unreachable: {url}',
  'conn.failedVercel':
    'Vercel only hosts the website — the game server must run elsewhere (Railway, Fly.io, …). Set the WebSocket URL in config.json or VITE_WS_URL. Tried: {url}',
  'conn.retry': 'Reconnect',

  'offline.toast': 'Welcome back! Your desk earned {v} BP ({t}).',

  'err.poor': 'Not enough brainpower!',
  'err.cooldown': 'Paper airplane not ready yet!',
  'err.detention': "You're in detention!",
  'err.target': 'Target unavailable.',
  'err.prestige': 'Not enough for a promotion yet.',

  'buff.quiz': 'Quiz passed ×2',
  'buff.sub': 'Substitute ×2',
  'buff.goal': 'No homework ×3',
  'buff.detention': 'Detention ×0.25',

  'misc.myDesk': 'My desk',
  'misc.you': 'You',
  'misc.sleeping': 'sleeping',
  'misc.stars': 'Gold stars',
  'misc.onHand': 'on hand',

  'boss.title': 'Math – Notes',
  'boss.hint': 'Esc to return',
};

const DICTS: Record<Locale, Dict> = { de, en };

let locale: Locale = (localStorage.getItem('kr_lang') as Locale) || 'de';

export function getLocale(): Locale {
  return locale;
}

export function setLocale(l: Locale): void {
  locale = l;
  localStorage.setItem('kr_lang', l);
}

export function t(key: string, params?: Record<string, string | number>): string {
  let s = DICTS[locale][key] ?? DICTS.de[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
  }
  return s;
}

/** Grade badge label from graduation count. */
export function gradeLabel(grade: number): string {
  if (grade >= 14) return t('grade.prof');
  if (grade >= 13) return t('grade.uni');
  return t('grade.n', { n: grade + 1 });
}

import { getPrefs, setPrefs } from './prefs';

export type Locale = 'de' | 'en';

export const DEFAULT_LOCALE: Locale = 'en';
export const LOCALES: readonly Locale[] = ['en', 'de'];

type Dict = Record<string, string>;

const de: Dict = {
  'game.title': 'Classroom.io',
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
  'prestige.warn':
    'Achtung: Eine Versetzung setzt deinen Fortschritt zurück. Hirnschmalz, alle Generatoren und alle Upgrades dieser Runde sind weg. Goldsterne und Klassenstufe behältst du.',
  'prestige.locked': 'Noch {v} HS in dieser Runde bis zum ersten Goldstern.',
  'prestige.lockedNear':
    'Fast geschafft — sammle noch ein bisschen Hirnschmalz in dieser Runde für deinen ersten Goldstern.',
  'prestige.lockedHint':
    'Goldsterne bekommst du durch Versetzung (dieses Menü). Das Klassenziel ist getrennt: Bei 100 % gibt es einen kurzen Klassen-Bonus (×3), keinen Goldstern.',
  'prestige.confirm': 'Versetzen!',
  'prestige.cancel': 'Doch nicht',
  'prestige.yes': 'Ja, versetzen',
  'prestige.no': 'Nein',
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
  'settings.boss': 'Boss-Taste: Tab tarnt das Spiel als Mathe-Notizen.',
  'settings.rename': 'Name ändern',
  'settings.renameSave': 'Speichern',
  'settings.audio': 'Ton',
  'settings.music': 'Musik',
  'settings.sfx': 'Soundeffekte',
  'settings.on': 'An',
  'settings.off': 'Aus',
  'settings.name': 'Spielername',
  'settings.nameCg': 'Dein CrazyGames-Benutzername wird automatisch verwendet.',
  'settings.nameGuest': 'Melde dich bei CrazyGames an, um deinen Benutzernamen zu nutzen.',
  'settings.howto': 'Spielanleitung',
  'settings.tutorial': 'Tutorial erneut ansehen',
  'settings.legal': 'Rechtliches',

  'conn.lost': 'Verbindung verloren — verbinde neu…',
  'conn.replaced': 'Der Klassenraum ist in einem anderen Tab geöffnet.',
  'conn.playHere': 'Hier weiterspielen',

  'offline.toast': 'Willkommen zurück! Dein Platz hat {v} HS erarbeitet ({t}).',

  'err.poor': 'Nicht genug Hirnschmalz!',
  'err.cooldown': 'Papierflieger noch nicht bereit!',
  'err.adCooldown': 'Bonus-Werbung noch in Abklingzeit.',
  'err.detention': 'Du sitzt nach!',
  'err.target': 'Ziel nicht verfügbar.',
  'err.prestige': 'Noch nicht genug für eine Versetzung.',
  'err.nameLocked': 'Dein CrazyGames-Benutzername wird automatisch verwendet.',
  'err.nameBlocked': 'Dieser Name ist nicht erlaubt. Bitte wähle einen anderen.',

  'buff.quiz': 'Kurztest bestanden ×2',
  'buff.sub': 'Vertretungsstunde ×2',
  'buff.goal': 'Hausaufgabenfrei ×3',
  'buff.detention': 'Nachsitzen ×0,25',
  'buff.ad': 'Werbung ×2',
  'settings.adBoost': '+10 % Einkommen (Werbung)',
  'settings.adBoostDone': '+{n} HS — 10 % deines Einkommens!',
  'settings.adBoostFail': 'Gerade keine Werbung verfügbar.',
  'settings.adBoostCooldown': 'Bonus in {t}',
  'settings.adBoostAdblock': 'Werbung blockiert — AdBlocker ausschalten.',
  'ads.boostHint': 'Optional: Video ansehen für 10 % deines Einkommens sofort',
  'ads.adblockHint': 'AdBlocker erkannt — Bonus-Werbung gesperrt',
  'ads.watching': 'Werbung läuft…',
  'settings.cgLogin': 'Mit CrazyGames anmelden',
  'settings.cgLoginHint': 'Fortschritt geräteübergreifend speichern',

  'misc.myDesk': 'Mein Platz',
  'misc.you': 'Du',
  'misc.sleeping': 'schläft',
  'misc.stars': 'Goldsterne',
  'misc.onHand': 'auf der Hand',

  'footer.tagline':
    'Classroom.io — kostenloses Multiplayer-Idle-Game. Alle sitzen im selben Klassenraum.',
  'footer.about': 'Über uns',
  'footer.guide': 'Spielanleitung',
  'footer.privacy': 'Datenschutz',
  'footer.impressum': 'Impressum',

  'boss.title': 'Mathe – Notizen',
  'boss.hint': 'Tab zum Zurückkehren',
  'boss.meta': 'Zuletzt bearbeitet: heute',
  'boss.menu.file': 'Datei',
  'boss.menu.edit': 'Bearbeiten',
  'boss.menu.view': 'Ansicht',
  'boss.menu.insert': 'Einfügen',
  'boss.menu.format': 'Format',
  'boss.menu.tools': 'Extras',
  'boss.h1': 'Quadratische Funktionen – Zusammenfassung',
  'boss.p1.label': 'Allgemeine Form:',
  'boss.p1.body': 'f(x) = ax² + bx + c\u00a0(a ≠ 0)',
  'boss.p2.label': 'Scheitelpunktform:',
  'boss.p2.body': 'f(x) = a(x − d)² + e, Scheitel S(d | e)',
  'boss.li1': 'a > 0: Parabel nach oben geöffnet, a < 0: nach unten',
  'boss.li2': '|a| > 1: gestreckt, |a| < 1: gestaucht',
  'boss.li3': 'Nullstellen über Mitternachtsformel: x = (−b ± √(b² − 4ac)) / 2a',
  'boss.li4': 'Diskriminante D = b² − 4ac entscheidet über Anzahl der Nullstellen',
  'boss.ex.label': 'Beispiel:',
  'boss.ex.body': 'f(x) = 2x² − 4x + 1',
  'boss.ex2': '⇒ f(x) = 2(x − 1)² − 1, Scheitel S(1 | −1), D = 8 > 0 ⇒ zwei Nullstellen',

  'ui.close': 'Schließen',
  'ui.back': 'Zurück',

  'howto.title': 'Spielanleitung',
  'howto.notes.h': '1. Mitschreiben',
  'howto.notes.p':
    'Klick auf „Mitschreiben!“ (oder drück Leertaste), um Hirnschmalz zu sammeln. Je höher deine Produktion, desto mehr bringt ein Klick.',
  'howto.shop.h': '2. Schulkiosk',
  'howto.shop.p':
    'Kauf im Schulkiosk Generatoren — vom Bleistiftstummel bis zum Galaxienhirn. Sie produzieren automatisch weiter, auch offline (bis zu 8 Stunden).',
  'howto.upgrades.h': '3. Upgrades',
  'howto.upgrades.p':
    'Ab genügend Generatoren oder Klicks erscheinen Upgrades über dem Kiosk. Jedes verdoppelt eine Produktion dauerhaft.',
  'howto.steal.h': '4. Papierflieger',
  'howto.steal.p':
    'Alle Spieler sitzen im selben Klassenraum. Klick auf einen anderen Platz, um mit einem Papierflieger Hirnschmalz zu klauen. Beim Lehrer-Rundgang ist das riskant.',
  'howto.events.h': '5. Klassen-Events',
  'howto.events.p':
    'Kurztest, Lehrer-Rundgang und Vertretungsstunde treffen alle gleichzeitig. Beim Kurztest bringt die richtige Antwort Bonus und ×2.',
  'howto.goal.h': '6. Klassenziel',
  'howto.goal.p':
    'Alles Hirnschmalz der ganzen Klasse zählt fürs Klassenziel. Bei 100 % gibt es Hausaufgabenfrei: ×3 Produktion für alle — das ist kein Goldstern.',
  'howto.prestige.h': '7. Versetzung',
  'howto.prestige.p':
    'Mit genug Hirnschmalz kannst du dich versetzen lassen: Die Runde startet neu, du behältst Goldsterne für dauerhaft mehr Produktion.',
  'howto.boss.h': '8. Boss-Taste',
  'howto.boss.p': 'Tab tarnt das Spiel als Mathe-Notizen. Noch mal Tab bringt dich zurück.',

  'tutorial.skip': 'Tutorial überspringen',
  'tutorial.next': 'Weiter',
  'tutorial.done': 'Los geht’s!',
  'tutorial.step': 'Schritt {n}/{total}',
  'tutorial.welcome.h': 'Willkommen im Klassenraum!',
  'tutorial.welcome.p':
    'Alle Spieler sitzen im selben Raum. Dein Platz ist mit einem goldenen Pfeil markiert.',
  'tutorial.click.h': 'Sammle Hirnschmalz',
  'tutorial.click.p':
    'Klick auf „Mitschreiben!“ — oder drück Leertaste. Das ist deine Einnahmequelle am Anfang.',
  'tutorial.shop.h': 'Kauf im Schulkiosk',
  'tutorial.shop.p':
    'Generatoren produzieren automatisch weiter. Fang mit dem Bleistiftstummel an, danach werden neue Stufen freigeschaltet.',
  'tutorial.goal.h': 'Klassenziel',
  'tutorial.goal.p':
    'Oben an der Tafel siehst du das Klassenziel. Alles HS der Klasse zählt mit. Bei 100 % gibt’s ×3 für alle — getrennt von deinen persönlichen Goldsternen.',
  'tutorial.steal.h': 'Klau deinen Mitschülern Punkte',
  'tutorial.steal.p':
    'Klick auf einen anderen Platz und wirf einen Papierflieger. Beim Lehrer-Rundgang riskierst du Nachsitzen.',
  'tutorial.boss.h': 'Boss-Taste: Tab',
  'tutorial.boss.p':
    'Tab tarnt das Spiel sofort als Mathe-Notizen. Noch mal Tab und du bist zurück im Klassenraum.',

  'hint.click': 'Hier klicken zum Mitschreiben!',
  'hint.gen': 'Jetzt kannst du dir das leisten!',
  'hint.kiosk': 'Öffne den Schulkiosk für Upgrades!',
  'hint.upgrade': 'Upgrade verfügbar!',
  'hint.prestige': 'Versetzung möglich!',

  'mobile.classroom': 'Klassenraum',
  'mobile.shop': 'Kiosk',

  'invite.button': 'Freunde einladen',
  'invite.copied': 'Einladungslink kopiert!',
};

const en: Dict = {
  'game.title': 'Classroom.io',
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
  'prestige.warn':
    'Careful: graduating resets your progress. Your brainpower, all generators and all upgrades from this run are gone. You keep your gold stars and grade.',
  'prestige.locked': '{v} BP left this run until your first gold star.',
  'prestige.lockedNear':
    'Almost there — keep earning brainpower this run to unlock your first gold star.',
  'prestige.lockedHint':
    'Gold stars come from graduating (this menu). Class Goal is separate: at 100% the whole class gets a short ×3 bonus — not a gold star.',
  'prestige.confirm': 'Graduate!',
  'prestige.cancel': 'Not yet',
  'prestige.yes': 'Yes, graduate',
  'prestige.no': 'No',
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
  'settings.boss': 'Boss key: Tab disguises the game as math notes.',
  'settings.rename': 'Change name',
  'settings.renameSave': 'Save',
  'settings.audio': 'Audio',
  'settings.music': 'Music',
  'settings.sfx': 'Sound effects',
  'settings.on': 'On',
  'settings.off': 'Off',
  'settings.name': 'Player name',
  'settings.nameCg': 'Your CrazyGames username is used automatically.',
  'settings.nameGuest': 'Sign in with CrazyGames to play under your username.',
  'settings.howto': 'How to play',
  'settings.tutorial': 'Replay tutorial',
  'settings.legal': 'Legal',

  'conn.lost': 'Connection lost — reconnecting…',
  'conn.replaced': 'The classroom is open in another tab.',
  'conn.playHere': 'Play here',

  'offline.toast': 'Welcome back! Your desk earned {v} BP ({t}).',

  'err.poor': 'Not enough brainpower!',
  'err.cooldown': 'Paper airplane not ready yet!',
  'err.adCooldown': 'Ad bonus is still on cooldown.',
  'err.detention': "You're in detention!",
  'err.target': 'Target unavailable.',
  'err.prestige': 'Not enough for a promotion yet.',
  'err.nameLocked': 'Your CrazyGames username is used automatically.',
  'err.nameBlocked': 'That name is not allowed. Please pick another one.',

  'buff.quiz': 'Quiz passed ×2',
  'buff.sub': 'Substitute ×2',
  'buff.goal': 'No homework ×3',
  'buff.detention': 'Detention ×0.25',
  'buff.ad': 'Ad boost ×2',
  'settings.adBoost': '+10% income (ad)',
  'settings.adBoostDone': '+{n} HS — 10% of your income!',
  'settings.adBoostFail': 'No ad available right now.',
  'settings.adBoostCooldown': 'Bonus ready in {t}',
  'settings.adBoostAdblock': 'Ads blocked — turn off your ad blocker.',
  'ads.boostHint': 'Optional: watch a video for 10% of your income instantly',
  'ads.adblockHint': 'Ad blocker detected — bonus ads locked',
  'ads.watching': 'Playing ad…',
  'settings.cgLogin': 'Sign in with CrazyGames',
  'settings.cgLoginHint': 'Save progress across devices',

  'misc.myDesk': 'My desk',
  'misc.you': 'You',
  'misc.sleeping': 'sleeping',
  'misc.stars': 'Gold stars',
  'misc.onHand': 'on hand',

  'footer.tagline':
    'Classroom.io — free multiplayer idle game. Everyone shares one classroom.',
  'footer.about': 'About',
  'footer.guide': 'How to play',
  'footer.privacy': 'Privacy',
  'footer.impressum': 'Legal notice',

  'boss.title': 'Math – Notes',
  'boss.hint': 'Tab to return',
  'boss.meta': 'Last edited: today',
  'boss.menu.file': 'File',
  'boss.menu.edit': 'Edit',
  'boss.menu.view': 'View',
  'boss.menu.insert': 'Insert',
  'boss.menu.format': 'Format',
  'boss.menu.tools': 'Tools',
  'boss.h1': 'Quadratic functions – summary',
  'boss.p1.label': 'General form:',
  'boss.p1.body': 'f(x) = ax² + bx + c\u00a0(a ≠ 0)',
  'boss.p2.label': 'Vertex form:',
  'boss.p2.body': 'f(x) = a(x − d)² + e, vertex S(d | e)',
  'boss.li1': 'a > 0: parabola opens upward, a < 0: opens downward',
  'boss.li2': '|a| > 1: stretched, |a| < 1: compressed',
  'boss.li3': 'Roots via the quadratic formula: x = (−b ± √(b² − 4ac)) / 2a',
  'boss.li4': 'Discriminant D = b² − 4ac decides how many real roots',
  'boss.ex.label': 'Example:',
  'boss.ex.body': 'f(x) = 2x² − 4x + 1',
  'boss.ex2': '⇒ f(x) = 2(x − 1)² − 1, vertex S(1 | −1), D = 8 > 0 ⇒ two real roots',

  'ui.close': 'Close',
  'ui.back': 'Back',

  'howto.title': 'How to play',
  'howto.notes.h': '1. Take notes',
  'howto.notes.p':
    'Click “Take notes!” (or press space) to collect brainpower. The higher your production, the more each click is worth.',
  'howto.shop.h': '2. School Kiosk',
  'howto.shop.p':
    'Buy generators in the School Kiosk — from the Stubby Pencil up to the Galaxy Brain. They keep producing on their own, even while you are away (up to 8 hours).',
  'howto.upgrades.h': '3. Upgrades',
  'howto.upgrades.p':
    'Once you own enough generators or have clicked enough, upgrades appear above the kiosk. Each one permanently doubles a production source.',
  'howto.steal.h': '4. Paper airplanes',
  'howto.steal.p':
    'Everyone shares one classroom. Click another desk to throw a paper airplane and steal brainpower. During a teacher patrol that gets risky.',
  'howto.events.h': '5. Class events',
  'howto.events.p':
    'Pop quiz, teacher patrol and substitute period hit the whole room at once. Answer the quiz correctly for a bonus and a ×2 multiplier.',
  'howto.goal.h': '6. Class Goal',
  'howto.goal.p':
    'Every brainpower earned by anyone counts toward the Class Goal. At 100% the whole class gets a short ×3 “no homework” bonus — that is not a gold star.',
  'howto.prestige.h': '7. Graduating',
  'howto.prestige.p':
    'With enough brainpower you can graduate: the run restarts, but you keep gold stars that permanently boost production.',
  'howto.boss.h': '8. Boss key',
  'howto.boss.p': 'Tab disguises the game as a math notes document. Press Tab again to return.',

  'tutorial.skip': 'Skip tutorial',
  'tutorial.next': 'Next',
  'tutorial.done': "Let's go!",
  'tutorial.step': 'Step {n}/{total}',
  'tutorial.welcome.h': 'Welcome to the classroom!',
  'tutorial.welcome.p':
    'Every player sits in the same room. Your own desk is marked with a golden arrow.',
  'tutorial.click.h': 'Collect brainpower',
  'tutorial.click.p':
    'Click “Take notes!” — or press space. That is your income while you are starting out.',
  'tutorial.shop.h': 'Shop in the School Kiosk',
  'tutorial.shop.p':
    'Generators keep producing on their own. Start with the Stubby Pencil; buying it unlocks the next tier.',
  'tutorial.goal.h': 'Class Goal',
  'tutorial.goal.p':
    'The chalkboard tracks the Class Goal. Everyone’s BP counts. At 100% the whole class gets ×3 for a few minutes — separate from your personal gold stars.',
  'tutorial.steal.h': 'Steal from your classmates',
  'tutorial.steal.p':
    'Click another desk to throw a paper airplane. During a teacher patrol you risk detention.',
  'tutorial.boss.h': 'Boss key: Tab',
  'tutorial.boss.p':
    'Tab instantly disguises the game as math notes. Press Tab again and you are back in the classroom.',

  'hint.click': 'Click here to take notes!',
  'hint.gen': 'You can afford this now!',
  'hint.kiosk': 'Open the School Kiosk for upgrades!',
  'hint.upgrade': 'Upgrade available!',
  'hint.prestige': 'You can graduate!',

  'mobile.classroom': 'Classroom',
  'mobile.shop': 'Kiosk',

  'invite.button': 'Invite friends',
  'invite.copied': 'Invite link copied!',
};

const DICTS: Record<Locale, Dict> = { de, en };

const stored = getPrefs().lang;
let locale: Locale = LOCALES.includes(stored as Locale) ? (stored as Locale) : DEFAULT_LOCALE;

export function getLocale(): Locale {
  return locale;
}

export function setLocale(l: Locale): void {
  locale = l;
  setPrefs({ lang: l });
  document.documentElement.lang = l;
}

export function t(key: string, params?: Record<string, string | number>): string {
  let s = DICTS[locale][key] ?? DICTS[DEFAULT_LOCALE][key] ?? key;
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

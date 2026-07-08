#!/usr/bin/env node
/**
 * Simulated players for integration testing and demo screenshots.
 *
 *   node scripts/bots.mjs [count=8] [durationSec=15] [url=ws://localhost:8080/ws]
 *
 * Each bot joins the global room, clicks, buys generators, chats, emotes and
 * tries to steal. Exits 0 when the core multiplayer loop demonstrably works.
 */
import WebSocket from 'ws';

const count = Number(process.argv[2] ?? 8);
const durationSec = Number(process.argv[3] ?? 15);
const url = process.argv[4] ?? 'ws://localhost:8080/ws';

const NAMES = [
  'Anna', 'Ben', 'Cem', 'Dilara', 'Emil', 'Finn', 'Greta', 'Hannah',
  'Ivo', 'Jonas', 'Kaya', 'Lena', 'Mia', 'Noah', 'Ole', 'Paula',
  'Quirin', 'Rosa', 'Samu', 'Tarik', 'Ulli', 'Vera', 'Willi', 'Xenia',
];
const CHAT = [
  'hat wer die hausaufgaben?',
  'psst, lehrer kommt!',
  'wer klaut mir staendig HS??',
  'gleich pause',
  'mathe ist heute echt zaeh',
  'nice, neuer taschenrechner!',
];

const stats = {
  welcomes: 0,
  ticks: 0,
  chats: 0,
  steals: 0,
  caught: 0,
  errors: {},
  maxRoster: 0,
};

const bots = [];

function rand(n) {
  return Math.floor(Math.random() * n);
}

function spawnBot(i) {
  const ws = new WebSocket(url);
  const bot = { ws, id: null, roster: [], you: null, name: `${NAMES[i % NAMES.length]}${i >= NAMES.length ? i : ''}` };
  bots.push(bot);

  const send = (m) => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify(m));

  ws.on('open', () => {
    send({
      t: 'hello',
      name: bot.name,
      avatar: { skin: rand(4), hair: rand(5), hairColor: rand(6), shirt: rand(8) },
    });
  });

  ws.on('message', (data) => {
    const m = JSON.parse(data.toString());
    switch (m.t) {
      case 'welcome':
        stats.welcomes++;
        bot.id = m.you.id;
        bot.you = m.you;
        bot.roster = m.roster;
        stats.maxRoster = Math.max(stats.maxRoster, m.roster.length);
        startBehavior(bot, send);
        break;
      case 'you':
        bot.you = m.you;
        break;
      case 'join':
        bot.roster = bot.roster.filter((p) => p.id !== m.p.id).concat(m.p);
        stats.maxRoster = Math.max(stats.maxRoster, bot.roster.length);
        break;
      case 'leave':
        bot.roster = bot.roster.filter((p) => p.id !== m.id);
        break;
      case 'tick':
        stats.ticks++;
        break;
      case 'chat':
        stats.chats++;
        break;
      case 'steal':
        if (m.caught) stats.caught++;
        else stats.steals++;
        break;
      case 'error':
        stats.errors[m.code] = (stats.errors[m.code] ?? 0) + 1;
        break;
    }
  });

  ws.on('error', (err) => {
    console.error(`bot ${bot.name} socket error:`, err.message);
    process.exitCode = 1;
  });
}

function startBehavior(bot, send) {
  bot.timers = [
    setInterval(() => send({ t: 'click', n: 5 + rand(10) }), 900 + rand(400)),
    setInterval(() => send({ t: 'buy', gen: rand(2), qty: -1 }), 2500 + rand(1500)),
    setInterval(() => {
      if (Math.random() < 0.4) send({ t: 'chat', text: CHAT[rand(CHAT.length)] });
      else send({ t: 'emote', e: rand(8) });
    }, 5000 + rand(4000)),
    setInterval(() => {
      const targets = bot.roster.filter((p) => p.id !== bot.id && p.online);
      if (targets.length > 0) send({ t: 'steal', target: targets[rand(targets.length)].id });
    }, 4000 + rand(3000)),
  ];
}

for (let i = 0; i < count; i++) {
  setTimeout(() => spawnBot(i), i * 150);
}

setTimeout(() => {
  for (const b of bots) {
    b.timers?.forEach(clearInterval);
    b.ws.close();
  }
  const anyBot = bots[0];
  console.log('--- bot run summary ---');
  console.log(`bots: ${count}, duration: ${durationSec}s`);
  console.log(`welcomes: ${stats.welcomes}, maxRoster: ${stats.maxRoster}`);
  console.log(`ticks seen: ${stats.ticks}, chats: ${stats.chats}`);
  console.log(`steals: ${stats.steals}, caught: ${stats.caught}`);
  console.log(`errors:`, stats.errors);
  console.log(`bot0 bp=${anyBot?.you?.bp?.toFixed(1)}, gens=${JSON.stringify(anyBot?.you?.gens)}`);

  const ok =
    stats.welcomes === count &&
    stats.maxRoster >= count &&
    stats.ticks > count * durationSec &&
    stats.steals > 0 &&
    stats.chats > 0 &&
    (anyBot?.you?.bp ?? 0) > 0;
  console.log(ok ? 'RESULT: OK' : 'RESULT: FAILED');
  process.exit(ok && process.exitCode !== 1 ? 0 : 1);
}, durationSec * 1000);

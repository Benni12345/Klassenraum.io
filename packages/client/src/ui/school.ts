import { deskTier } from '@shared/balance';
import {
  buildSchoolDay,
  defaultSchoolProgress,
  DESK_SKINS,
  utcDay,
  type SchoolDay,
} from '@shared/school';
import { sfxBuy, sfxSuccess } from '../audio';
import { fmt, fmtDuration } from '../format';
import { t } from '../i18n';
import { platform } from '../platform';
import { calendarIcon, deskSprite, iconDataUrl } from '../render/sprites';
import { store } from '../state';
import { adPlayBadge } from './ads';
import { el, id } from './dom';
import { openModal } from './modals';
import { toast } from './toast';
import { onTutorialEnd } from './tutorial';

let schoolPrompted = false;

export function initSchool(): void {
  const btn = id('btn-school');
  const img = el('img');
  img.src = iconDataUrl(calendarIcon, 4);
  img.alt = '';
  btn.appendChild(img);
  const pip = el('span', 'school-pip hidden');
  btn.appendChild(pip);
  btn.onclick = () => schoolModal();

  const refresh = () => {
    const you = store.you;
    const ready = schoolHasClaim(you);
    btn.classList.toggle('ready', ready);
    pip.classList.toggle('hidden', !ready);
    btn.title = t('school.title');
  };
  const seenReady = new Set<string>();
  store.on('you', () => {
    refresh();
    const you = store.you;
    if (!you?.school?.homework) return;
    for (const h of you.school.homework) {
      const key = `${utcDay(store.serverNow())}:${h.id}`;
      if (h.ready && !seenReady.has(key)) {
        seenReady.add(key);
        toast(t('school.hwReady'), 'gold');
      }
    }
  });
  store.on('joined', () => {
    refresh();
    maybePromptSchool();
  });
  onTutorialEnd(() => maybePromptSchool());
  setInterval(refresh, 1_000);
  refresh();
}

function isAttendanceClaimed(school: SchoolDay): boolean {
  return school.claimDay === utcDay(store.serverNow());
}

function schoolHasClaim(you: typeof store.you): boolean {
  if (!you) return false;
  const s = you.school && Array.isArray(you.school.homework) ? you.school : schoolSnapshot();
  if (!s) return false;
  if (!isAttendanceClaimed(s)) return true;
  if (s.homework.some((h) => h.ready)) return true;
  if (s.bonusReady) return true;
  return false;
}

function maybePromptSchool(): void {
  if (schoolPrompted) return;
  if (document.body.classList.contains('tutoring')) return;
  const you = store.you;
  if (!you?.tutorialDone) return;
  const school = schoolSnapshot();
  if (!school || isAttendanceClaimed(school)) return;
  schoolPrompted = true;
  schoolModal();
}

/** Server snapshot, or a local preview if this client is ahead of the game server. */
function schoolSnapshot(): SchoolDay | null {
  const you = store.you;
  if (!you) return null;
  if (you.school && Array.isArray(you.school.homework)) return you.school;
  return buildSchoolDay(
    you.id,
    defaultSchoolProgress(),
    store.serverNow(),
    you.bps,
    you.stars,
    you.grade,
  );
}

export function schoolModal(): void {
  openModal({ title: t('school.title') }, (body, foot, close) => {
    const paint = () => {
      const school = schoolSnapshot();
      const you = store.you;
      const wrap = el('div');
      try {
        if (!school || !you) {
          wrap.appendChild(el('p', '', t('school.unavailable')));
        } else {
          renderAttendance(wrap, school);
          renderHomework(wrap, school);
          renderSkins(wrap, school, deskTier(you.gens));
        }
        body.replaceChildren(...Array.from(wrap.children));
      } catch (err) {
        console.error('[school] render failed', err);
        body.replaceChildren(el('p', 'modal-warn', t('school.unavailable')));
      }
    };

    paint();
    const ok = el('button', 'btn gold', t('ui.close'));
    ok.type = 'button';
    ok.onclick = close;
    foot.appendChild(ok);

    store.on('you', () => {
      if (!body.isConnected) return;
      paint();
    });
  });
}

function renderAttendance(body: HTMLElement, school: SchoolDay): void {
  const box = el('div', 'school-card');
  box.appendChild(el('h3', '', t('school.attendance')));
  const claimed = isAttendanceClaimed(school);
  const streak = el('div', 'school-streak');
  streak.appendChild(el('span', 'school-streak-n', String(claimed ? school.streak : Math.max(school.streak, 0))));
  streak.appendChild(
    el(
      'span',
      'school-streak-l',
      claimed
        ? t('school.streakNow', { n: school.streak })
        : school.streak > 0
          ? t('school.streakKeep', { n: school.streak })
          : t('school.streakStart'),
    ),
  );
  box.appendChild(streak);
  if (school.bestStreak > 0) {
    box.appendChild(el('p', 'school-muted', t('school.best', { n: school.bestStreak })));
  }
  box.appendChild(
    el('p', 'school-muted', t('school.resets', { t: fmtDuration(school.nextDayInMs) })),
  );

  if (claimed) {
    box.appendChild(el('p', 'school-ok', t('school.claimedToday', { n: fmt(school.reward) })));
    if (!school.doubled && platform.enabled) {
      const dbl = adButton(t('school.double', { n: fmt(school.doubleReward) }), async () => {
        const watched = await watchAd();
        if (watched) {
          store.doubleAttendance();
          sfxSuccess();
          toast(t('school.doubleDone', { n: fmt(school.doubleReward) }), 'gold');
        }
      });
      box.appendChild(dbl);
    } else if (school.doubled) {
      box.appendChild(el('p', 'school-ok', t('school.doubled')));
    }
  } else if (school.recoverable) {
    box.appendChild(el('p', 'school-warn', t('school.missed', { n: school.streak })));
    const recover = adButton(t('school.recover', { n: school.recoverStreak, v: fmt(school.recoverReward) }), async () => {
      const watched = await watchAd();
      if (watched) {
        store.claimAttendance(true);
        sfxSuccess();
        platform.happytime();
        toast(t('school.claimDone', { n: fmt(school.recoverReward), s: school.recoverStreak }), 'gold');
      }
    });
    box.appendChild(recover);
    const reset = el('button', 'btn small', t('school.reset', { v: fmt(school.reward) }));
    reset.type = 'button';
    reset.onclick = () => {
      store.claimAttendance(false);
      sfxBuy();
      toast(t('school.claimDone', { n: fmt(school.reward), s: 1 }), 'gold');
    };
    box.appendChild(reset);
  } else {
    const claim = el('button', 'btn gold', t('school.claim', { n: fmt(school.reward), s: school.upcomingStreak }));
    claim.type = 'button';
    claim.onclick = () => {
      store.claimAttendance(false);
      sfxSuccess();
      platform.happytime();
      toast(t('school.claimDone', { n: fmt(school.reward), s: school.upcomingStreak }), 'gold');
    };
    box.appendChild(claim);
  }
  body.appendChild(box);
}

function renderHomework(body: HTMLElement, school: SchoolDay): void {
  const box = el('div', 'school-card');
  box.appendChild(el('h3', '', t('school.homework')));
  box.appendChild(el('p', 'school-muted', t('school.homeworkHint')));
  for (const task of school.homework) {
    const row = el('div', 'hw-row');
    const check = el('span', `hw-check${task.claimed ? ' on' : task.ready ? ' ready' : ''}`, task.claimed ? '✓' : '');
    const mid = el('div', 'hw-mid');
    mid.appendChild(el('div', 'hw-name', t(`school.hw.${task.id}`)));
    mid.appendChild(el('div', 'hw-prog', `${Math.min(task.progress, task.target)} / ${task.target}`));
    row.appendChild(check);
    row.appendChild(mid);
    if (task.claimed) {
      row.appendChild(el('span', 'hw-done', t('school.turnedIn')));
    } else if (task.ready) {
      const btn = el('button', 'btn small gold', t('school.turnIn', { n: fmt(task.reward) }));
      btn.type = 'button';
      btn.onclick = () => {
        store.claimHomework(task.id);
        sfxBuy();
        toast(t('school.hwDone', { n: fmt(task.reward) }), 'gold');
      };
      row.appendChild(btn);
    }
    box.appendChild(row);
  }
  if (school.bonusClaimed) {
    box.appendChild(el('p', 'school-ok', t('school.bonusDone')));
  } else if (school.bonusReady) {
    const bonus = el('button', 'btn gold', t('school.bonus', { n: fmt(school.bonusReward) }));
    bonus.type = 'button';
    bonus.onclick = () => {
      store.claimHomework('bonus');
      sfxSuccess();
      platform.happytime();
      toast(t('school.bonusDoneToast', { n: fmt(school.bonusReward) }), 'gold');
    };
    box.appendChild(bonus);
  }
  body.appendChild(box);
}

function renderSkins(body: HTMLElement, school: SchoolDay, deskTier: number): void {
  const box = el('div', 'school-card');
  box.appendChild(el('h3', '', t('school.skins')));
  box.appendChild(el('p', 'school-muted', t('school.skinsHint')));
  const grid = el('div', 'skin-grid');
  for (const def of DESK_SKINS) {
    const unlocked = school.unlockedSkins.includes(def.id);
    const btn = el('button', `skin-btn${school.deskSkin === def.id ? ' on' : ''}${unlocked ? '' : ' locked'}`);
    btn.type = 'button';
    btn.disabled = !unlocked;
    const img = el('img');
    img.src = iconDataUrl(deskSprite(Math.max(1, deskTier), def.id), 3);
    img.alt = '';
    btn.appendChild(img);
    btn.appendChild(el('span', '', t(`school.skin.${def.id}`)));
    if (!unlocked) {
      btn.title = skinUnlockText(def.id);
      btn.appendChild(el('span', 'skin-lock', skinUnlockText(def.id)));
    }
    btn.onclick = () => {
      if (!unlocked) return;
      store.equipSkin(def.id);
      sfxBuy();
    };
    grid.appendChild(btn);
  }
  box.appendChild(grid);
  box.appendChild(el('p', 'school-muted', t('school.footer')));
  body.appendChild(box);
}

function skinUnlockText(id: string): string {
  const def = DESK_SKINS.find((s) => s.id === id);
  if (!def) return '';
  if (def.unlock.kind === 'streak') return t('school.unlock.streak', { n: def.unlock.n });
  if (def.unlock.kind === 'stars') return t('school.unlock.stars', { n: def.unlock.n });
  if (def.unlock.kind === 'grade') return t('school.unlock.grade', { n: def.unlock.n });
  return '';
}

function adButton(label: string, onClick: () => void | Promise<void>): HTMLButtonElement {
  const btn = el('button', 'btn gold ad-boost-btn school-ad') as HTMLButtonElement;
  btn.type = 'button';
  btn.appendChild(adPlayBadge());
  btn.appendChild(el('span', '', label));
  if (platform.hasAdblock) {
    btn.disabled = true;
    btn.classList.add('ad-blocked');
  }
  btn.onclick = () => {
    if (btn.disabled) return;
    void onClick();
  };
  return btn;
}

async function watchAd(): Promise<boolean> {
  if (!platform.enabled) return true;
  if (platform.hasAdblock) {
    toast(t('settings.adBoostAdblock'), 'info');
    return false;
  }
  const watched = await platform.requestRewardedAd();
  if (!watched) toast(t('settings.adBoostFail'), 'info');
  return watched;
}

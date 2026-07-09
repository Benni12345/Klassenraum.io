import type { ActivityEntry, PlayerPublic } from '@shared/types';
import {
  classroomWorldH,
  DESK_W,
  isWalkable,
  seatPos,
  WALK_LANE_X,
  WALK_SPEED,
} from '@shared/walk';
import { t } from '../i18n';
import { fmt } from '../format';
import { store } from '../state';
import { drawText, textWidth } from './font';
import { Fx } from './fx';
import {
  boardSprite,
  deskSprite,
  doorSprite,
  PAL,
  posterSprite,
  studentSprite,
  teacherDeskSprite,
  teacherSprite,
  walkerSprite,
  windowSprite,
  zzzIcon,
} from './sprites';

export { seatPos };
export const WORLD_W = 232;
const WALL_H = 52;
const CELL_W = 36;
const GRID_X = 12;

export interface DeskHit {
  player: PlayerPublic;
  screenX: number;
  screenY: number;
}

export class Scene {
  readonly fx = new Fx();
  onDeskClick: ((hit: DeskHit) => void) | null = null;
  onOwnDeskClick: (() => void) | null = null;
  onWalkingChange: ((walking: boolean) => void) | null = null;

  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private scale = 3;
  private offsetX = 0;
  private camY = 0;
  private viewW = 0;
  private viewH = 0;
  private hoverPlayer: PlayerPublic | null = null;
  private dragging = false;
  private dragMoved = 0;
  private dragStartY = 0;
  private dragStartCam = 0;
  private lastTime = performance.now();
  private keys = new Set<string>();
  private walkTarget: { x: number; y: number } | null = null;
  private displayPos = new Map<string, { x: number; y: number }>();
  private lastMoveSend = 0;
  private walkFrame = 0;
  private wasWalking = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.bindInput();
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement!);
    this.resize();

    store.on('steal', (s) => this.onSteal(s.attacker, s.victim, s.amount, s.caught));
    store.on('emote', ({ id, e }) => {
      const pos = this.entityPos(store.roster.get(id));
      if (!pos) return;
      this.fx.emote(pos.x, pos.y - 16, e);
    });
    store.on('activity', (a) => this.onActivity(a));
    store.on('pose', () => this.syncWalkUi());
    store.on('roster', () => this.syncWalkUi());
    store.on('goalDone', () => this.fx.confettiBurst(WORLD_W, this.camY, this.viewH));

    requestAnimationFrame(() => this.frame());
  }

  private worldH(): number {
    let maxSeat = 11;
    for (const p of store.roster.values()) maxSeat = Math.max(maxSeat, p.seat);
    return classroomWorldH(maxSeat);
  }

  scrollToOwnDesk(): void {
    const you = store.you;
    if (!you) return;
    const pub = store.roster.get(you.id);
    if (pub?.pose === 'walking' && pub.pos) {
      this.camY = Math.max(0, Math.min(pub.pos.y - this.viewH / 2, this.worldH() - this.viewH));
      return;
    }
    const pos = seatPos(you.seat);
    this.camY = Math.max(0, Math.min(pos.y - this.viewH / 2, this.worldH() - this.viewH));
  }

  clickFloaterAtOwnDesk(text: string): void {
    const you = store.you;
    if (!you) return;
    const pos = this.entityPos(store.roster.get(you.id)) ?? seatPos(you.seat);
    this.fx.floater(pos.x + (pos === seatPos(you.seat) ? DESK_W / 2 : 0), pos.y - 10, text, '#ffe9a3');
    store.recentActivity.set(you.id, store.serverNow());
  }

  returnToSeat(): void {
    this.walkTarget = null;
    store.returnToSeat();
  }

  // ------------------------------------------------------------------ Input

  private bindInput(): void {
    const c = this.canvas;
    c.addEventListener('pointerdown', (ev) => {
      this.dragging = true;
      this.dragMoved = 0;
      this.dragStartY = ev.clientY;
      this.dragStartCam = this.camY;
      c.setPointerCapture(ev.pointerId);
    });
    c.addEventListener('pointermove', (ev) => {
      const world = this.toWorld(ev);
      this.hoverPlayer = world ? this.playerAt(world.x, world.y) : null;
      c.style.cursor = this.hoverPlayer ? 'pointer' : 'default';
      if (this.dragging) {
        const dy = ev.clientY - this.dragStartY;
        this.dragMoved = Math.max(this.dragMoved, Math.abs(dy));
        this.camY = this.clampCam(this.dragStartCam - dy / this.cssScale());
      }
    });
    c.addEventListener('pointerup', (ev) => {
      this.dragging = false;
      if (this.dragMoved > 5) return;
      const world = this.toWorld(ev);
      if (!world) return;

      const hit = this.playerAt(world.x, world.y);
      if (hit) {
        if (store.you && hit.id === store.you.id) {
          if (hit.pose === 'walking') this.returnToSeat();
          else this.onOwnDeskClick?.();
        } else {
          this.onDeskClick?.({ player: hit, screenX: ev.clientX, screenY: ev.clientY });
        }
        return;
      }

      if (isWalkable(world.x, world.y, this.worldH())) {
        this.walkTarget = { x: world.x, y: world.y };
        store.moveTo(world.x, world.y);
      }
    });
    c.addEventListener('wheel', (ev) => {
      ev.preventDefault();
      this.camY = this.clampCam(this.camY + ev.deltaY / this.cssScale());
    }, { passive: false });

    window.addEventListener('keydown', (ev) => {
      if (ev.target instanceof HTMLInputElement || ev.target instanceof HTMLTextAreaElement) return;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyR'].includes(ev.code)) {
        ev.preventDefault();
      }
      this.keys.add(ev.code);
      if (ev.code === 'KeyR') this.returnToSeat();
    });
    window.addEventListener('keyup', (ev) => this.keys.delete(ev.code));
  }

  private cssScale(): number {
    return this.scale / (window.devicePixelRatio || 1);
  }

  private toWorld(ev: PointerEvent): { x: number; y: number } | null {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const px = (ev.clientX - rect.left) * dpr;
    const py = (ev.clientY - rect.top) * dpr;
    const x = (px - this.offsetX) / this.scale;
    const y = py / this.scale + this.camY;
    if (x < 0 || x > WORLD_W) return null;
    return { x, y };
  }

  private entityPos(p: PlayerPublic | undefined): { x: number; y: number } | null {
    if (!p) return null;
    if (p.pose === 'walking') {
      const d = this.displayPos.get(p.id) ?? p.pos;
      if (d) return d;
    }
    const sp = seatPos(p.seat);
    return { x: sp.x + DESK_W / 2, y: sp.y + 10 };
  }

  private playerAt(x: number, y: number): PlayerPublic | null {
    for (const p of store.roster.values()) {
      if (p.pose === 'walking') {
        const pos = this.displayPos.get(p.id) ?? p.pos;
        if (!pos) continue;
        if (x >= pos.x - 8 && x <= pos.x + 8 && y >= pos.y - 6 && y <= pos.y + 18) return p;
        continue;
      }
      const pos = seatPos(p.seat);
      if (x >= pos.x - 2 && x <= pos.x + DESK_W + 2 && y >= pos.y - 8 && y <= pos.y + 31) {
        return p;
      }
    }
    return null;
  }

  screenPosOfSeat(seat: number): { x: number; y: number } {
    const pos = seatPos(seat);
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    return {
      x: rect.left + (this.offsetX + (pos.x + DESK_W / 2) * this.scale) / dpr,
      y: rect.top + ((pos.y + 4 - this.camY) * this.scale) / dpr,
    };
  }

  private clampCam(v: number): number {
    return Math.max(0, Math.min(v, Math.max(0, this.worldH() - this.viewH)));
  }

  private resize(): void {
    const wrap = this.canvas.parentElement!;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.floor(wrap.clientWidth * dpr));
    const h = Math.max(1, Math.floor(wrap.clientHeight * dpr));
    this.canvas.width = w;
    this.canvas.height = h;
    this.canvas.style.width = `${wrap.clientWidth}px`;
    this.canvas.style.height = `${wrap.clientHeight}px`;
    this.scale = Math.max(2, Math.floor(w / WORLD_W));
    this.offsetX = Math.floor((w - WORLD_W * this.scale) / 2);
    this.viewW = w / this.scale;
    this.viewH = h / this.scale;
  }

  private syncWalkUi(): void {
    const you = store.you;
    const walking = !!(you && store.roster.get(you.id)?.pose === 'walking');
    if (walking !== this.wasWalking) {
      this.wasWalking = walking;
      this.onWalkingChange?.(walking);
    }
  }

  private updateMovement(dt: number, now: number): void {
    const you = store.you;
    if (!you) return;
    const pub = store.roster.get(you.id);
    if (!pub) return;

    for (const p of store.roster.values()) {
      if (p.pose !== 'walking' || !p.pos) {
        this.displayPos.delete(p.id);
        continue;
      }
      const cur = this.displayPos.get(p.id) ?? { ...p.pos };
      const lerp = p.id === you.id ? 0.55 : 0.35;
      cur.x += (p.pos.x - cur.x) * lerp;
      cur.y += (p.pos.y - cur.y) * lerp;
      this.displayPos.set(p.id, cur);
    }

    if (pub.pose !== 'walking') return;

    let dx = 0;
    let dy = 0;
    if (this.keys.has('ArrowUp') || this.keys.has('KeyW')) dy -= 1;
    if (this.keys.has('ArrowDown') || this.keys.has('KeyS')) dy += 1;
    if (this.keys.has('ArrowLeft') || this.keys.has('KeyA')) dx -= 1;
    if (this.keys.has('ArrowRight') || this.keys.has('KeyD')) dx += 1;

    const pos = this.displayPos.get(you.id) ?? pub.pos ?? { x: WALK_LANE_X[1]!, y: 100 };
    let tx = pos.x;
    let ty = pos.y;

    if (this.walkTarget) {
      const tdx = this.walkTarget.x - pos.x;
      const tdy = this.walkTarget.y - pos.y;
      const dist = Math.hypot(tdx, tdy);
      if (dist < 4) this.walkTarget = null;
      else {
        dx += tdx / dist;
        dy += tdy / dist;
      }
    }

    if (dx !== 0 || dy !== 0) {
      const len = Math.hypot(dx, dy) || 1;
      tx = pos.x + (dx / len) * WALK_SPEED * dt;
      ty = pos.y + (dy / len) * WALK_SPEED * dt;
      if (!isWalkable(tx, ty, this.worldH())) return;
      this.displayPos.set(you.id, { x: tx, y: ty });
      this.walkFrame += dt;
      if (now - this.lastMoveSend > 180) {
        store.moveTo(tx, ty);
        this.lastMoveSend = now;
      }
    }
  }

  // ------------------------------------------------------------------ Frame

  private frame(): void {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastTime) / 1000);
    this.lastTime = now;

    store.frameAdvance();
    this.updateMovement(dt, now);
    this.fx.update(dt);
    this.draw(now / 1000);

    requestAnimationFrame(() => this.frame());
  }

  private draw(time: number): void {
    const { ctx } = this;
    const camY = Math.round(this.camY * this.scale) / this.scale;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#211d18';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(this.scale, 0, 0, this.scale, this.offsetX, -camY * this.scale);

    const viewTop = camY;
    const viewBottom = camY + this.viewH;

    this.drawRoomShell(viewTop, viewBottom, time);
    this.drawAisles(viewTop, viewBottom);
    this.drawDesks(viewTop, viewBottom, time);
    this.drawWalkers(viewTop, viewBottom, time);
    this.drawTeacher(time);
    this.fx.draw(ctx);
  }

  private drawAisles(viewTop: number, viewBottom: number): void {
    const { ctx } = this;
    const worldH = this.worldH();
    for (const lane of WALK_LANE_X) {
      if (lane < 0 || lane > WORLD_W) continue;
      for (let y = WALL_H + 8; y < worldH - 12; y += 2) {
        if (y < viewTop - 8 || y > viewBottom + 8) continue;
        ctx.fillStyle = 'rgba(0,0,0,0.04)';
        ctx.fillRect(lane - 1, y, 3, 1);
      }
    }
  }

  private drawRoomShell(viewTop: number, viewBottom: number, time: number): void {
    const { ctx } = this;
    const worldH = Math.max(this.worldH(), viewBottom);

    ctx.fillStyle = PAL.floor;
    ctx.fillRect(0, WALL_H, WORLD_W, worldH - WALL_H);
    ctx.fillStyle = PAL.floorLine;
    for (let y = WALL_H + 6; y < worldH; y += 7) {
      if (y > viewTop - 8 && y < viewBottom + 8) ctx.fillRect(0, y, WORLD_W, 1);
    }
    for (let y = WALL_H; y < worldH; y += 7) {
      if (y < viewTop - 8 || y > viewBottom + 8) continue;
      for (let k = 0; k < 4; k++) {
        const jx = ((y * 37 + k * 61) % WORLD_W + WORLD_W) % WORLD_W;
        ctx.fillRect(jx, y + 1, 1, 5);
      }
    }

    if (viewTop < WALL_H + 8) {
      ctx.fillStyle = PAL.wall;
      ctx.fillRect(0, 0, WORLD_W, WALL_H);
      ctx.fillStyle = PAL.wallDark;
      ctx.fillRect(0, WALL_H - 2, WORLD_W, 2);

      ctx.drawImage(windowSprite(), 12, 8);
      ctx.drawImage(posterSprite(0), 36, 26);
      ctx.drawImage(boardSprite(140, 42), 46, 4);
      ctx.drawImage(doorSprite(), 206, 26);
      ctx.drawImage(posterSprite(1), 192, 8);
      this.drawClock(220, 12);
      ctx.drawImage(teacherDeskSprite(), 12, 52);

      this.drawBoardContent(time);
    }
  }

  private drawClock(cx: number, cy: number): void {
    const { ctx } = this;
    ctx.fillStyle = '#f5efdc';
    ctx.fillRect(cx - 4, cy - 3, 8, 7);
    ctx.fillRect(cx - 3, cy - 4, 6, 9);
    ctx.fillStyle = PAL.ink;
    const d = new Date();
    const mi = d.getMinutes();
    const hr = (d.getHours() % 12) + mi / 60;
    const ma = (mi / 60) * Math.PI * 2 - Math.PI / 2;
    const ha = (hr / 12) * Math.PI * 2 - Math.PI / 2;
    ctx.fillRect(cx, cy, 1, 1);
    ctx.fillRect(cx + Math.round(Math.cos(ma) * 3), cy + Math.round(Math.sin(ma) * 3), 1, 1);
    ctx.fillRect(cx + Math.round(Math.cos(ma) * 2), cy + Math.round(Math.sin(ma) * 2), 1, 1);
    ctx.fillRect(cx + Math.round(Math.cos(ha) * 2), cy + Math.round(Math.sin(ha) * 2), 1, 1);
  }

  private drawBoardContent(time: number): void {
    const { ctx } = this;
    const bx = 46 + 4;
    const bw = 140 - 8;
    const ev = store.event;
    const sn = store.serverNow();

    let line1 = 'KLASSENRAUM.IO';
    let line1Color: string = PAL.chalk;
    if (ev) {
      const secs = Math.max(0, Math.ceil((ev.endsAt - sn) / 1000));
      if (ev.kind === 'quiz') line1 = `${t('event.quiz.title')} ${ev.question ?? ''} (${secs})`;
      else if (ev.kind === 'patrol') {
        line1 = `${getPatrolLabel()} (${secs})`;
        line1Color = time % 1 < 0.5 ? '#f0b0a0' : PAL.chalk;
      } else line1 = `VERTRETUNG ×2 (${secs})`;
    }
    drawText(ctx, line1.toUpperCase().slice(0, 30), bx + bw / 2, 9, line1Color, { align: 'center' });

    const goal = store.goal;
    const frac = Math.max(0, Math.min(1, goal.progress / goal.target));
    drawText(ctx, t('goal.title'), bx, 19, PAL.chalkDim);
    const barX = bx + textWidth(t('goal.title')) + 4;
    const barW = bw - (barX - bx) - 26;
    ctx.fillStyle = PAL.boardDark;
    ctx.fillRect(barX, 19, barW, 5);
    ctx.fillStyle = '#9fd4a8';
    ctx.fillRect(barX, 19, Math.round(barW * frac), 5);
    drawText(ctx, `${Math.floor(frac * 100)}%`, bx + bw, 19, PAL.chalk, { align: 'right' });

    const online = [...store.roster.values()].filter((p) => p.online);
    online.sort((a, b) => b.bps - a.bps);
    const parts = online.slice(0, 3).map((p, i) => `${i + 1}.${p.name.toUpperCase().slice(0, 7)}`);
    drawText(ctx, parts.join(' '), bx, 30, PAL.chalk);
    drawText(ctx, `LVL ${goal.level + 1}`, bx + bw, 30, PAL.chalkDim, { align: 'right' });
  }

  private drawDesks(viewTop: number, viewBottom: number, time: number): void {
    const { ctx } = this;
    const players = [...store.roster.values()].sort((a, b) => a.seat - b.seat);
    const you = store.you;
    const sn = store.serverNow();

    for (const p of players) {
      const pos = seatPos(p.seat);
      if (pos.y + 30 < viewTop || pos.y - 12 > viewBottom) continue;
      const isYou = you?.id === p.id;
      const sleeping = !p.online;
      const away = p.pose === 'walking';

      ctx.drawImage(deskSprite(p.deskTier), pos.x, pos.y - 4);

      if (!away) {
        ctx.globalAlpha = sleeping ? 0.55 : 1;
        const bob = this.idleBob(p, time, sn);
        ctx.drawImage(studentSprite(p.avatar), pos.x + 7, pos.y + 6 + bob);
        if (this.isActivelyWorking(p, sn)) {
          this.drawScribble(pos.x + DESK_W - 4, pos.y + 2 + bob, time);
        }
        ctx.globalAlpha = 1;
      } else {
        drawText(ctx, '—', pos.x + DESK_W / 2, pos.y + 10, '#8d94a0', { align: 'center' });
      }

      if (p.detention) {
        drawText(ctx, '!', pos.x + DESK_W + 1, pos.y + 2, '#e04a3a', { shadow: '#5a1a12' });
      }

      const label = p.name.toUpperCase().slice(0, 9) + (p.grade > 0 ? `★${p.grade}` : '');
      const nameColor = isYou ? '#ffd869' : sleeping ? '#8d94a0' : '#fdfaf2';
      drawText(ctx, label, pos.x + DESK_W / 2, pos.y + 24, nameColor, {
        align: 'center',
        shadow: 'rgba(0,0,0,0.45)',
      });

      if (isYou && !away) {
        const bob = Math.round(Math.sin(time * 3) * 1.5);
        ctx.fillStyle = '#ffd869';
        const mx = pos.x + DESK_W / 2;
        const my = pos.y - 8 + bob;
        ctx.fillRect(mx - 1, my - 3, 2, 2);
        ctx.fillRect(mx - 2, my - 1, 4, 1);
        ctx.fillRect(mx - 1, my, 2, 1);
      }

      if (sleeping) {
        const bob = Math.round(Math.sin(time * 2 + p.seat) * 1.5);
        ctx.drawImage(zzzIcon, pos.x + DESK_W - 5, pos.y + 4 + bob, 6, 10);
      }

      if (this.hoverPlayer?.id === p.id && !isYou) {
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.lineWidth = 1;
        const box = away
          ? { x: pos.x - 1.5, y: pos.y - 5.5, w: DESK_W + 3, h: 36 }
          : { x: pos.x - 1.5, y: pos.y - 5.5, w: DESK_W + 3, h: 36 };
        ctx.strokeRect(box.x, box.y, box.w, box.h);
      }
    }
  }

  private drawWalkers(viewTop: number, viewBottom: number, time: number): void {
    const { ctx } = this;
    const you = store.you;
    const walkers = [...store.roster.values()]
      .filter((p) => p.pose === 'walking' && p.online)
      .sort((a, b) => (this.displayPos.get(a.id)?.y ?? a.pos?.y ?? 0) - (this.displayPos.get(b.id)?.y ?? b.pos?.y ?? 0));

    for (const p of walkers) {
      const pos = this.displayPos.get(p.id) ?? p.pos;
      if (!pos || pos.y + 20 < viewTop || pos.y - 12 > viewBottom) continue;
      const frame = Math.floor((time + p.seat) * 6) % 2;
      const facing = p.facing ?? 1;
      const isYou = you?.id === p.id;
      ctx.drawImage(walkerSprite(p.avatar, frame, facing), Math.round(pos.x - 6), Math.round(pos.y));
      const label = p.name.toUpperCase().slice(0, 9);
      drawText(ctx, label, pos.x, pos.y + 18, isYou ? '#ffd869' : '#fdfaf2', {
        align: 'center',
        shadow: 'rgba(0,0,0,0.45)',
      });
      if (this.hoverPlayer?.id === p.id) {
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.strokeRect(pos.x - 8, pos.y - 2, 16, 22);
      }
    }
  }

  private idleBob(p: PlayerPublic, time: number, sn: number): number {
    const recent = store.recentActivity.get(p.id) ?? 0;
    const active = sn - recent < 3_000;
    const speed = active ? 4 : 1.5 + Math.min(3, p.bps / 50);
    return Math.round(Math.sin(time * speed + p.seat) * (active ? 2 : 1));
  }

  private isActivelyWorking(p: PlayerPublic, sn: number): boolean {
    const recent = store.recentActivity.get(p.id) ?? 0;
    return sn - recent < 2_500;
  }

  private drawScribble(x: number, y: number, time: number): void {
    const { ctx } = this;
    ctx.fillStyle = '#4a6bd4';
    const phase = Math.floor(time * 8) % 3;
    ctx.fillRect(x, y + phase, 2, 1);
    ctx.fillRect(x + 2, y + ((phase + 1) % 3), 2, 1);
  }

  private drawTeacher(time: number): void {
    const { ctx } = this;
    const ev = store.event;
    if (ev?.kind === 'patrol') {
      const elapsed = Math.max(0, (store.serverNow() - ev.startedAt) / 1000);
      const aisleX = GRID_X + 3 * CELL_W - 10;
      const topY = 62;
      const bottomY = this.worldH() - 30;
      const len = bottomY - topY;
      const speed = 22;
      const d = (elapsed * speed) % (len * 2);
      const y = d < len ? topY + d : bottomY - (d - len);
      const frame = Math.floor(elapsed * 4) % 2;
      ctx.drawImage(teacherSprite(frame), Math.round(aisleX), Math.round(y));
      ctx.strokeStyle = 'rgba(224,74,58,0.35)';
      ctx.strokeRect(Math.round(aisleX) - 6.5, Math.round(y) - 4.5, 22, 26);
    } else {
      ctx.drawImage(teacherSprite(0), 52, 44);
      void time;
    }
  }

  private onActivity(a: ActivityEntry): void {
    const p = store.roster.get(a.id);
    if (!p) return;
    const pos = this.entityPos(p);
    if (!pos) return;
    this.fx.activity(pos.x, pos.y - 14, a.kind, a.meta);
    store.recentActivity.set(a.id, a.ts);
  }

  private onSteal(attackerId: string, victimId: string, amount: number, caught: boolean): void {
    const attacker = store.roster.get(attackerId);
    const victim = store.roster.get(victimId);
    if (!attacker || !victim) return;
    const a = this.entityPos(attacker) ?? seatPos(attacker.seat);
    const v = this.entityPos(victim) ?? seatPos(victim.seat);
    const you = store.you;

    if (caught) {
      this.fx.plane(a.x, a.y, 30, 56, () => {
        this.fx.floater(a.x, a.y - 8, '!!!', '#e04a3a');
      });
      return;
    }

    this.fx.plane(a.x, a.y, v.x, v.y, () => {
      this.fx.floater(v.x, v.y - 8, `-${fmt(amount)}`, '#ff9a8a');
      this.fx.floater(a.x, a.y - 8, `+${fmt(amount)}`, '#a8e8a0');
      if (you && victimId === you.id) {
        you.bp = Math.max(0, you.bp - amount);
      }
    });
  }
}

function getPatrolLabel(): string {
  return t('event.patrol.banner').split('—')[0]!.trim();
}

import { SEATS_PER_ROW } from '@shared/balance';
import type { PlayerPublic } from '@shared/types';
import { t } from '../i18n';
import { fmt } from '../format';
import { store } from '../state';
import { drawText, textWidth } from './font';
import { Fx } from './fx';
import {
  boardSprite,
  deskSprite,
  DESK_W,
  doorSprite,
  PAL,
  posterSprite,
  studentSprite,
  teacherDeskSprite,
  teacherSprite,
  windowSprite,
  zzzIcon,
} from './sprites';

export const WORLD_W = 232;
const WALL_H = 52;
const DESK_TOP = 78;
const CELL_W = 36;
const ROW_H = 36;
const GRID_X = 12;

export interface DeskHit {
  player: PlayerPublic;
  screenX: number;
  screenY: number;
}

export function seatPos(seat: number): { x: number; y: number } {
  return {
    x: GRID_X + (seat % SEATS_PER_ROW) * CELL_W,
    y: DESK_TOP + Math.floor(seat / SEATS_PER_ROW) * ROW_H,
  };
}

export class Scene {
  readonly fx = new Fx();
  onDeskClick: ((hit: DeskHit) => void) | null = null;
  onOwnDeskClick: (() => void) | null = null;

  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private scale = 3;
  private offsetX = 0;
  private camY = 0;
  private viewW = 0;
  private viewH = 0;
  private hoverSeatPlayer: PlayerPublic | null = null;
  private dragging = false;
  private dragMoved = 0;
  private dragStartY = 0;
  private dragStartCam = 0;
  private lastTime = performance.now();
  private teacherFrom = { x: 58, y: 40 };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.bindInput();
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement!);
    this.resize();

    store.on('steal', (s) => this.onSteal(s.attacker, s.victim, s.amount, s.caught));
    store.on('emote', ({ id, e }) => {
      const p = store.roster.get(id);
      if (!p) return;
      const pos = seatPos(p.seat);
      this.fx.emote(pos.x + DESK_W - 6, pos.y - 16, e);
    });
    store.on('goalDone', () => this.fx.confettiBurst(WORLD_W, this.camY, this.viewH));

    requestAnimationFrame(() => this.frame());
  }

  /** World height for the current roster. */
  private worldH(): number {
    let maxSeat = 11;
    for (const p of store.roster.values()) maxSeat = Math.max(maxSeat, p.seat);
    const rows = Math.floor(maxSeat / SEATS_PER_ROW) + 1;
    return DESK_TOP + rows * ROW_H + 16;
  }

  scrollToOwnDesk(): void {
    const you = store.you;
    if (!you) return;
    const pos = seatPos(you.seat);
    this.camY = Math.max(0, Math.min(pos.y - this.viewH / 2, this.worldH() - this.viewH));
  }

  clickFloaterAtOwnDesk(text: string): void {
    const you = store.you;
    if (!you) return;
    const pos = seatPos(you.seat);
    this.fx.floater(pos.x + DESK_W / 2, pos.y - 10, text, '#ffe9a3');
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
      this.hoverSeatPlayer = world ? this.playerAt(world.x, world.y) : null;
      c.style.cursor = this.hoverSeatPlayer ? 'pointer' : 'default';
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
      if (!hit) return;
      if (store.you && hit.id === store.you.id) {
        this.onOwnDeskClick?.();
      } else {
        this.onDeskClick?.({ player: hit, screenX: ev.clientX, screenY: ev.clientY });
      }
    });
    c.addEventListener('wheel', (ev) => {
      ev.preventDefault();
      this.camY = this.clampCam(this.camY + ev.deltaY / this.cssScale());
    }, { passive: false });
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

  private playerAt(x: number, y: number): PlayerPublic | null {
    for (const p of store.roster.values()) {
      const pos = seatPos(p.seat);
      if (x >= pos.x - 2 && x <= pos.x + DESK_W + 2 && y >= pos.y - 8 && y <= pos.y + 31) {
        return p;
      }
    }
    return null;
  }

  /** CSS-pixel center of a seat's desk (for tests and DOM overlays). */
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

  // ------------------------------------------------------------------ Frame

  private frame(): void {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastTime) / 1000);
    this.lastTime = now;

    store.frameAdvance();
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
    this.drawDesks(viewTop, viewBottom, time);
    this.drawTeacher(time);
    this.fx.draw(ctx);
  }

  private drawRoomShell(viewTop: number, viewBottom: number, time: number): void {
    const { ctx } = this;
    const worldH = Math.max(this.worldH(), viewBottom);

    // Floor with plank lines.
    ctx.fillStyle = PAL.floor;
    ctx.fillRect(0, WALL_H, WORLD_W, worldH - WALL_H);
    ctx.fillStyle = PAL.floorLine;
    for (let y = WALL_H + 6; y < worldH; y += 7) {
      if (y > viewTop - 8 && y < viewBottom + 8) ctx.fillRect(0, y, WORLD_W, 1);
    }
    // Plank joints, pseudo-random but stable.
    for (let y = WALL_H; y < worldH; y += 7) {
      if (y < viewTop - 8 || y > viewBottom + 8) continue;
      for (let k = 0; k < 4; k++) {
        const jx = ((y * 37 + k * 61) % WORLD_W + WORLD_W) % WORLD_W;
        ctx.fillRect(jx, y + 1, 1, 5);
      }
    }

    if (viewTop < WALL_H + 8) {
      // Wall
      ctx.fillStyle = PAL.wall;
      ctx.fillRect(0, 0, WORLD_W, WALL_H);
      ctx.fillStyle = PAL.wallDark;
      ctx.fillRect(0, WALL_H - 2, WORLD_W, 2);

      // Furniture along the wall
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
    ctx.beginPath();
    // Pixel circle: draw as diamond-ish blob
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

    // Line 1: event or title
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

    // Line 2: class goal progress bar
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

    // Line 3: top three by production
    const online = [...store.roster.values()].filter((p) => p.online);
    online.sort((a, b) => b.bps - a.bps);
    const parts = online.slice(0, 3).map((p, i) => `${i + 1}.${p.name.toUpperCase().slice(0, 7)}`);
    drawText(ctx, parts.join(' '), bx, 30, PAL.chalk);
    // Goal level chalk note
    drawText(ctx, `LVL ${goal.level + 1}`, bx + bw, 30, PAL.chalkDim, { align: 'right' });
  }

  private drawDesks(viewTop: number, viewBottom: number, time: number): void {
    const { ctx } = this;
    const players = [...store.roster.values()].sort((a, b) => a.seat - b.seat);
    const you = store.you;

    for (const p of players) {
      const pos = seatPos(p.seat);
      if (pos.y + 30 < viewTop || pos.y - 12 > viewBottom) continue;
      const isYou = you?.id === p.id;
      const sleeping = !p.online;

      ctx.globalAlpha = sleeping ? 0.55 : 1;

      // Student behind the desk (we see their back; desk is closer to the board).
      ctx.drawImage(studentSprite(p.avatar), pos.x + 7, pos.y + 6);
      ctx.drawImage(deskSprite(p.deskTier), pos.x, pos.y - 4);

      // Detention marker
      if (p.detention) {
        drawText(ctx, '!', pos.x + DESK_W + 1, pos.y + 2, '#e04a3a', { shadow: '#5a1a12' });
      }

      ctx.globalAlpha = 1;

      // Name caption below the student, like a class photo.
      const label = p.name.toUpperCase().slice(0, 9) + (p.grade > 0 ? `★${p.grade}` : '');
      const nameColor = isYou ? '#ffd869' : sleeping ? '#8d94a0' : '#fdfaf2';
      drawText(ctx, label, pos.x + DESK_W / 2, pos.y + 24, nameColor, {
        align: 'center',
        shadow: 'rgba(0,0,0,0.45)',
      });

      if (isYou) {
        // Bobbing marker above own desk
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

      // Hover highlight
      if (this.hoverSeatPlayer?.id === p.id && !isYou) {
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.lineWidth = 1;
        ctx.strokeRect(pos.x - 1.5, pos.y - 5.5, DESK_W + 3, 36);
      }
    }
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
      // Danger aura
      ctx.strokeStyle = 'rgba(224,74,58,0.35)';
      ctx.strokeRect(Math.round(aisleX) - 6.5, Math.round(y) - 4.5, 22, 26);
    } else {
      // Idle beside the teacher desk
      ctx.drawImage(teacherSprite(0), 52, 44);
      void time;
    }
  }

  // --------------------------------------------------------------------- FX

  private onSteal(attackerId: string, victimId: string, amount: number, caught: boolean): void {
    const attacker = store.roster.get(attackerId);
    const victim = store.roster.get(victimId);
    if (!attacker || !victim) return;
    const a = seatPos(attacker.seat);
    const v = seatPos(victim.seat);
    const you = store.you;

    if (caught) {
      // Plane arcs sadly toward the teacher's desk.
      this.fx.plane(a.x + DESK_W / 2, a.y, 30, 56, () => {
        this.fx.floater(a.x + DESK_W / 2, a.y - 8, '!!!', '#e04a3a');
      });
      return;
    }

    this.fx.plane(a.x + DESK_W / 2, a.y, v.x + DESK_W / 2, v.y, () => {
      this.fx.floater(v.x + DESK_W / 2, v.y - 8, `-${fmt(amount)}`, '#ff9a8a');
      this.fx.floater(a.x + DESK_W / 2, a.y - 8, `+${fmt(amount)}`, '#a8e8a0');
      if (you && victimId === you.id) {
        // Local prediction of the loss (authoritative 'you' follows).
        you.bp = Math.max(0, you.bp - amount);
      }
    });
  }
}

function getPatrolLabel(): string {
  return t('event.patrol.banner').split('—')[0]!.trim();
}

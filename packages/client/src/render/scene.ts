import { NAME_MAX, SEATS_PER_ROW } from '@shared/balance';
import type { PlayerPublic } from '@shared/types';
import { t } from '../i18n';
import { fmt } from '../format';
import { store } from '../state';
import { drawText, textWidth } from './font';
import { Fx } from './fx';
import {
  boardSprite,
  bookshelfSprite,
  chairSprite,
  clockSprite,
  deskSprite,
  DESK_W,
  doorSprite,
  folderSprite,
  PAL,
  plantSprite,
  posterSprite,
  studentSprite,
  teacherDeskSprite,
  teacherSprite,
  windowSprite,
  zzzIcon,
} from './sprites';

export const WORLD_W = 232;
const WALL_H = 60;
const DESK_TOP = 86;
const CELL_W = 36;
const ROW_H = 38;
const GRID_X = 12;
const BOARD_X = 46;
const BOARD_Y = 16;
const BOARD_W = 128;
const BOARD_H = 38;
/** Chalkboard leaderboard entries show the full username (up to NAME_MAX). */
const BOARD_NAME_MAX = NAME_MAX;
/**
 * Desk captions must fit in one seat cell so neighbouring names don't collide.
 * Longer names are ellipsised; hover still reveals the full plate.
 */
const DESK_LABEL_MAX_W = CELL_W - 2;

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

/** Ellipsis-truncate a desk username so the caption stays within one seat cell. */
function deskLabel(name: string, grade: number): string {
  const gradeSuffix = grade > 0 ? `★${grade}` : '';
  const full = name.toUpperCase();
  const budget = Math.max(0, DESK_LABEL_MAX_W - textWidth(gradeSuffix));
  if (textWidth(full) <= budget) return full + gradeSuffix;
  const ellipsis = '...';
  const ellipsisW = textWidth(ellipsis);
  let cut = '';
  for (const ch of full) {
    const next = cut + ch;
    if (textWidth(next) + ellipsisW > budget) break;
    cut = next;
  }
  return cut + ellipsis + gradeSuffix;
}

export class Scene {
  readonly fx = new Fx();
  onDeskClick: ((hit: DeskHit) => void) | null = null;
  onOwnDeskClick: (() => void) | null = null;

  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private scale = 3;
  /** Horizontal inset (world units) centering the fixed-width classroom. */
  private contentOffsetX = 0;
  /** Vertical inset (world units) centering short rooms in tall viewports. */
  private contentOffsetY = 0;
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

    store.on('steal', (s) => this.onSteal(s));
    store.on('busy', ({ id }) => {
      const p = store.roster.get(id);
      if (!p) return;
      const pos = seatPos(p.seat);
      this.fx.floater(pos.x + DESK_W / 2, pos.y - 8, t('steal.busyFx'), '#ffd869');
    });
    store.on('event', (ev) => {
      if (ev?.kind === 'recess') this.fx.confettiBurst(this.viewW, this.camY, this.viewH);
    });
    store.on('emote', ({ id, e }) => {
      const p = store.roster.get(id);
      if (!p) return;
      const pos = seatPos(p.seat);
      this.fx.emote(pos.x + DESK_W - 6, pos.y - 16, e);
    });
    store.on('goalDone', () => this.fx.confettiBurst(this.viewW, this.camY, this.viewH));

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
    const x = px / this.scale - this.contentOffsetX;
    const y = py / this.scale + this.camY - this.contentOffsetY;
    if (x < 0 || x > WORLD_W) return null;
    return { x, y };
  }

  private playerAt(x: number, y: number): PlayerPublic | null {
    for (const p of store.roster.values()) {
      const pos = seatPos(p.seat);
      if (x >= pos.x - 2 && x <= pos.x + DESK_W + 2 && y >= pos.y - 8 && y <= pos.y + 34) {
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
      x: rect.left + ((this.contentOffsetX + pos.x + DESK_W / 2) * this.scale) / dpr,
      y: rect.top + ((pos.y + 4 - this.camY + this.contentOffsetY) * this.scale) / dpr,
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
    this.viewW = w / this.scale;
    this.viewH = h / this.scale;
    this.updateOffsets();
  }

  /** Centers the fixed-size classroom in whatever viewport we were given. */
  private updateOffsets(): void {
    this.contentOffsetX = (this.viewW - WORLD_W) / 2;
    this.contentOffsetY = Math.max(0, Math.floor((this.viewH - this.worldH()) / 2));
  }

  // ------------------------------------------------------------------ Frame

  private frame(): void {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastTime) / 1000);
    this.lastTime = now;

    store.frameAdvance();
    this.fx.update(dt);
    this.updateOffsets();
    this.draw(now / 1000);

    requestAnimationFrame(() => this.frame());
  }

  private draw(time: number): void {
    const { ctx } = this;
    const camY = Math.round(this.camY * this.scale) / this.scale;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#241c14';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, (this.contentOffsetY - camY) * this.scale);

    const viewTop = camY - this.contentOffsetY;
    const viewBottom = camY + this.viewH - this.contentOffsetY;

    this.drawRoomShell(viewTop, viewBottom, time);
    ctx.save();
    ctx.translate(this.contentOffsetX, 0);
    this.drawDesks(viewTop, viewBottom, time);
    this.drawTeacher(time);
    this.fx.draw(ctx);
    ctx.restore();
  }

  private drawRoomShell(viewTop: number, viewBottom: number, time: number): void {
    const { ctx } = this;
    // Wall and floor stretch to the viewport edges in every direction, so a
    // short room in a tall phone viewport still reads as one continuous room.
    const wallTop = Math.min(0, viewTop);
    const floorBottom = Math.max(this.worldH(), viewBottom);
    const viewW = this.viewW;

    // Floor with plank lines — extend across the full viewport width.
    ctx.fillStyle = PAL.floor;
    ctx.fillRect(0, WALL_H, viewW, floorBottom - WALL_H);
    ctx.fillStyle = PAL.floorDark;
    ctx.fillRect(0, WALL_H, viewW, 2);
    ctx.fillStyle = PAL.floorLine;
    for (let y = WALL_H + 8; y < floorBottom; y += 8) {
      if (y > viewTop - 8 && y < viewBottom + 8) ctx.fillRect(0, y, viewW, 1);
    }
    for (let y = WALL_H; y < floorBottom; y += 8) {
      if (y < viewTop - 8 || y > viewBottom + 8) continue;
      for (let k = 0; k < 5; k++) {
        const jx = ((y * 37 + k * 61) % viewW + viewW) % viewW;
        ctx.fillRect(jx, y + 1, 1, 6);
      }
    }

    if (viewTop < WALL_H + 8) {
      ctx.fillStyle = PAL.wall;
      ctx.fillRect(0, wallTop, viewW, WALL_H - wallTop);
      ctx.fillStyle = PAL.wallDark;
      ctx.fillRect(0, WALL_H - 5, viewW, 5);
      ctx.fillStyle = PAL.wood;
      ctx.fillRect(0, WALL_H - 4, viewW, 3);
      ctx.fillStyle = PAL.ink;
      ctx.fillRect(0, WALL_H - 5, viewW, 1);
      ctx.fillStyle = PAL.woodDark;
      ctx.fillRect(0, WALL_H - 1, viewW, 1);

      ctx.save();
      ctx.translate(this.contentOffsetX, 0);
      ctx.drawImage(bookshelfSprite(), 1, 12);
      ctx.drawImage(windowSprite(), 20, 5);
      ctx.drawImage(boardSprite(BOARD_W, BOARD_H), BOARD_X, BOARD_Y);
      ctx.drawImage(posterSprite(0), 176, 6);
      ctx.drawImage(posterSprite(1), 176, 26);
      ctx.drawImage(doorSprite(), 194, 22);
      ctx.drawImage(clockSprite(), 214, 6);
      ctx.drawImage(plantSprite(), 221, WALL_H - 2);
      ctx.drawImage(teacherDeskSprite(), 20, WALL_H);
      this.drawLogo();
      this.drawBoardContent(time);
      ctx.restore();
    }
  }

  private drawLogo(): void {
    const { ctx } = this;
    const scale = 2;
    const left = 'CLASSROOM.';
    const right = 'IO';
    const gap = scale;
    const total = textWidth(left) * scale + gap + textWidth(right) * scale;
    const x0 = Math.round(WORLD_W / 2 - total / 2);
    const y = 1;
    drawText(ctx, left, x0, y, '#ffffff', { scale, outline: PAL.ink });
    drawText(ctx, right, x0 + textWidth(left) * scale + gap, y, PAL.gold, { scale, outline: PAL.ink });
  }

  private drawBoardContent(time: number): void {
    const { ctx } = this;
    const bx = BOARD_X + 6;
    const bw = BOARD_W - 12;
    const ev = store.event;
    const sn = store.serverNow();
    let y = BOARD_Y + 6;

    if (ev) {
      const secs = Math.max(0, Math.ceil((ev.endsAt - sn) / 1000));
      let line1 = '';
      let line1Color: string = PAL.chalk;
      if (ev.kind === 'quiz') line1 = `${t('event.quiz.title')} ${ev.question ?? ''} (${secs})`;
      else if (ev.kind === 'patrol') {
        line1 = `${getPatrolLabel()} (${secs})`;
        line1Color = time % 1 < 0.5 ? '#f0b0a0' : PAL.chalk;
      } else if (ev.kind === 'recess') {
        line1 = `${getRecessLabel()} (${secs})`;
        line1Color = time % 1 < 0.5 ? '#ffd869' : PAL.chalk;
      } else line1 = `${t('event.sub.banner').split('—')[0]!.trim()} (${secs})`;
      drawText(ctx, line1.toUpperCase().slice(0, 30), bx + bw / 2, y, line1Color, { align: 'center' });
      y += 8;
    }

    const goal = store.goal;
    const frac = Math.max(0, Math.min(1, goal.progress / goal.target));
    drawText(ctx, t('goal.title'), bx, y, PAL.chalk);
    const barX = bx + textWidth(t('goal.title')) + 4;
    const barW = Math.max(12, bw - (barX - bx) - 26);
    ctx.fillStyle = PAL.ink;
    ctx.fillRect(barX - 1, y - 1, barW + 2, 7);
    ctx.fillStyle = PAL.boardDark;
    ctx.fillRect(barX, y, barW, 5);
    ctx.fillStyle = '#5ee06a';
    ctx.fillRect(barX, y, Math.round(barW * frac), 5);
    drawText(ctx, `${Math.floor(frac * 100)}%`, bx + bw, y, PAL.chalk, { align: 'right' });
    y += 10;

    const online = [...store.roster.values()].filter((p) => p.online);
    online.sort((a, b) => b.bps - a.bps);
    const parts = online
      .slice(0, 3)
      .map((p, i) => `${i + 1}.${p.name.toUpperCase().slice(0, BOARD_NAME_MAX)}`);
    while (parts.length > 1 && textWidth(parts.join(' ')) > bw - 30) parts.pop();
    drawText(ctx, parts.join(' '), bx, y, PAL.chalk);
    drawText(ctx, `LVL ${goal.level + 1}`, bx + bw, y, PAL.gold, { align: 'right' });
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

      const chair = chairSprite();
      const stu = studentSprite(p.avatar);
      const desk = deskSprite(p.deskTier, p.deskSkin || 'wood');
      ctx.drawImage(chair, pos.x + Math.round((DESK_W - chair.width) / 2), pos.y + 10);
      ctx.drawImage(stu, pos.x + Math.round((DESK_W - stu.width) / 2), pos.y + 4);
      ctx.drawImage(desk, pos.x - Math.floor((desk.width - DESK_W) / 2), pos.y - 5);

      // Detention / ink / looking-busy markers
      if (p.detention) {
        drawText(ctx, '!', pos.x + DESK_W + 1, pos.y + 2, '#e04a3a', { shadow: '#5a1a12' });
      }
      if (p.inked) {
        ctx.fillStyle = 'rgba(20, 30, 55, 0.55)';
        ctx.fillRect(pos.x + 4, pos.y + 2, 8, 5);
        ctx.fillRect(pos.x + 10, pos.y + 5, 5, 3);
      }
      if (p.busy) {
        ctx.drawImage(folderSprite, pos.x + 2, pos.y - 2);
      }

      ctx.globalAlpha = 1;

      // Name caption below the student, like a class photo. A desk cell is only
      // 36 world px wide, so long usernames are ellipsised — hovering shows the
      // full username on a plate that may overlap neighbouring desks.
      const label = deskLabel(p.name, p.grade);
      const nameColor = isYou ? '#ffd869' : sleeping ? '#8d94a0' : '#fdfaf2';
      drawText(ctx, label, pos.x + DESK_W / 2, pos.y + 26, nameColor, {
        align: 'center',
        shadow: PAL.ink,
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
        ctx.strokeRect(pos.x - 1.5, pos.y - 6.5, DESK_W + 3, 38);
      }
    }

    // Full username of the hovered desk, on top of everything else.
    const hovered = this.hoverSeatPlayer;
    if (hovered) this.drawNamePlate(hovered);
  }

  /** Untruncated username (up to NAME_MAX) on a plate above the desk. */
  private drawNamePlate(p: PlayerPublic): void {
    const { ctx } = this;
    const pos = seatPos(p.seat);
    const text = p.name.toUpperCase().slice(0, NAME_MAX);
    const w = textWidth(text) + 6;
    const cx = pos.x + DESK_W / 2;
    const x = Math.round(Math.max(1, Math.min(cx - w / 2, WORLD_W - w - 1)));
    const y = pos.y - 14;
    ctx.fillStyle = 'rgba(20,16,12,0.88)';
    ctx.fillRect(x, y, w, 10);
    ctx.fillStyle = '#e8b23a';
    ctx.fillRect(x, y, w, 1);
    ctx.fillRect(x, y + 9, w, 1);
    drawText(ctx, text, x + w / 2, y + 2, '#fdfaf2', { align: 'center' });
  }

  private drawTeacher(time: number): void {
    const { ctx } = this;
    const ev = store.event;
    if (ev?.kind === 'patrol') {
      const elapsed = Math.max(0, (store.serverNow() - ev.startedAt) / 1000);
      const aisleX = GRID_X + 3 * CELL_W - 10;
      const topY = WALL_H + 8;
      const bottomY = this.worldH() - 30;
      const len = bottomY - topY;
      const speed = 22;
      const d = (elapsed * speed) % (len * 2);
      const y = d < len ? topY + d : bottomY - (d - len);
      const frame = Math.floor(elapsed * 4) % 2;
      const sprite = teacherSprite(frame);
      const tx = Math.round(aisleX);
      const ty = Math.round(y);
      ctx.drawImage(sprite, tx, ty);
      ctx.strokeStyle = 'rgba(224,74,58,0.35)';
      ctx.strokeRect(tx - 4.5, ty - 3.5, sprite.width + 8, sprite.height + 6);
    } else {
      const idle = teacherSprite(0, true);
      ctx.drawImage(idle, 40, WALL_H - idle.height + 2);
    }
    void time;
  }

  // --------------------------------------------------------------------- FX

  private onSteal(s: {
    attacker: string;
    victim: string;
    amount: number;
    caught: boolean;
    kind: string;
    blocked: boolean;
  }): void {
    const attacker = store.roster.get(s.attacker);
    const victim = store.roster.get(s.victim);
    if (!attacker || !victim) return;
    const a = seatPos(attacker.seat);
    const v = seatPos(victim.seat);
    const you = store.you;
    const ax = a.x + DESK_W / 2;
    const ay = a.y;
    const vx = v.x + DESK_W / 2;
    const vy = v.y;

    const fly =
      s.kind === 'spitball'
        ? (cb: () => void) => this.fx.spit(ax, ay, vx, vy, cb)
        : s.kind === 'ink'
          ? (cb: () => void) => this.fx.ink(ax, ay, vx, vy, cb)
          : (cb: () => void) => this.fx.plane(ax, ay, vx, vy, cb);

    if (s.caught) {
      this.fx.plane(ax, ay, 38, WALL_H + 4, () => {
        this.fx.floater(ax, ay - 8, '!!!', '#e04a3a');
      });
      return;
    }

    fly(() => {
      if (s.blocked) {
        this.fx.floater(vx, vy - 8, t('steal.blockedFx'), '#ffd869');
        return;
      }
      if (s.kind === 'ink') {
        this.fx.floater(vx, vy - 8, t('steal.inkFx'), '#7d8ec9');
        return;
      }
      this.fx.floater(vx, vy - 8, `-${fmt(s.amount)}`, '#ff9a8a');
      this.fx.floater(ax, ay - 8, `+${fmt(s.amount)}`, '#a8e8a0');
      if (you && s.victim === you.id) {
        you.bp = Math.max(0, you.bp - s.amount);
      }
    });
  }
}

function getPatrolLabel(): string {
  return t('event.patrol.banner').split('—')[0]!.trim();
}

function getRecessLabel(): string {
  return t('event.recess.banner').split('—')[0]!.trim();
}

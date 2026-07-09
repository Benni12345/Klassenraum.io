import { drawText } from './font';
import type { ActivityKind } from '@shared/types';
import { emoteSprites, planeSprite } from './sprites';

interface Floater {
  x: number;
  y: number;
  text: string;
  color: string;
  age: number;
  ttl: number;
}

interface Plane {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  age: number;
  ttl: number;
  onArrive?: () => void;
}

interface Bubble {
  x: number;
  y: number;
  e: number;
  age: number;
  ttl: number;
}

interface Confetto {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  age: number;
}

interface ActBubble {
  x: number;
  y: number;
  kind: ActivityKind;
  meta?: string;
  age: number;
  ttl: number;
}

const ACT_ICON: Record<ActivityKind, string> = {
  click: '✏',
  buy: '+',
  upgrade: '↑',
  prestige: '★',
  steal: '✈',
  quiz: '✓',
};

const CONFETTI_COLORS = ['#c94f4f', '#4a6bd4', '#3f9e4d', '#e8b23a', '#e88ad4', '#2fa3a3'];

/** Transient visual effects in world coordinates. */
export class Fx {
  private floaters: Floater[] = [];
  private planes: Plane[] = [];
  private bubbles: Bubble[] = [];
  private actBubbles: ActBubble[] = [];
  private confetti: Confetto[] = [];

  floater(x: number, y: number, text: string, color: string): void {
    if (this.floaters.length > 40) this.floaters.shift();
    this.floaters.push({ x: x + (Math.random() * 10 - 5), y, text, color, age: 0, ttl: 1.4 });
  }

  plane(x0: number, y0: number, x1: number, y1: number, onArrive?: () => void): void {
    this.planes.push({ x0, y0, x1, y1, age: 0, ttl: 0.9, onArrive });
  }

  emote(x: number, y: number, e: number): void {
    this.bubbles = this.bubbles.filter((b) => Math.abs(b.x - x) > 2 || Math.abs(b.y - y) > 2);
    this.bubbles.push({ x, y, e, age: 0, ttl: 3 });
  }

  activity(x: number, y: number, kind: ActivityKind, meta?: string): void {
    this.actBubbles = this.actBubbles.filter(
      (b) => Math.abs(b.x - x) > 2 || Math.abs(b.y - y) > 2,
    );
    this.actBubbles.push({ x, y, kind, meta, age: 0, ttl: 3.5 });
  }

  confettiBurst(width: number, camY: number, viewH: number): void {
    for (let i = 0; i < 60; i++) {
      this.confetti.push({
        x: Math.random() * width,
        y: camY - 10 - Math.random() * 30,
        vx: Math.random() * 16 - 8,
        vy: 30 + Math.random() * 40,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length]!,
        age: 0,
      });
    }
    // Cap total particles so repeated goals can't accumulate.
    if (this.confetti.length > 240) this.confetti.splice(0, this.confetti.length - 240);
    void viewH;
  }

  update(dt: number): void {
    for (const f of this.floaters) {
      f.age += dt;
      f.y -= 14 * dt;
    }
    this.floaters = this.floaters.filter((f) => f.age < f.ttl);

    for (const p of this.planes) {
      p.age += dt;
      if (p.age >= p.ttl && p.onArrive) {
        p.onArrive();
        p.onArrive = undefined;
      }
    }
    this.planes = this.planes.filter((p) => p.age < p.ttl);

    for (const b of this.bubbles) b.age += dt;
    this.bubbles = this.bubbles.filter((b) => b.age < b.ttl);

    for (const a of this.actBubbles) a.age += dt;
    this.actBubbles = this.actBubbles.filter((a) => a.age < a.ttl);

    for (const c of this.confetti) {
      c.age += dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.vy += 20 * dt;
    }
    this.confetti = this.confetti.filter((c) => c.age < 4);
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const c of this.confetti) {
      ctx.fillStyle = c.color;
      ctx.fillRect(Math.round(c.x), Math.round(c.y), 2, 2);
    }

    for (const p of this.planes) {
      const t = Math.min(1, p.age / p.ttl);
      const cx = (p.x0 + p.x1) / 2;
      const cy = Math.min(p.y0, p.y1) - 26;
      const x = (1 - t) * (1 - t) * p.x0 + 2 * (1 - t) * t * cx + t * t * p.x1;
      const y = (1 - t) * (1 - t) * p.y0 + 2 * (1 - t) * t * cy + t * t * p.y1;
      // Direction for rotation (derivative of the bezier).
      const dx = 2 * (1 - t) * (cx - p.x0) + 2 * t * (p.x1 - cx);
      const dy = 2 * (1 - t) * (cy - p.y0) + 2 * t * (p.y1 - cy);
      ctx.save();
      ctx.translate(Math.round(x), Math.round(y));
      ctx.rotate(Math.atan2(dy, dx));
      ctx.drawImage(planeSprite, -3, -2);
      ctx.restore();
    }

    for (const b of this.bubbles) {
      const sprite = emoteSprites[b.e];
      if (!sprite) continue;
      const bob = Math.round(Math.sin(b.age * 4) * 1.5);
      const x = Math.round(b.x);
      const y = Math.round(b.y + bob);
      const w = sprite.width + 4;
      const h = sprite.height + 4;
      ctx.fillStyle = 'rgba(38,34,28,0.85)';
      ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
      ctx.fillStyle = '#f5efdc';
      ctx.fillRect(x, y, w, h);
      ctx.fillRect(x + 3, y + h, 2, 2); // tail
      ctx.drawImage(sprite, x + 2, y + 2);
      const fade = b.ttl - b.age;
      if (fade < 0.4) {
        ctx.fillStyle = `rgba(215,228,208,${1 - fade / 0.4})`;
        ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
      }
    }

    for (const a of this.actBubbles) {
      const bob = Math.round(Math.sin(a.age * 5) * 1.2);
      const x = Math.round(a.x);
      const y = Math.round(a.y + bob);
      const icon = ACT_ICON[a.kind] ?? '·';
      const w = 14;
      const h = 10;
      ctx.fillStyle = 'rgba(38,34,28,0.88)';
      ctx.fillRect(x - w / 2 - 1, y - 1, w + 2, h + 2);
      ctx.fillStyle = '#f5efdc';
      ctx.fillRect(x - w / 2, y, w, h);
      drawText(ctx, icon, x, y + 1, '#26221c', { align: 'center' });
      const fade = a.ttl - a.age;
      if (fade < 0.5) {
        ctx.fillStyle = `rgba(215,228,208,${1 - fade / 0.5})`;
        ctx.fillRect(x - w / 2 - 1, y - 1, w + 2, h + 2);
      }
    }

    for (const f of this.floaters) {
      const a = 1 - f.age / f.ttl;
      ctx.globalAlpha = Math.max(0, Math.min(1, a * 1.6));
      drawText(ctx, f.text, f.x, f.y, f.color, { shadow: 'rgba(0,0,0,0.4)', align: 'center' });
      ctx.globalAlpha = 1;
    }
  }
}

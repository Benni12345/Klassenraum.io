/** Shared walkable-area rules for aisle movement (client + server). */

import { SEATS_PER_ROW } from './balance.js';

export const WALK_SPEED = 50;
export const WALK_LANE_X = [30, 110, 190] as const;
export const WALK_Y_MIN = 56;
export const WALK_Y_MAX_PAD = 16;
export const LANE_TOLERANCE = 8;
/** Max distance per move message (~600 ms at WALK_SPEED). */
export const WALK_MAX_STEP = WALK_SPEED * 0.6;

export const GRID_X = 12;
export const CELL_W = 36;
export const DESK_TOP = 78;
export const DESK_W = 26;
export const ROW_H = 36;

export function seatPos(seat: number): { x: number; y: number } {
  return {
    x: GRID_X + (seat % SEATS_PER_ROW) * CELL_W,
    y: DESK_TOP + Math.floor(seat / SEATS_PER_ROW) * ROW_H,
  };
}

export function classroomWorldH(maxSeat: number): number {
  const rows = Math.floor(maxSeat / SEATS_PER_ROW) + 1;
  return DESK_TOP + rows * ROW_H + 16;
}

export function nearestWalkLane(x: number): number {
  let best = WALK_LANE_X[0]!;
  let dist = Math.abs(x - best);
  for (const lane of WALK_LANE_X) {
    const d = Math.abs(x - lane);
    if (d < dist) {
      best = lane;
      dist = d;
    }
  }
  return best;
}

export function isWalkable(x: number, y: number, worldH: number): boolean {
  if (y < WALK_Y_MIN || y > worldH - WALK_Y_MAX_PAD) return false;
  return WALK_LANE_X.some((lane) => Math.abs(x - lane) <= LANE_TOLERANCE);
}

export function snapWalkTarget(x: number, y: number, worldH: number): { x: number; y: number } | null {
  const sx = nearestWalkLane(x);
  const sy = Math.round(y);
  if (!isWalkable(sx, sy, worldH)) return null;
  return { x: sx, y: sy };
}

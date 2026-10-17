// 仮想スティックの計算（DOMに依存しない純粋な関数。テストできるように分けている）
export interface P { x: number; y: number }

export const JOY_RADIUS = 46;   // 画面上のpx（CSSピクセル）
export const DEAD_ZONE = 5;

/**
 * 指が円の外へ出たら、中心を指の方へ引っぱる（追従スティック）。
 * 中心が固定だと、大きくスワイプした後に向きを変えるには指をその分戻す必要があり、操作が遅れて感じる。
 */
export function followOrigin(o: P, p: P): P {
  const dx = p.x - o.x, dy = p.y - o.y;
  const l = Math.hypot(dx, dy);
  if (l > JOY_RADIUS) return { x: p.x - (dx / l) * JOY_RADIUS, y: p.y - (dy / l) * JOY_RADIUS };
  return o;
}

/** 移動入力（長さ0〜1）。中心から少し動かしただけで反応する */
export function stickVector(o: P, p: P): P {
  const dx = p.x - o.x, dy = p.y - o.y;
  const l = Math.hypot(dx, dy);
  if (l <= DEAD_ZONE) return { x: 0, y: 0 };
  const k = Math.min(1, l / JOY_RADIUS) / l;
  return { x: dx * k, y: dy * k };
}

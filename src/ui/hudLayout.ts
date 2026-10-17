// HUDとタッチボタンの配置（CSSピクセル）。描画（Hud / TouchControls）と当たり判定で同じ値を使う。
export interface Rect { x: number; y: number; w: number; h: number }
export interface Btn { x: number; y: number; r: number; label: string }

/** 画面の大きさに合わせた拡大率（スマホ横向き≒0.9、PC≒1.5） */
export const uiScale = (W: number, H: number): number => Math.max(0.85, Math.min(1.6, Math.min(H / 500, W / 900)));

export function pad(W: number, H: number): number {
  return 14 * uiScale(W, H);
}

export function slotRects(W: number, H: number): Rect[] {
  const u = uiScale(W, H);
  const sw = 112 * u, sh = 56 * u, gap = 8 * u;
  const total = sw * 3 + gap * 2;
  const x0 = W / 2 - total / 2, y0 = H - sh - pad(W, H);
  return [0, 1, 2].map((i) => ({ x: x0 + i * (sw + gap), y: y0, w: sw, h: sh }));
}

export function touchButtons(W: number, H: number): Record<"dash" | "clear" | "pause" | "info", Btn> {
  const p = pad(W, H);
  const r = Math.max(30, Math.min(48, H * 0.1));
  return {
    dash: { x: W - p - r, y: H - p - r, r, label: "回避" },
    clear: { x: W - p - r * 3.1, y: H - p - r * 0.7, r: r * 0.65, label: "解除" },
    pause: { x: W - p - 22, y: p + 22, r: 22, label: "II" },
    info: { x: W - p - 72, y: p + 22, r: 22, label: "i" },
  };
}

export const inRect = (x: number, y: number, r: Rect, grow = 0): boolean =>
  x >= r.x - grow && x <= r.x + r.w + grow && y >= r.y - grow && y <= r.y + r.h + grow;

export const hitButton = (x: number, y: number, b: Btn): boolean => Math.hypot(x - b.x, y - b.y) <= b.r + 10;

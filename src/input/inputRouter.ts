// キーボード・マウス・タッチを「プレイヤーの意図」に変換する層。
// ゲーム側（main / Simulation）は入力デバイスを知らず、ここのコールバックと moveVector() だけを使う。
// ゲームパッド対応を足すときもここだけを触ればよい。
import { inRect, slotRects } from "../ui/hudLayout.ts";
import type { P } from "./stick.ts";

const MOVE: Record<string, [number, number]> = {
  KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0],
  KeyW: [0, -1], ArrowUp: [0, -1], KeyS: [0, 1], ArrowDown: [0, 1],
};

export class InputRouter {
  gameplayEnabled = false;
  touchMode = false;
  touchMove: P = { x: 0, y: 0 };
  mouse: P = { x: 0, y: 0 };
  mouseInside = false;
  W = 0;
  H = 0;
  private keys = new Set<string>();

  onSummonAt: (x: number, y: number) => void = () => {};
  onOrderAt: (x: number, y: number) => void = () => {};
  onDash: () => void = () => {};
  onSlot: (i: number) => void = () => {};
  onSlotCycle: (d: number) => void = () => {};
  onClear: () => void = () => {};
  onPause: () => void = () => {};
  onInfo: (show: boolean) => void = () => {};
  onDebug: () => void = () => {};
  onHotkey: (i: number) => void = () => {};
  onTouchMode: (on: boolean) => void = () => {};
  onBlur: () => void = () => {};
  onAnyInput: () => void = () => {};

  attach(cv: HTMLCanvasElement): void {
    addEventListener("keydown", (e) => {
      this.onAnyInput();
      this.setTouchMode(false);
      if (this.gameplayEnabled && (e.code === "Space" || e.code === "Tab" || e.code.startsWith("Arrow"))) e.preventDefault();
      this.keys.add(e.code);
      if (e.repeat) return;
      if (e.code === "Escape" || e.code === "KeyP") return this.onPause();
      if (e.code === "F3") { e.preventDefault(); return this.onDebug(); }
      const m = /^Digit([123])$/.exec(e.code);
      if (m) {
        const i = Number(m[1]) - 1;
        this.onHotkey(i);   // レベルアップ画面中は強化選択に使う
        if (this.gameplayEnabled) this.onSlot(i);
        return;
      }
      if (!this.gameplayEnabled) return;
      if (e.code === "Tab") this.onInfo(true);
      else if (e.code === "Space") this.onDash();
      else if (e.code === "KeyR") this.onClear();
    });
    addEventListener("keyup", (e) => {
      this.keys.delete(e.code);
      if (e.code === "Tab") this.onInfo(false);
    });
    addEventListener("blur", () => {
      this.keys.clear();
      this.touchMove = { x: 0, y: 0 };
      this.onBlur();
    });
    document.addEventListener("visibilitychange", () => { if (document.hidden) this.onBlur(); });

    // マウス（タッチは TouchControls が受け持つ）
    const pos = (e: PointerEvent | WheelEvent): P => {
      const r = cv.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    cv.addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse") return;
      const p = pos(e);
      if (Math.hypot(p.x - this.mouse.x, p.y - this.mouse.y) > 3) this.setTouchMode(false);
      this.mouse = p;
      this.mouseInside = true;
    });
    cv.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") this.mouseInside = false; });
    cv.addEventListener("pointerdown", (e) => {
      if (e.pointerType !== "mouse") return;
      this.onAnyInput();
      this.setTouchMode(false);
      cv.focus();
      if (!this.gameplayEnabled) return;
      const p = pos(e);
      this.mouse = p;
      this.mouseInside = true;
      const rects = slotRects(this.W, this.H);
      for (let i = 0; i < rects.length; i++) if (inRect(p.x, p.y, rects[i])) return this.onSlot(i);
      if (e.button === 0) this.onSummonAt(p.x, p.y);
      else if (e.button === 2) this.onOrderAt(p.x, p.y);
    });
    cv.addEventListener("wheel", (e) => {
      if (!this.gameplayEnabled) return;
      e.preventDefault();
      this.onSlotCycle(e.deltaY > 0 ? 1 : -1);
    }, { passive: false });
    cv.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  setTouchMode(on: boolean): void {
    if (on === this.touchMode) return;
    this.touchMode = on;
    if (on) this.mouseInside = false;
    this.onTouchMode(on);
  }

  moveVector(): P {
    if (this.touchMove.x !== 0 || this.touchMove.y !== 0) return this.touchMove;
    let x = 0, y = 0;
    for (const k of this.keys) {
      const v = MOVE[k];
      if (v) { x += v[0]; y += v[1]; }
    }
    return { x, y };
  }

  reset(): void {
    this.touchMove = { x: 0, y: 0 };
  }
}

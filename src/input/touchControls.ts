// スマホ用の操作レイヤー。結果はすべて InputRouter のコールバックとして流すので、ゲーム側はマウス操作と区別しない。
//   画面左側ドラッグ = 仮想スティック（指に付いてくる） / タップ = 召喚 / 長押し = 命令
//   右下 = 回避・命令解除 / 右上 = 詳細・ポーズ / スロットをタップ = 切替
import type { Simulation } from "../sim/simulation.ts";
import { hitButton, inRect, slotRects, touchButtons, type Btn } from "../ui/hudLayout.ts";
import { C, FONT } from "../view/theme.ts";
import type { InputRouter } from "./inputRouter.ts";
import { followOrigin, JOY_RADIUS, stickVector, type P } from "./stick.ts";

const LONG_PRESS_SEC = 0.42;

export class TouchControls {
  joy: { id: number; o: P; p: P } | null = null;
  press: { id: number; p: P; t0: number; done: boolean } | null = null;
  private readonly router: InputRouter;

  constructor(router: InputRouter) {
    this.router = router;
  }

  attach(cv: HTMLCanvasElement): void {
    const pos = (e: PointerEvent): P => {
      const r = cv.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    cv.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse") return;
      e.preventDefault();
      this.router.onAnyInput();
      this.router.setTouchMode(true);
      if (!this.router.gameplayEnabled) return;
      this.down(e.pointerId, pos(e), cv);
    }, { passive: false });
    cv.addEventListener("pointermove", (e) => {
      if (e.pointerType === "mouse") return;
      const p = pos(e);
      if (this.joy && this.joy.id === e.pointerId) {
        this.joy.p = p;
        this.joy.o = followOrigin(this.joy.o, p);
        this.router.touchMove = stickVector(this.joy.o, p);
      } else if (this.press && this.press.id === e.pointerId) {
        this.press.p = p;
      }
    });
    const up = (e: PointerEvent, canceled: boolean): void => {
      if (e.pointerType === "mouse") return;
      if (this.joy && this.joy.id === e.pointerId) {
        this.joy = null;
        this.router.touchMove = { x: 0, y: 0 };
      }
      if (this.press && this.press.id === e.pointerId) {
        if (!this.press.done && !canceled && this.router.gameplayEnabled) this.router.onSummonAt(this.press.p.x, this.press.p.y);
        this.press = null;
      }
    };
    cv.addEventListener("pointerup", (e) => up(e, false));
    cv.addEventListener("pointercancel", (e) => up(e, true));
  }

  private down(id: number, p: P, cv: HTMLCanvasElement): void {
    const r = this.router, W = r.W, H = r.H;
    const b = touchButtons(W, H);
    if (hitButton(p.x, p.y, b.pause)) return r.onPause();
    if (hitButton(p.x, p.y, b.info)) return r.onInfo(true);
    if (hitButton(p.x, p.y, b.dash)) return r.onDash();
    if (hitButton(p.x, p.y, b.clear)) return r.onClear();
    const rects = slotRects(W, H);
    for (let i = 0; i < rects.length; i++) if (inRect(p.x, p.y, rects[i], 6)) return r.onSlot(i);
    try { cv.setPointerCapture(id); } catch { /* 古いブラウザ */ }
    if (!this.joy && p.x < W * 0.42) {
      this.joy = { id, o: p, p };
      return;
    }
    if (!this.press) this.press = { id, p, t0: performance.now() / 1000, done: false };
  }

  /** 毎フレーム呼ぶ（長押しの判定） */
  update(): void {
    const pr = this.press;
    if (pr && !pr.done && this.router.gameplayEnabled && performance.now() / 1000 - pr.t0 >= LONG_PRESS_SEC) {
      pr.done = true;
      this.router.onOrderAt(pr.p.x, pr.p.y);
    }
  }

  reset(): void {
    this.joy = null;
    this.press = null;
    this.router.reset();
  }

  draw(ctx: CanvasRenderingContext2D, s: Simulation, W: number, H: number): void {
    const b = touchButtons(W, H);
    this.button(ctx, b.dash, s.king.dashCd <= 0, s.king.dashCd / s.T.dash_cd);
    this.button(ctx, b.clear, false, 0);
    this.button(ctx, b.pause, false, 0);
    this.button(ctx, b.info, false, 0);
    if (this.joy) {
      const j = this.joy;
      let dx = j.p.x - j.o.x, dy = j.p.y - j.o.y;
      const l = Math.hypot(dx, dy);
      if (l > JOY_RADIUS) { dx = (dx / l) * JOY_RADIUS; dy = (dy / l) * JOY_RADIUS; }
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(237,230,243,.35)";
      ctx.beginPath(); ctx.arc(j.o.x, j.o.y, JOY_RADIUS, 0, 7); ctx.stroke();
      ctx.fillStyle = "rgba(154,99,232,.7)";
      ctx.beginPath(); ctx.arc(j.o.x + dx, j.o.y + dy, 20, 0, 7); ctx.fill();
    } else if (s.t < 12) {
      ctx.fillStyle = C.dim; ctx.font = `14px ${FONT}`;
      ctx.textBaseline = "middle";
      ctx.fillText("← 左側ドラッグで移動", 20, H * 0.55);
      ctx.textAlign = "right";
      ctx.fillText("タップで召喚・長押しで命令 →", W - 20, H * 0.55);
      ctx.textAlign = "left";
    }
    const pr = this.press;
    if (pr && !pr.done) {
      const k = Math.min(1, (performance.now() / 1000 - pr.t0) / LONG_PRESS_SEC);
      if (k > 0.25) {
        ctx.strokeStyle = C.ember; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(pr.p.x, pr.p.y, 30, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); ctx.stroke();
      }
    }
    if (H > W) {
      ctx.fillStyle = C.ember; ctx.textAlign = "center"; ctx.font = `14px ${FONT}`;
      ctx.fillText("横向きにすると遊びやすくなります", W / 2, 130);
      ctx.textAlign = "left";
    }
    ctx.lineWidth = 1;
    ctx.textBaseline = "alphabetic";
  }

  private button(ctx: CanvasRenderingContext2D, b: Btn, lit: boolean, cd: number): void {
    ctx.fillStyle = "rgba(30,25,40,.75)";
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 7); ctx.fill();
    if (cd > 0) {
      ctx.fillStyle = "rgba(10,8,15,.8)";
      ctx.beginPath(); ctx.moveTo(b.x, b.y);
      ctx.arc(b.x, b.y, b.r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * cd);
      ctx.closePath(); ctx.fill();
    }
    ctx.lineWidth = 2;
    ctx.strokeStyle = lit ? C.ember : C.edge;
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 7); ctx.stroke();
    ctx.fillStyle = C.text; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = `700 ${Math.max(12, Math.round(b.r * 0.45))}px ${FONT}`;
    ctx.fillText(b.label, b.x, b.y + 1);
    ctx.textAlign = "left";
  }
}

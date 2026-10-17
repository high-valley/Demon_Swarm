// 戦闘HUD（表示専用）。キャンバスの上に重ねて描く。
import type { Simulation } from "../sim/simulation.ts";
import { pad, slotRects, uiScale } from "../ui/hudLayout.ts";
import type { BattleView } from "./battleView.ts";
import { C, FONT, MONO } from "./theme.ts";

export const fmtTime = (s: number): string => {
  const n = Math.max(0, Math.ceil(s));
  return `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
};

export class Hud {
  toastText = "";
  toastT = 0;

  toast(text: string): void {
    this.toastText = text;
    this.toastT = 1.6;
  }

  update(dt: number): void {
    this.toastT -= dt;
  }

  draw(ctx: CanvasRenderingContext2D, s: Simulation, view: BattleView, W: number, H: number, touch: boolean, debug: boolean, fps: number): void {
    const u = uiScale(W, H), p = pad(W, H), T = s.T;
    const f = (px: number, w = 400, face = FONT): string => `${w} ${Math.round(px * u)}px ${face}`;
    ctx.textBaseline = "middle";
    const bw = 220 * u;
    const bar = (y: number, h: number, v: number, col: string, label: string): void => {
      ctx.fillStyle = "rgba(10,8,15,.8)"; ctx.fillRect(p, y, bw, h);
      ctx.fillStyle = col; ctx.fillRect(p, y, bw * Math.max(0, Math.min(1, v)), h);
      ctx.strokeStyle = C.edge; ctx.lineWidth = 1; ctx.strokeRect(p + 0.5, y + 0.5, bw - 1, h - 1);
      if (label) { ctx.fillStyle = C.text; ctx.font = f(12, 600); ctx.fillText(label, p + 7 * u, y + h / 2 + 1); }
    };
    bar(p, 20 * u, s.hp / T.king_hp, C.blood, `HP ${Math.ceil(s.hp)} / ${T.king_hp}`);
    bar(p + 25 * u, 16 * u, s.mana / s.stats.max_mana, C.demon, `魔力 ${Math.floor(s.mana)} / ${Math.round(s.stats.max_mana)}`);
    bar(p + 46 * u, 6 * u, s.expPoints / s.expNeed(), C.soul, "");
    ctx.fillStyle = C.text; ctx.font = f(15, 700);
    ctx.fillText(`Lv ${s.level}`, p, p + 66 * u);
    const dashOk = s.king.dashCd <= 0;
    ctx.fillStyle = dashOk ? C.ember : C.dim; ctx.font = f(13);
    ctx.fillText(dashOk ? "ダッシュ OK" : `ダッシュ ${s.king.dashCd.toFixed(1)}s`, p + 56 * u, p + 66 * u);

    // タイマーとボス
    ctx.textAlign = "center";
    ctx.fillStyle = C.text; ctx.font = f(28, 600, MONO);
    ctx.fillText(s.bossSpawned ? fmtTime(s.t) : fmtTime(s.bossRealSec() - s.t), W / 2, p + 14 * u);
    ctx.fillStyle = C.dim; ctx.font = f(11);
    ctx.fillText(s.bossSpawned ? "勇者戦  経過時間" : "勇者出現まで", W / 2, p + 36 * u);
    if (s.boss && !s.boss.dead) {
      const w = Math.min(380 * u, W - 200);
      const y = p + 46 * u;
      ctx.fillStyle = "rgba(10,8,15,.8)"; ctx.fillRect(W / 2 - w / 2, y, w, 9 * u);
      ctx.fillStyle = C.blood; ctx.fillRect(W / 2 - w / 2, y, w * Math.max(0, s.boss.hp / s.boss.maxHp), 9 * u);
      ctx.fillStyle = C.text; ctx.font = f(12, 700);
      ctx.fillText("勇者", W / 2, y + 20 * u);
      this.bossArrow(ctx, s, view, W, H);
    }
    ctx.textAlign = "left";

    // 召喚スロット
    const rects = slotRects(W, H);
    rects.forEach((r, i) => {
      const sd = s.data.summons[i], ud = s.data.units[sd.unit_id];
      const cd = s.summonCd[i] / sd.cooldown, afford = s.mana >= sd.mana_cost;
      ctx.fillStyle = "rgba(30,25,40,.9)"; ctx.fillRect(r.x, r.y, r.w, r.h);
      if (cd > 0) { ctx.fillStyle = "rgba(10,8,15,.8)"; ctx.fillRect(r.x, r.y + r.h * (1 - cd), r.w, r.h * cd); }
      const sel = s.slot === i;
      ctx.strokeStyle = sel ? C.ember : C.edge; ctx.lineWidth = sel ? 3 : 1;
      ctx.strokeRect(r.x, r.y, r.w, r.h);
      ctx.fillStyle = ud.color;
      ctx.beginPath(); ctx.arc(r.x + 15 * u, r.y + 17 * u, 7 * u, 0, 7); ctx.fill();
      ctx.fillStyle = afford ? C.text : "#7c7389"; ctx.font = f(13, 700);
      ctx.fillText(ud.name, r.x + 27 * u, r.y + 17 * u);
      ctx.font = f(12);
      ctx.fillStyle = afford ? C.soul : C.blood;
      ctx.fillText(`魔${sd.mana_cost}`, r.x + 8 * u, r.y + r.h - 12 * u);
      ctx.fillStyle = C.dim;
      ctx.fillText(`×${s.counts[sd.unit_id] ?? 0}`, r.x + 48 * u, r.y + r.h - 12 * u);
      if (!touch) { ctx.fillStyle = C.text; ctx.fillText(String(i + 1), r.x + r.w - 13 * u, r.y + 13 * u); }
    });
    ctx.lineWidth = 1;

    ctx.fillStyle = C.dim; ctx.font = f(12);
    const bottom = H - p - 8 * u;
    ctx.fillText(`配下 ${s.allies.length}/${T.ally_cap}   撃破 ${s.kills}`, p, bottom);
    const syn: string[] = [];
    if (s.swarmOn) syn.push("群体進化");
    if (s.squadOn) syn.push("小隊連携");
    if (syn.length) { ctx.fillStyle = C.ember; ctx.fillText(`発動中: ${syn.join(" / ")}`, p, bottom - 18 * u); }
    if (s.orderCd > 0) { ctx.fillStyle = C.dim; ctx.fillText(`命令CD ${s.orderCd.toFixed(1)}s`, p, bottom - 36 * u); }
    if (this.toastT > 0) {
      ctx.globalAlpha = Math.min(1, this.toastT * 2);
      ctx.textAlign = "center"; ctx.font = f(15, 700);
      const y = rects[0].y - 18 * u;
      const w = ctx.measureText(this.toastText).width + 24;
      ctx.fillStyle = "rgba(18,15,25,.8)"; ctx.fillRect(W / 2 - w / 2, y - 13 * u, w, 26 * u);
      ctx.fillStyle = C.text; ctx.fillText(this.toastText, W / 2, y);
      ctx.textAlign = "left"; ctx.globalAlpha = 1;
    }
    if (debug) {
      ctx.textAlign = "right"; ctx.fillStyle = C.ok; ctx.font = `12px ${MONO}`;
      const y0 = p + (touch ? 56 : 8);
      [`FPS ${fps.toFixed(0)}`, `敵 ${s.enemies.length}  味方 ${s.allies.length}`, `AI ${s.aiMs.toFixed(2)} ms`,
        `弾 ${s.projs.length}  魂 ${s.souls.length}`, `seed ${s.seed}`, `wave t ${Math.floor(s.t * s.compress)}s`]
        .forEach((l, i) => ctx.fillText(l, W - p, y0 + i * 16));
      ctx.textAlign = "left";
    }
    ctx.textBaseline = "alphabetic";
  }

  /** 勇者が画面外にいる時、画面の端に方向の矢印を出す */
  private bossArrow(ctx: CanvasRenderingContext2D, s: Simulation, view: BattleView, W: number, H: number): void {
    const [sx, sy] = view.worldToScreen(s.boss!.x, s.boss!.y);
    if (sx >= 0 && sx <= W && sy >= 0 && sy <= H) return;
    const a = Math.atan2(sy - H / 2, sx - W / 2);
    const rr = Math.min(W, H) / 2 - 40;
    const px = W / 2 + Math.cos(a) * rr, py = H / 2 + Math.sin(a) * rr;
    const c = Math.cos(a), sn = Math.sin(a);
    const pt = (x: number, y: number): [number, number] => [px + x * c - y * sn, py + x * sn + y * c];
    ctx.fillStyle = C.blood;
    ctx.beginPath(); ctx.moveTo(...pt(16, 0)); ctx.lineTo(...pt(-9, -11)); ctx.lineTo(...pt(-9, 11)); ctx.closePath(); ctx.fill();
  }
}

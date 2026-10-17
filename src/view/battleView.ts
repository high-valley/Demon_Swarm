// 戦場の描画。Simulation の状態を読むだけで、ゲームロジックは持たない。
// 仮アセット段階なので図形で描いている。スプライトに差し替える時もここだけを変更する。
// スマホでも軽く描けるように、画面外のものは描かない。
import type { InputRouter } from "../input/inputRouter.ts";
import type { FxEvent, Simulation, SquadOrder, Unit } from "../sim/simulation.ts";
import { C } from "./theme.ts";

const VIEW_H_DESKTOP = 800;   // 画面に映るワールドの高さ（PC）
const VIEW_H_TOUCH = 560;     // スマホは寄せて大きく見せる（短辺に映る量）

type Fx = FxEvent & { t: number };

/** "#rrggbb" → "rgba(r,g,b,a)" */
const rgba = (hex: string, a: number): string =>
  `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${Math.max(0, Math.min(1, a)).toFixed(3)})`;

export class BattleView {
  fx: Fx[] = [];
  shake = 0;
  zoom = 1;
  camX = 0;
  camY = 0;
  private shx = 0;
  private shy = 0;
  W = 0;
  H = 0;

  addFx(e: FxEvent): void {
    if (this.fx.length < 300) this.fx.push({ ...e, t: 0 });
  }

  addShake(a: number): void {
    this.shake = Math.min(14, this.shake + a);
  }

  clear(): void {
    this.fx.length = 0;
    this.shake = 0;
  }

  update(dt: number, sim: Simulation | null, W: number, H: number, touch: boolean): void {
    this.W = W;
    this.H = H;
    this.zoom = touch ? Math.min(W, H) / VIEW_H_TOUCH : H / VIEW_H_DESKTOP;
    if (sim) {
      this.camX = sim.king.x;
      this.camY = sim.king.y;
    }
    this.shx = (Math.random() - 0.5) * this.shake;
    this.shy = (Math.random() - 0.5) * this.shake;
    this.shake *= Math.pow(0.85, dt * 60);
    let j = 0;
    for (const f of this.fx) {
      f.t += dt;
      if (f.t < f.dur) this.fx[j++] = f;
    }
    this.fx.length = j;
  }

  screenToWorld(x: number, y: number): [number, number] {
    return [(x - this.W / 2 - this.shx) / this.zoom + this.camX, (y - this.H / 2 - this.shy) / this.zoom + this.camY];
  }

  worldToScreen(x: number, y: number): [number, number] {
    return [(x - this.camX) * this.zoom + this.W / 2 + this.shx, (y - this.camY) * this.zoom + this.H / 2 + this.shy];
  }

  draw(ctx: CanvasRenderingContext2D, sim: Simulation, router: InputRouter): void {
    const W = this.W, H = this.H, z = this.zoom;
    ctx.save();
    ctx.translate(W / 2 + this.shx, H / 2 + this.shy);
    ctx.scale(z, z);
    ctx.translate(-this.camX, -this.camY);
    const hw = W / 2 / z + 40, hh = H / 2 / z + 40;
    const x0 = this.camX - hw, x1 = this.camX + hw, y0 = this.camY - hh, y1 = this.camY + hh;
    const vis = (x: number, y: number, r: number): boolean => x + r > x0 && x - r < x1 && y + r > y0 && y - r < y1;

    // 地面
    ctx.strokeStyle = "#1b1724";
    ctx.lineWidth = 1 / z;
    ctx.beginPath();
    const g = 80;
    for (let x = Math.floor(x0 / g) * g; x < x1; x += g) { ctx.moveTo(x, y0); ctx.lineTo(x, y1); }
    for (let y = Math.floor(y0 / g) * g; y < y1; y += g) { ctx.moveTo(x0, y); ctx.lineTo(x1, y); }
    ctx.stroke();
    const h = sim.T.world_half;
    ctx.strokeStyle = "#4a2a3a"; ctx.lineWidth = 4;
    ctx.strokeRect(-h, -h, h * 2, h * 2);
    // 障害物
    for (const o of sim.obstacles) {
      if (!vis(o.x, o.y, o.r)) continue;
      ctx.fillStyle = "#2a2333"; ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, 7); ctx.fill();
      ctx.fillStyle = "#3a3046"; ctx.beginPath(); ctx.arc(o.x - o.r * 0.2, o.y - o.r * 0.25, o.r * 0.65, 0, 7); ctx.fill();
    }
    // 魂
    ctx.fillStyle = C.soul;
    ctx.beginPath();
    for (const s of sim.souls) {
      if (!vis(s.x, s.y, 5)) continue;
      ctx.moveTo(s.x, s.y - 4); ctx.lineTo(s.x + 4, s.y); ctx.lineTo(s.x, s.y + 4); ctx.lineTo(s.x - 4, s.y); ctx.closePath();
    }
    ctx.fill();
    this.drawSummonPreview(ctx, sim, router);
    for (const f of this.fx) this.fxUnder(ctx, f);
    this.drawOrders(ctx, sim);
    for (const a of sim.allies) if (vis(a.x, a.y, a.r + 8)) this.drawAlly(ctx, sim, a);
    for (const e of sim.enemies) if (vis(e.x, e.y, e.r + 12)) this.drawEnemy(ctx, sim, e);
    this.drawKing(ctx, sim);
    ctx.strokeStyle = "#d8f0ff"; ctx.lineWidth = 2;
    ctx.beginPath();
    for (const p of sim.projs) {
      const l = Math.hypot(p.vx, p.vy) || 1, dx = (p.vx / l) * 7, dy = (p.vy / l) * 7;
      ctx.moveTo(p.x - dx, p.y - dy); ctx.lineTo(p.x + dx, p.y + dy);
    }
    ctx.stroke();
    for (const f of this.fx) this.fxOver(ctx, f);
    ctx.restore();
    ctx.lineWidth = 1;
  }

  private drawSummonPreview(ctx: CanvasRenderingContext2D, sim: Simulation, router: InputRouter): void {
    if (sim.result !== "" || !router.gameplayEnabled) return;
    if (!(router.mouseInside || router.touchMode)) return;
    const sd = sim.data.summons[sim.slot], ud = sim.data.units[sd.unit_id];
    ctx.strokeStyle = "rgba(154,99,232,.25)";
    ctx.lineWidth = 2;
    ctx.setLineDash([12, 12]);
    ctx.beginPath(); ctx.arc(sim.king.x, sim.king.y, sd.cast_range, 0, 7); ctx.stroke();
    ctx.setLineDash([]);
    if (router.touchMode) return;
    const [wx, wy] = this.screenToWorld(router.mouse.x, router.mouse.y);
    const [px, py] = sim.clampToCastRange(wx, wy);
    const ok = sim.mana >= sd.mana_cost && sim.summonCd[sim.slot] <= 0 && sim.allies.length < sim.T.ally_cap;
    ctx.strokeStyle = ok ? rgba(ud.color, 0.75) : C.blood;
    ctx.beginPath(); ctx.arc(px, py, ud.radius + 4, 0, 7); ctx.stroke();
  }

  private drawOrders(ctx: CanvasRenderingContext2D, sim: Simulation): void {
    const seen = new Set<SquadOrder>();
    ctx.lineWidth = 2;
    for (const a of sim.allies) {
      const o = a.order;
      if (!o || seen.has(o)) continue;
      seen.add(o);
      if (o.type === "rally") {
        ctx.strokeStyle = "rgba(231,169,59,.85)";
        ctx.beginPath();
        ctx.moveTo(o.x - 10, o.y); ctx.lineTo(o.x + 10, o.y);
        ctx.moveTo(o.x, o.y - 10); ctx.lineTo(o.x, o.y + 10);
        ctx.moveTo(o.x + 16, o.y); ctx.arc(o.x, o.y, 16, 0, 7);
        ctx.stroke();
      } else if (o.target && !o.target.dead) {
        ctx.strokeStyle = "rgba(255,81,99,.9)";
        ctx.beginPath(); ctx.arc(o.target.x, o.target.y, o.target.r + 8, 0, 7); ctx.stroke();
      }
    }
  }

  private hpBar(ctx: CanvasRenderingContext2D, u: Unit, w: number): void {
    if (u.hp >= u.maxHp) return;
    const y = u.y - u.r - 7;
    ctx.fillStyle = "rgba(0,0,0,.6)"; ctx.fillRect(u.x - w / 2, y, w, 3);
    ctx.fillStyle = u.ally ? C.ok : C.blood; ctx.fillRect(u.x - w / 2, y, w * Math.max(0, u.hp / u.maxHp), 3);
  }

  private drawAlly(ctx: CanvasRenderingContext2D, sim: Simulation, a: Unit): void {
    const col = a.flash > 0 ? "#ffffff" : a.def.color;
    ctx.fillStyle = col;
    if (a.def.id === "slime") {
      const wob = Math.sin(sim.t * 8 + a.id) * 1.5;
      ctx.beginPath(); ctx.ellipse(a.x, a.y + 2, a.r + wob * 0.4, a.r - 1 - wob * 0.3, 0, 0, 7); ctx.fill();
      ctx.fillStyle = "#1d3a22";
      ctx.fillRect(a.x - 4, a.y - 1, 2, 2); ctx.fillRect(a.x + 2, a.y - 1, 2, 2);
    } else if (a.def.id === "goblin") {
      const ang = Math.hypot(a.vx, a.vy) > 1 ? Math.atan2(a.vy, a.vx) : 0;
      const r = a.r, c = Math.cos(ang), s = Math.sin(ang);
      const pt = (px: number, py: number): [number, number] => [a.x + px * c - py * s, a.y + px * s + py * c];
      ctx.beginPath();
      ctx.moveTo(...pt(r + 3, 0)); ctx.lineTo(...pt(-r, -r * 0.8)); ctx.lineTo(...pt(-r * 0.5, 0)); ctx.lineTo(...pt(-r, r * 0.8));
      ctx.closePath(); ctx.fill();
    } else {
      ctx.fillRect(a.x - a.r, a.y - a.r, a.r * 2, a.r * 2);
      ctx.fillStyle = "#4b4458"; ctx.fillRect(a.x - a.r + 3, a.y - 3, a.r * 2 - 6, 6);
      if (a.revived) { ctx.strokeStyle = "#b48cff"; ctx.lineWidth = 1.5; ctx.strokeRect(a.x - a.r - 2, a.y - a.r - 2, a.r * 2 + 4, a.r * 2 + 4); }
    }
    if (a.order) {
      ctx.fillStyle = a.order.type === "focus" ? C.blood : C.ember;
      ctx.fillRect(a.x - 1.5, a.y - a.r - 5, 3, 3);
    }
    this.hpBar(ctx, a, a.r * 2);
  }

  private drawEnemy(ctx: CanvasRenderingContext2D, sim: Simulation, e: Unit): void {
    ctx.fillStyle = e.flash > 0 ? "#ffffff" : e.def.color;
    ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, 7); ctx.fill();
    ctx.strokeStyle = "#0d0b12"; ctx.lineWidth = 2;
    const x = e.x, y = e.y;
    ctx.beginPath();
    if (e.def.id === "swordsman") { ctx.moveTo(x - 5, y + 5); ctx.lineTo(x + 6, y - 6); }
    else if (e.def.id === "archer") { ctx.arc(x, y, e.r - 4, -1.2, 1.2); }
    else if (e.def.id === "priest") { ctx.moveTo(x, y - 6); ctx.lineTo(x, y + 6); ctx.moveTo(x - 4, y - 2); ctx.lineTo(x + 4, y - 2); }
    ctx.stroke();
    if (e.def.id === "hero_boss") {
      ctx.strokeStyle = "#ffd0d5"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, e.r + 6, 0, 7); ctx.stroke();
      ctx.fillStyle = "#ffe9a8";
      ctx.beginPath();
      ctx.moveTo(x - 10, y - e.r + 2); ctx.lineTo(x - 6, y - e.r - 8); ctx.lineTo(x, y - e.r + 1); ctx.lineTo(x + 6, y - e.r - 8); ctx.lineTo(x + 10, y - e.r + 2);
      ctx.closePath(); ctx.fill();
    }
    if (e !== sim.boss) this.hpBar(ctx, e, e.r * 2);
  }

  private drawKing(ctx: CanvasRenderingContext2D, sim: Simulation): void {
    const k = sim.king;
    const alpha = k.iframe > 0 && Math.floor(sim.t * 40) % 2 === 0 ? 0.4 : 1;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "rgba(0,0,0,.6)";
    ctx.beginPath(); ctx.ellipse(k.x, k.y + k.r - 2, k.r, k.r * 0.35, 0, 0, 7); ctx.fill();
    ctx.fillStyle = k.flash > 0 ? "#ffffff" : C.demon;
    ctx.beginPath(); ctx.arc(k.x, k.y, k.r, 0, 7); ctx.fill();
    ctx.fillStyle = C.ember;
    ctx.beginPath();
    ctx.moveTo(k.x - 10, k.y - 8); ctx.lineTo(k.x - 14, k.y - 22); ctx.lineTo(k.x - 5, k.y - 12); ctx.closePath();
    ctx.moveTo(k.x + 10, k.y - 8); ctx.lineTo(k.x + 14, k.y - 22); ctx.lineTo(k.x + 5, k.y - 12); ctx.closePath();
    ctx.fill();
    const ex = k.x + k.dx * 5, ey = k.y + k.dy * 5;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(ex - 4, ey - 3, 3, 3); ctx.fillRect(ex + 1, ey - 3, 3, 3);
    ctx.globalAlpha = 1;
  }

  private fxUnder(ctx: CanvasRenderingContext2D, f: Fx): void {
    const k = f.t / f.dur, r = f.r ?? 0;
    ctx.lineWidth = 2;
    switch (f.kind) {
      case "warn": {
        const e = f.follow;
        if (!e || e.dead) return;
        ctx.fillStyle = `rgba(255,81,99,${0.12 + 0.18 * k})`;
        ctx.beginPath(); ctx.arc(e.x, e.y, r * k, 0, 7); ctx.fill();
        ctx.strokeStyle = "rgba(255,81,99,.7)";
        ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, 7); ctx.stroke();
        return;
      }
      case "boom":
        ctx.strokeStyle = `rgba(255,178,120,${1 - k})`; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.arc(f.x, f.y, r * (0.7 + 0.3 * k), 0, 7); ctx.stroke();
        return;
      case "rally":
        ctx.strokeStyle = `rgba(231,169,59,${1 - k})`;
        ctx.beginPath(); ctx.arc(f.x, f.y, r * k, 0, 7); ctx.stroke();
        return;
      case "focus":
        ctx.strokeStyle = `rgba(255,81,99,${1 - k})`;
        ctx.beginPath(); ctx.arc(f.x, f.y, r * k, 0, 7); ctx.stroke();
        return;
      case "summon":
        ctx.strokeStyle = rgba(f.color ?? "#ffffff", 1 - k); ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(f.x, f.y, 8 + 30 * k, 0, 7); ctx.stroke();
        return;
      case "trail":
        ctx.fillStyle = `rgba(154,99,232,${0.4 * (1 - k)})`;
        ctx.beginPath(); ctx.arc(f.x, f.y, 16, 0, 7); ctx.fill();
        return;
      default:
    }
  }

  private fxOver(ctx: CanvasRenderingContext2D, f: Fx): void {
    const k = f.t / f.dur;
    ctx.lineWidth = 1.5;
    switch (f.kind) {
      case "spark":
        ctx.strokeStyle = rgba(f.color ?? "#ffffff", 1 - k);
        ctx.beginPath(); ctx.moveTo(f.x - 6, f.y - 6); ctx.lineTo(f.x + 6, f.y + 6); ctx.stroke();
        return;
      case "slash":
        ctx.strokeStyle = `rgba(255,255,255,${1 - k})`;
        ctx.beginPath(); ctx.moveTo(f.x - 6, f.y - 6); ctx.lineTo(f.x + 6, f.y + 6); ctx.stroke();
        return;
      case "poof":
        ctx.fillStyle = rgba(f.color ?? "#ffffff", (1 - k) * 0.6);
        ctx.beginPath(); ctx.arc(f.x, f.y, 6 + 14 * k, 0, 7); ctx.fill();
        return;
      case "heal":
        ctx.strokeStyle = `rgba(255,214,90,${1 - k})`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.tx ?? f.x, f.ty ?? f.y); ctx.stroke();
        return;
      default:
    }
  }
}

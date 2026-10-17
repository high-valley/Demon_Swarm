// 戦闘ロジック本体。DOM・描画・入力に依存しない。
// 固定ステップ(1/60秒)で進めるので、同じseed＋同じ入力なら同じ結果になる。
// 描画・効果音・トーストは events キューで外へ通知する。
import { RngStreams } from "../core/rng.ts";
import { SpatialGrid } from "../core/spatialGrid.ts";
import type { GameData, RunMode, Tuning, UnitDef, UpgradeDef } from "../data/types.ts";

export const STEP = 1 / 60;
const TAU = Math.PI * 2;

/** 味方・敵共通のユニット状態（描画は BattleView がまとめて行う） */
export class Unit {
  readonly id: number;
  readonly def: UnitDef;
  readonly ally: boolean;
  x: number; y: number;
  vx = 0; vy = 0;
  readonly r: number;
  hp: number;
  maxHp: number;
  atkCd = 0;
  flash = 0;
  dead = false;
  born = 0;
  // 味方用
  tgt: Unit | null = null;
  order: SquadOrder | null = null;
  arrived = false;
  retarget = 0;
  revived = false;
  // 敵用
  think = 0;
  blocker: Unit | null = null;
  ward: Unit | null = null;
  aoeCd = 3;
  windup = 0;

  constructor(id: number, def: UnitDef, x: number, y: number, maxHp: number) {
    this.id = id;
    this.def = def;
    this.ally = def.faction === "ally";
    this.x = x;
    this.y = y;
    this.r = def.radius;
    this.maxHp = maxHp;
    this.hp = maxHp;
  }
}

/** 部隊命令。複数の配下が同じ命令オブジェクトを参照する */
export class SquadOrder {
  readonly type: "focus" | "rally";
  readonly target: Unit | null;
  readonly x: number;
  readonly y: number;
  readonly issued: number;
  readonly expires: number;
  affected = 0;
  constructor(type: "focus" | "rally", target: Unit | null, x: number, y: number, issued: number, expires: number) {
    this.type = type;
    this.target = target;
    this.x = x;
    this.y = y;
    this.issued = issued;
    this.expires = expires;
  }
  isExpired(now: number): boolean {
    return now >= this.expires || (this.type === "focus" && (this.target === null || this.target.dead));
  }
}

export class King {
  x = 0; y = 0;
  r = 14;
  dx = 1; dy = 0;      // 向き
  dashT = 0;
  dashDx = 1; dashDy = 0;
  dashCd = 0;
  iframe = 0;
  flash = 0;
}

export interface Proj { x: number; y: number; vx: number; vy: number; dmg: number; life: number }
export interface Soul { x: number; y: number; v: number }
export interface Obstacle { x: number; y: number; r: number }

export type FxKind = "trail" | "summon" | "focus" | "rally" | "spark" | "slash" | "heal" | "boom" | "warn" | "poof";
export interface FxEvent { type: "fx"; kind: FxKind; x: number; y: number; dur: number; color?: string; r?: number; tx?: number; ty?: number; follow?: Unit }
export type SimEvent = FxEvent | { type: "sfx"; name: string } | { type: "toast"; text: string } | { type: "shake"; amount: number };

function compact<T>(arr: T[], keep: (v: T) => boolean): void {
  let j = 0;
  for (let i = 0; i < arr.length; i++) if (keep(arr[i])) arr[j++] = arr[i];
  arr.length = j;
}

const dist = (ax: number, ay: number, bx: number, by: number): number => Math.hypot(ax - bx, ay - by);

export class Simulation {
  readonly data: GameData;
  readonly T: Tuning;
  readonly seed: number;
  readonly mode: RunMode;
  readonly compress: number;

  // ラン状態
  t = 0;
  hp: number;
  mana = 0;
  expPoints = 0;
  level = 1;
  pendingLevels = 0;
  upgrades: Record<string, number> = {};
  picks: string[] = [];
  kills = 0;
  summonCount = 0;
  maxAllies = 0;
  result: "" | "win" | "lose" = "";
  endTimer = 0;
  boss: Unit | null = null;
  bossSpawned = false;
  slot = 0;
  summonCd = [0, 0, 0];
  orderCd = 0;
  waveState: { next: number; done: boolean }[] = [];
  counts: Record<string, number> = {};
  swarmOn = false;
  squadOn = false;
  stats: Record<string, number> = {};
  flags: Record<string, boolean> = {};

  // ワールド
  readonly king = new King();
  allies: Unit[] = [];
  enemies: Unit[] = [];
  projs: Proj[] = [];
  souls: Soul[] = [];
  obstacles: Obstacle[] = [];
  events: SimEvent[] = [];
  readonly rng: RngStreams;
  readonly gridA = new SpatialGrid<Unit>(96);
  readonly gridE = new SpatialGrid<Unit>(96);
  private readonly gridAll = new SpatialGrid<Unit>(64);
  nextId = 1;
  aiMs = 0;

  constructor(data: GameData, seed: number, mode: RunMode = "short") {
    this.data = data;
    this.T = data.tuning;
    this.seed = seed;
    this.mode = mode;
    this.compress = mode === "short" ? this.T.boss_sec / this.T.short_boss_sec : 1;
    this.rng = new RngStreams(seed);
    this.hp = this.T.king_hp;
    this.king.r = this.T.king_radius;
    for (const s of data.summons) this.counts[s.unit_id] = 0;
    for (let i = 0; i < data.waves.length; i++) this.waveState.push({ next: 0, done: false });
    this.generateObstacles();
    this.recomputeStats();
    this.mana = this.stats.max_mana;
  }

  // ---------------------------------------------------------------- events
  private emit(e: SimEvent): void {
    this.events.push(e);
  }

  private fx(kind: FxKind, x: number, y: number, dur: number, extra: Partial<FxEvent> = {}): void {
    this.events.push({ type: "fx", kind, x, y, dur, ...extra });
  }

  private toast(text: string): void {
    this.emit({ type: "toast", text });
  }

  private fail(text: string): boolean {
    this.toast(text);
    this.emit({ type: "sfx", name: "fail" });
    return false;
  }

  drainEvents(): SimEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  // ---------------------------------------------------------------- setup
  private generateObstacles(): void {
    const m = this.rng.map;
    for (let i = 0; i < 34; i++) {
      const x = m.range(-1700, 1700), y = m.range(-1700, 1700);
      const r = 26 + m.randf() * 38;
      if (Math.hypot(x, y) < 260) continue;
      this.obstacles.push({ x, y, r });
    }
  }

  recomputeStats(): void {
    this.stats = { ...this.T.base_stats };
    this.flags = {};
    for (const id in this.upgrades) {
      const def = this.data.upgradeById[id], n = this.upgrades[id];
      for (const ef of def.effects) {
        if ("stat" in ef) this.stats[ef.stat] = (this.stats[ef.stat] ?? 0) + ef.add * n;
        else this.flags[ef.flag] = true;
      }
    }
    for (const a of this.allies) {
      const mhp = a.def.max_hp * (1 + this.stats.ally_hp);
      if (mhp > a.maxHp) {
        a.hp += mhp - a.maxHp;
        a.maxHp = mhp;
      }
    }
  }

  bossRealSec(): number { return this.T.boss_sec / this.compress; }
  expNeed(): number { return this.T.exp_base + this.level * this.T.exp_per_level; }
  commandRadius(): number { return this.T.command_radius * (1 + this.stats.command_radius); }

  // ---------------------------------------------------------------- player actions
  selectSlot(i: number): void {
    this.slot = Math.max(0, Math.min(this.data.summons.length - 1, i));
  }

  tryDash(mx: number, my: number): boolean {
    const k = this.king;
    if (k.dashCd > 0 || this.result !== "") return false;
    const l = Math.hypot(mx, my);
    if (l > 0.01) { k.dashDx = mx / l; k.dashDy = my / l; } else { k.dashDx = k.dx; k.dashDy = k.dy; }
    k.dashT = this.T.dash_time;
    k.dashCd = this.T.dash_cd;
    k.iframe = this.T.dash_iframe;
    this.emit({ type: "sfx", name: "dash" });
    this.fx("trail", k.x, k.y, 0.35);
    return true;
  }

  clampToCastRange(x: number, y: number): [number, number] {
    const sd = this.data.summons[this.slot];
    const ox = x - this.king.x, oy = y - this.king.y;
    const l = Math.hypot(ox, oy);
    if (l > sd.cast_range) return [this.king.x + (ox / l) * sd.cast_range, this.king.y + (oy / l) * sd.cast_range];
    return [x, y];
  }

  trySummon(x: number, y: number): boolean {
    if (this.result !== "") return false;
    const sd = this.data.summons[this.slot], ud = this.data.units[sd.unit_id];
    if (this.summonCd[this.slot] > 0) return this.fail("クールダウン中");
    if (this.mana < sd.mana_cost) return this.fail("魔力が足りない");
    const room = this.T.ally_cap - this.allies.length;
    if (room <= 0) return this.fail(`召喚上限 ${this.T.ally_cap} 体`);
    // 射程制限 → 障害物補正。補正に失敗したら魔力は消費しない
    const [cx, cy] = this.clampToCastRange(x, y);
    const safe = this.findSafePoint(cx, cy, ud.radius);
    if (!safe) return this.fail("召喚できる場所がない");
    const extra = sd.unit_id === "slime" ? Math.floor(this.stats.slime_quantity) : 0;
    const qty = Math.min(room, sd.quantity + extra);
    for (let i = 0; i < qty; i++) {
      const a = (TAU * i) / qty, rr = qty > 1 ? 14 : 0;
      this.spawnAlly(ud, safe[0] + Math.cos(a) * rr, safe[1] + Math.sin(a) * rr);
    }
    this.mana -= sd.mana_cost;
    this.summonCd[this.slot] = sd.cooldown;
    this.summonCount += qty;
    this.emit({ type: "sfx", name: "summon" });
    this.fx("summon", safe[0], safe[1], 0.4, { color: ud.color });
    return true;
  }

  inObstacle(x: number, y: number, r: number): boolean {
    for (const o of this.obstacles) if (dist(x, y, o.x, o.y) < o.r + r) return true;
    return false;
  }

  private inWorld(x: number, y: number): boolean {
    const h = this.T.world_half;
    return Math.abs(x) < h && Math.abs(y) < h;
  }

  findSafePoint(x: number, y: number, r: number): [number, number] | null {
    if (!this.inObstacle(x, y, r) && this.inWorld(x, y)) return [x, y];
    for (let ring = 1; ring < 7; ring++) {
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * TAU;
        const qx = x + Math.cos(a) * ring * 18, qy = y + Math.sin(a) * ring * 18;
        if (!this.inObstacle(qx, qy, r) && this.inWorld(qx, qy)) return [qx, qy];
      }
    }
    return null;
  }

  spawnAlly(def: UnitDef, x: number, y: number): Unit {
    const u = new Unit(this.nextId++, def, x, y, def.max_hp * (1 + this.stats.ally_hp));
    u.born = this.t;
    this.allies.push(u);
    return u;
  }

  enemyAt(x: number, y: number, slack = 16): Unit | null {
    return this.gridE.nearest(x, y, 48, (e) => dist(x, y, e.x, e.y) < e.r + slack);
  }

  issueOrder(x: number, y: number): boolean {
    if (this.result !== "") return false;
    if (this.orderCd > 0) {
      this.toast("命令クールダウン");
      return false;
    }
    const target = this.enemyAt(x, y);
    const o = new SquadOrder(target ? "focus" : "rally", target, x, y, this.t, this.t + this.T.order_duration);
    const cx = target ? target.x : x, cy = target ? target.y : y;
    const radius = this.commandRadius();
    // 命令は「命令地点」または「魔王の周り」の指揮半径内の配下だけに届く
    for (const a of this.allies) {
      if (dist(a.x, a.y, cx, cy) <= radius || dist(a.x, a.y, this.king.x, this.king.y) <= radius) {
        a.order = o;
        a.arrived = false;
        a.tgt = null;
        o.affected++;
      }
    }
    this.orderCd = this.T.order_cd;
    this.fx(target ? "focus" : "rally", cx, cy, 0.6, { r: radius });
    if (o.affected === 0) this.toast("指揮半径内に配下がいない");
    else this.emit({ type: "sfx", name: "order" });
    return o.affected > 0;
  }

  clearOrders(): void {
    for (const a of this.allies) {
      a.order = null;
      a.tgt = null;
    }
    this.toast("命令解除：自律行動へ");
  }

  // ---------------------------------------------------------------- upgrades
  rollUpgrades(): UpgradeDef[] {
    const pool = this.data.upgrades.filter((u) => (this.upgrades[u.id] ?? 0) < u.max_stacks);
    const out: UpgradeDef[] = [];
    const w = this.T.rarity_weight;
    while (out.length < 3 && pool.length > 0) {
      const total = pool.reduce((s, u) => s + w[u.rarity], 0);
      let r = this.rng.upgrade.randf() * total;
      let idx = 0;
      for (let i = 0; i < pool.length; i++) {
        r -= w[pool[i].rarity];
        idx = i;
        if (r <= 0) break;
      }
      out.push(pool.splice(idx, 1)[0]);
    }
    return out;
  }

  applyUpgrade(id: string): void {
    this.upgrades[id] = (this.upgrades[id] ?? 0) + 1;
    this.picks.push(this.data.upgradeById[id].name);
    this.recomputeStats();
    this.pendingLevels = Math.max(0, this.pendingLevels - 1);
  }

  // ---------------------------------------------------------------- waves
  private spawnWaves(): void {
    const T = this.T;
    const waveT = this.t * this.compress;
    const minutes = (this.t / 60) * (this.mode === "short" ? T.short_difficulty_rate : 1);
    this.data.waves.forEach((w, i) => {
      const ws = this.waveState[i];
      if (ws.done || waveT < w.start_sec) return;
      if (w.once) {
        ws.done = true;
        this.spawnBoss(w.enemy_id);
        return;
      }
      if (waveT > (w.end_sec ?? Infinity)) {
        ws.done = true;
        return;
      }
      if (this.t < ws.next) return;
      ws.next = this.t + (w.spawn_interval ?? 1) / (1 + (w.rate_per_min ?? 0) * minutes);
      const n = Math.round((w.group ?? 1) + (w.group_per_min ?? 0) * minutes);
      const ang = this.rng.spawn.randf() * TAU;
      for (let k = 0; k < n; k++) {
        if (this.enemies.length >= T.enemy_cap) break;
        const a = ang + (this.rng.spawn.randf() - 0.5) * 0.6;
        const rr = T.spawn_ring + this.rng.spawn.randf() * 120;
        this.spawnEnemy(this.data.units[w.enemy_id], this.king.x + Math.cos(a) * rr, this.king.y + Math.sin(a) * rr, 1 + T.hp_scale_per_min * minutes);
      }
    });
  }

  spawnEnemy(def: UnitDef, x: number, y: number, hpScale: number): Unit {
    const h = this.T.world_half;
    x = Math.max(-h, Math.min(h, x));
    y = Math.max(-h, Math.min(h, y));
    const safe = this.findSafePoint(x, y, def.radius);
    const e = new Unit(this.nextId++, def, safe ? safe[0] : x, safe ? safe[1] : y, def.max_hp * hpScale);
    e.atkCd = this.rng.spawn.randf() * def.attack_interval;
    this.enemies.push(e);
    return e;
  }

  private spawnBoss(enemyId: string): void {
    const a = this.rng.spawn.randf() * TAU;
    this.boss = this.spawnEnemy(this.data.units[enemyId], this.king.x + Math.cos(a) * 700, this.king.y + Math.sin(a) * 700, 1);
    this.bossSpawned = true;
    this.toast("勇者が現れた");
    this.emit({ type: "sfx", name: "boss" });
  }

  // ---------------------------------------------------------------- combat
  damageKing(d: number): void {
    if (this.result !== "" || this.king.iframe > 0) return;
    this.hp -= d;
    this.king.flash = 0.15;
    this.emit({ type: "sfx", name: "king" });
    this.emit({ type: "shake", amount: 4 });
    if (this.hp <= 0) {
      this.hp = 0;
      this.end(false);
    }
  }

  private hitAlly(a: Unit, d: number): void {
    if (a.def.id === "skeleton") d /= 1 + this.stats.skeleton_defense;
    if (a.def.id === "goblin" && this.squadOn) d *= 0.9;
    a.hp -= d;
    a.flash = 0.1;
  }

  private hitEnemy(e: Unit, d: number): void {
    e.hp -= d;
    e.flash = 0.08;
    if (this.rng.misc.randf() < 0.15) this.emit({ type: "sfx", name: "hit" });
  }

  private end(win: boolean): void {
    if (this.result !== "") return;
    this.result = win ? "win" : "lose";
    this.endTimer = 1.2;
    if (win) this.toast("勇者を撃退した");
  }

  // ---------------------------------------------------------------- AI
  private static steer(u: Unit, tx: number, ty: number, speed: number, dt: number, stopAt: number): void {
    const ox = tx - u.x, oy = ty - u.y;
    const d = Math.hypot(ox, oy);
    let wx = 0, wy = 0;
    if (d > stopAt) { wx = (ox / d) * speed; wy = (oy / d) * speed; }
    const k = Math.min(1, dt * 10);
    u.vx += (wx - u.vx) * k;
    u.vy += (wy - u.vy) * k;
  }

  private allyUpdate(a: Unit, dt: number): void {
    const d = a.def, king = this.king;
    a.retarget -= dt;
    a.atkCd -= dt;
    a.flash -= dt;
    if (a.order && a.order.isExpired(this.t)) {
      a.order = null;
      a.tgt = null;
    }
    if (a.tgt && a.tgt.dead) a.tgt = null; // ターゲット失効
    let gx = 0, gy = 0, goal = false;
    if (a.order) {
      const o = a.order;
      if (o.type === "focus") {
        a.tgt = o.target;
      } else if (!a.arrived && dist(a.x, a.y, o.x, o.y) > 50) {
        gx = o.x; gy = o.y; goal = true;
        a.tgt = null;
      } else {
        a.arrived = true;
        if (a.retarget <= 0) {
          a.tgt = this.gridE.nearest(o.x, o.y, 180);
          a.retarget = 0.25;
        }
        if (!a.tgt) {
          const ang = a.id * 2.399;
          gx = o.x + Math.cos(ang) * 30; gy = o.y + Math.sin(ang) * 30; goal = true;
        }
      }
    } else if (d.target_policy === "guard") {
      const threat = this.gridE.nearest(king.x, king.y, 460);
      if (threat) {
        const l = dist(threat.x, threat.y, king.x, king.y) || 1;
        const dx = (threat.x - king.x) / l, dy = (threat.y - king.y) / l;
        const side = ((a.id % 7) - 3) * 18;
        gx = king.x + dx * 70 - dy * side; gy = king.y + dy * 70 + dx * side; goal = true;
        if (a.retarget <= 0) {
          a.tgt = this.gridE.nearest(a.x, a.y, d.attack_range + a.r + 30);
          a.retarget = 0.2;
        }
      } else {
        a.tgt = null;
      }
    } else if (d.target_policy === "swarm") {
      if (a.retarget <= 0) {
        a.retarget = 0.2 + (a.id % 5) * 0.02;
        a.tgt = this.gridE.nearest(a.x, a.y, 420);
      }
    } else if (a.retarget <= 0) {   // threat
      a.retarget = 0.2 + (a.id % 5) * 0.02;
      a.tgt = this.gridE.nearest(king.x, king.y, 520);
    }
    let speed = d.move_speed;
    if (d.id === "slime" && this.swarmOn) speed *= 1.2;
    if (a.tgt && !goal) {
      const reach = d.attack_range + a.r + a.tgt.r;
      Simulation.steer(a, a.tgt.x, a.tgt.y, speed, dt, reach - 2);
      if (dist(a.x, a.y, a.tgt.x, a.tgt.y) <= reach + 2 && a.atkCd <= 0) {
        let dmg = d.attack;
        if (d.id === "slime") dmg *= 1 + Math.min(0.4, (this.counts.slime ?? 0) * 0.01); // 集団強化
        this.hitEnemy(a.tgt, dmg);
        const aspd = d.id === "goblin" ? 1 + this.stats.goblin_attack_speed : 1;
        a.atkCd = d.attack_interval / aspd;
        this.fx("spark", a.tgt.x, a.tgt.y, 0.15, { color: d.color });
      }
    } else if (goal) {
      Simulation.steer(a, gx, gy, speed, dt, 6);
    } else {
      const ang = a.id * 2.399 + this.t * 0.2;
      const rr = 70 + (a.id % 4) * 16;
      Simulation.steer(a, king.x + Math.cos(ang) * rr, king.y + Math.sin(ang) * rr, speed * 0.8, dt, 10);
    }
  }

  private enemyUpdate(e: Unit, dt: number): void {
    const d = e.def, king = this.king, S = Simulation.steer;
    e.atkCd -= dt;
    e.think -= dt;
    e.flash -= dt;
    if (e.think <= 0) {
      e.think = 0.18;
      e.blocker = this.gridA.nearest(e.x, e.y, e.r + 28);
      if (d.ai === "support") e.ward = this.lowestEnemy(e);
    }
    if (e.blocker && e.blocker.dead) e.blocker = null;
    const dk = dist(e.x, e.y, king.x, king.y);
    const away = (fx: number, fy: number): [number, number] => [e.x * 2 - fx, e.y * 2 - fy];
    if (d.ai === "melee" || d.ai === "boss") {
      const kingReach = d.attack_range + e.r + king.r;
      let tx = king.x, ty = king.y, reach = kingReach;
      let unit: Unit | null = null;
      // 敵の目的は常に魔王。足止めされた時だけ妨害排除として配下を攻撃
      if (dk > kingReach && e.blocker) {
        unit = e.blocker;
        tx = unit.x; ty = unit.y;
        reach = d.attack_range + e.r + unit.r;
      }
      S(e, king.x, king.y, d.move_speed * (e.blocker ? 0.55 : 1), dt, kingReach - 4);
      if (dist(e.x, e.y, tx, ty) <= reach + 2 && e.atkCd <= 0) {
        e.atkCd = d.attack_interval;
        if (unit) this.hitAlly(unit, d.attack);
        else this.damageKing(d.attack);
        this.fx("slash", tx, ty, 0.18);
      }
      if (d.ai === "boss") this.bossAoe(e, dt, dk);
    } else if (d.ai === "ranged") {
      let ax = king.x, ay = king.y;
      if (e.blocker) {
        const [wx, wy] = away(e.blocker.x, e.blocker.y);
        S(e, wx, wy, d.move_speed * 0.8, dt, 0);
        ax = e.blocker.x; ay = e.blocker.y;
      } else if (dk > 250) {
        S(e, king.x, king.y, d.move_speed, dt, 0);
      } else if (dk < 190) {
        const [wx, wy] = away(king.x, king.y);
        S(e, wx, wy, d.move_speed * 0.7, dt, 0);
      } else {
        S(e, e.x, e.y, 0, dt, 1);
      }
      if (dist(e.x, e.y, ax, ay) <= d.attack_range && e.atkCd <= 0) {
        e.atkCd = d.attack_interval;
        const ang = Math.atan2(ay - e.y, ax - e.x) + (this.rng.misc.randf() - 0.5) * 0.08;
        this.projs.push({ x: e.x, y: e.y, vx: Math.cos(ang) * 430, vy: Math.sin(ang) * 430, dmg: d.attack, life: 1 });
      }
    } else if (d.ai === "support") {
      if (e.blocker) {
        const [wx, wy] = away(e.blocker.x, e.blocker.y);
        S(e, wx, wy, d.move_speed, dt, 0);
      } else if (dk > 260) {
        S(e, king.x, king.y, d.move_speed, dt, 0);
      } else if (dk < 210) {
        const [wx, wy] = away(king.x, king.y);
        S(e, wx, wy, d.move_speed * 0.7, dt, 0);
      } else {
        S(e, e.x, e.y, 0, dt, 1);
      }
      const w = e.ward;
      if (w && !w.dead && e.atkCd <= 0 && w.hp < w.maxHp) {
        e.atkCd = d.attack_interval;
        w.hp = Math.min(w.maxHp, w.hp + (d.heal ?? 0) + w.maxHp * 0.06);
        this.fx("heal", e.x, e.y, 0.35, { tx: w.x, ty: w.y });
      }
    }
  }

  private bossAoe(e: Unit, dt: number, dk: number): void {
    const aoe = e.def.aoe!, radius = aoe.radius;
    e.aoeCd -= dt;
    if (e.windup > 0) {
      e.windup -= dt;
      if (e.windup <= 0) {
        for (const a of this.gridA.query(e.x, e.y, radius + 20)) {
          if (!a.dead && dist(a.x, a.y, e.x, e.y) < radius + a.r) this.hitAlly(a, aoe.damage);
        }
        if (dk < radius + this.king.r) this.damageKing(aoe.damage * 0.6);
        this.fx("boom", e.x, e.y, 0.35, { r: radius });
        this.emit({ type: "shake", amount: 6 });
        this.emit({ type: "sfx", name: "boss" });
      }
    } else if (e.aoeCd <= 0 && (this.gridA.count(e.x, e.y, radius) >= 4 || dk < radius)) {
      e.windup = aoe.windup;
      e.aoeCd = aoe.interval;
      this.fx("warn", e.x, e.y, aoe.windup, { r: radius, follow: e });
    }
  }

  private lowestEnemy(p: Unit): Unit | null {
    let best: Unit | null = null, bestRatio = 1;
    const range = p.def.attack_range;
    for (const e of this.gridE.query(p.x, p.y, range)) {
      if (e.dead || dist(e.x, e.y, p.x, p.y) >= range) continue;
      const ratio = e.hp / e.maxHp;
      if (ratio < bestRatio) {
        bestRatio = ratio;
        best = e;
      }
    }
    return best;
  }

  // ---------------------------------------------------------------- physics
  private resolveCollisions(): void {
    const g = this.gridAll;
    g.clear();
    for (const a of this.allies) g.add(a);
    for (const e of this.enemies) g.add(e);
    const push = (u: Unit): void => {
      g.each(u.x, u.y, u.r + 26, (n) => {
        if (n.id <= u.id) return;
        const ox = n.x - u.x, oy = n.y - u.y;
        const rr = u.r + n.r, d2 = ox * ox + oy * oy;
        if (d2 >= rr * rr || d2 === 0) return;
        const d = Math.sqrt(d2), nx = ox / d, ny = oy / d, p = rr - d;
        const mu = u.def.mass, mn = n.def.mass;
        u.x -= nx * p * (mn / (mu + mn)); u.y -= ny * p * (mn / (mu + mn));
        n.x += nx * p * (mu / (mu + mn)); n.y += ny * p * (mu / (mu + mn));
      });
    };
    for (const u of this.allies) push(u);
    for (const u of this.enemies) push(u);
    // 魔王は配下に押されない。敵だけを魔王から押し出す
    const k = this.king;
    for (const e of this.enemies) {
      const ox = e.x - k.x, oy = e.y - k.y, l = Math.hypot(ox, oy), rr = e.r + k.r;
      if (l < rr && l > 0) { e.x = k.x + (ox / l) * rr; e.y = k.y + (oy / l) * rr; }
    }
    const h = this.T.world_half;
    const fix = (u: { x: number; y: number; r: number }): void => {
      for (const o of this.obstacles) {
        const ox = u.x - o.x, oy = u.y - o.y, l = Math.hypot(ox, oy), rr = o.r + u.r;
        if (l < rr && l > 0) { u.x = o.x + (ox / l) * rr; u.y = o.y + (oy / l) * rr; }
      }
      u.x = Math.max(-h, Math.min(h, u.x));
      u.y = Math.max(-h, Math.min(h, u.y));
    };
    for (const u of this.allies) fix(u);
    for (const u of this.enemies) fix(u);
    fix(k);
  }

  // ---------------------------------------------------------------- tick
  step(dt: number, mx: number, my: number): void {
    const T = this.T, k = this.king;
    this.t += dt;
    const ml = Math.hypot(mx, my);
    let ux = 0, uy = 0;
    if (ml > 0.01) {
      ux = mx / ml; uy = my / ml;
      k.dx = ux; k.dy = uy;
    }
    if (k.dashT > 0) {
      k.dashT -= dt;
      k.x += k.dashDx * T.dash_speed * dt;
      k.y += k.dashDy * T.dash_speed * dt;
    } else {
      k.x += ux * T.king_speed * dt;
      k.y += uy * T.king_speed * dt;
    }
    k.dashCd = Math.max(0, k.dashCd - dt);
    k.iframe = Math.max(0, k.iframe - dt);
    k.flash -= dt;
    this.mana = Math.min(this.stats.max_mana, this.mana + this.stats.mana_regen * dt);
    for (let i = 0; i < this.summonCd.length; i++) this.summonCd[i] = Math.max(0, this.summonCd[i] - dt);
    this.orderCd = Math.max(0, this.orderCd - dt);

    if (this.result === "") this.spawnWaves();

    this.gridA.clear();
    this.gridE.clear();
    for (const key in this.counts) this.counts[key] = 0;
    for (const a of this.allies) {
      this.gridA.add(a);
      this.counts[a.def.id] = (this.counts[a.def.id] ?? 0) + 1;
    }
    for (const e of this.enemies) this.gridE.add(e);
    this.swarmOn = !!this.flags.swarm_evo && (this.counts.slime ?? 0) >= 20;
    this.squadOn = !!this.flags.squad && (this.counts.goblin ?? 0) >= 5 && (this.counts.skeleton ?? 0) >= 5;
    this.maxAllies = Math.max(this.maxAllies, this.allies.length);

    const t0 = performance.now();
    for (const a of this.allies) this.allyUpdate(a, dt);
    for (const e of this.enemies) this.enemyUpdate(e, dt);
    this.aiMs = this.aiMs * 0.95 + (performance.now() - t0) * 0.05;
    for (const u of this.allies) { u.x += u.vx * dt; u.y += u.vy * dt; }
    for (const u of this.enemies) { u.x += u.vx * dt; u.y += u.vy * dt; }

    // 矢は配下（特にスケルトン）が体で防げる
    for (const p of this.projs) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (this.inObstacle(p.x, p.y, 2)) { p.life = 0; continue; }
      const hit = this.gridA.nearest(p.x, p.y, 24, (a) => dist(p.x, p.y, a.x, a.y) < a.r + 3);
      if (hit) {
        this.hitAlly(hit, p.dmg);
        p.life = 0;
        continue;
      }
      if (dist(p.x, p.y, k.x, k.y) < k.r + 3) {
        this.damageKing(p.dmg);
        p.life = 0;
      }
    }
    compact(this.projs, (p) => p.life > 0);

    this.resolveCollisions();

    for (const a of this.allies) {
      if (a.hp > 0) continue;
      if (a.def.id === "skeleton" && this.flags.necro && !a.revived && this.rng.misc.randf() < 0.2) {
        a.revived = true;
        a.hp = a.maxHp * 0.5;
        this.fx("summon", a.x, a.y, 0.5, { color: "#b48cff" });
      } else {
        a.dead = true;
        this.release(a);
        this.fx("poof", a.x, a.y, 0.3, { color: a.def.color });
      }
    }
    for (const e of this.enemies) {
      if (e.hp > 0 || e.dead) continue;
      e.dead = true;
      this.release(e);
      this.kills++;
      const soul = e.def.soul ?? 1;
      const drops = Math.min(soul, 6), value = soul / drops;
      for (let i = 0; i < drops; i++) {
        this.souls.push({ x: e.x + (this.rng.misc.randf() - 0.5) * 20, y: e.y + (this.rng.misc.randf() - 0.5) * 20, v: value });
      }
      this.fx("poof", e.x, e.y, 0.35, { color: e.def.color });
      if (e === this.boss) this.end(true);
    }
    compact(this.allies, (a) => !a.dead);
    compact(this.enemies, (e) => !e.dead);

    const pickup = T.soul_pickup;
    compact(this.souls, (s) => {
      const ox = k.x - s.x, oy = k.y - s.y, d = Math.hypot(ox, oy);
      if (d < k.r + 8) {
        this.expPoints += s.v;
        return false;
      }
      if (d < pickup) {
        const sp = (Math.max(220, 600 - d * 2) * dt) / d;
        s.x += ox * sp;
        s.y += oy * sp;
      }
      return true;
    });
    if (this.souls.length > 400) this.souls.splice(0, this.souls.length - 400);
    while (this.expPoints >= this.expNeed()) {
      this.expPoints -= this.expNeed();
      this.level++;
      this.pendingLevels++;
      this.emit({ type: "sfx", name: "level" });
    }
    if (this.result !== "") this.endTimer -= dt;
  }

  /** 倒れたユニットからの参照を切る（倒れた相手を狙い続けないように） */
  private release(u: Unit): void {
    u.tgt = null;
    u.order = null;
    u.blocker = null;
    u.ward = null;
  }

  /** テスト・デバッグ用: 状態を短い文字列に要約（決定性チェックに使う） */
  stateDigest(): string {
    let sx = 0;
    for (const e of this.enemies) sx += e.x * 0.37 + e.y * 0.11 + e.hp;
    for (const a of this.allies) sx += a.x * 0.13 + a.y * 0.29 + a.hp;
    return `${this.enemies.length}|${this.allies.length}|${this.kills}|${this.level}|${this.hp.toFixed(2)}|${sx.toFixed(2)}|${this.picks.join(",")}`;
  }
}

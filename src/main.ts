// ゲーム全体の状態機械と配線。
//   title → play ⇄ (level / pause) → result → play or title
// Simulation（ロジック）・BattleView/Hud（表示）・InputRouter/TouchControls（入力）・Menus（画面）をつなぐだけ。
import summons from "../data/summons.json" with { type: "json" };
import tuning from "../data/tuning.json" with { type: "json" };
import units from "../data/units.json" with { type: "json" };
import upgrades from "../data/upgrades.json" with { type: "json" };
import waves from "../data/waves.json" with { type: "json" };
import { loadData } from "./data/dataLoader.ts";
import type { GameData, RunMode } from "./data/types.ts";
import { InputRouter } from "./input/inputRouter.ts";
import { TouchControls } from "./input/touchControls.ts";
import { Platform, urlFlag } from "./platform.ts";
import { Settings } from "./settings.ts";
import { Simulation, STEP } from "./sim/simulation.ts";
import { Menus } from "./ui/menus.ts";
import { BattleView } from "./view/battleView.ts";
import { fmtTime, Hud } from "./view/hud.ts";
import { Sfx } from "./view/sfx.ts";

type State = "title" | "play" | "level" | "pause" | "settings" | "result";
const MAX_STEPS_PER_FRAME = 4;   // 端末が遅い時は「処理落ち（ゆっくり）」にして、追いつこうとする悪循環を防ぐ
const POLICY: Record<string, string> = { swarm: "最寄りの敵に群がる", threat: "魔王に近い敵を狙う", guard: "魔王と敵の間に割り込む" };

class Game {
  state: State = "title";
  readonly data: GameData;
  sim: Simulation | null = null;
  seed = Math.floor(Math.random() * 1_000_000);
  mode: RunMode = "short";
  infoOpen = false;

  readonly cv: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly router = new InputRouter();
  readonly touch: TouchControls;
  readonly view = new BattleView();
  readonly hud = new Hud();
  readonly sfx = new Sfx();
  readonly menus: Menus;
  W = 0;
  H = 0;
  DPR = 1;
  perf = { fps: 60, frames: 0, acc: 0 };
  private last = 0;
  private acc = 0;

  constructor() {
    this.data = loadData(tuning, units, summons, waves, upgrades);
    if (this.data.errors.length) {
      document.body.textContent = "データ定義にエラーがあります: " + this.data.errors.join(" / ");
      throw new Error(this.data.errors.join("\n"));
    }
    Settings.load();
    if (urlFlag("fps") !== null) Settings.debugHud = true;
    this.cv = document.getElementById("cv") as HTMLCanvasElement;
    this.ctx = this.cv.getContext("2d", { alpha: false })!;
    this.menus = new Menus(document.getElementById("ui")!);
    this.touch = new TouchControls(this.router);
    this.sfx.setVolume(Settings.volume);

    const r = this.router;
    r.attach(this.cv);
    this.touch.attach(this.cv);
    const playing = (): boolean => this.state === "play" && this.sim !== null;
    r.onAnyInput = () => this.sfx.unlock();
    r.onSummonAt = (x, y) => { if (playing()) this.sim!.trySummon(...this.view.screenToWorld(x, y)); };
    r.onOrderAt = (x, y) => { if (playing()) this.sim!.issueOrder(...this.view.screenToWorld(x, y)); };
    r.onDash = () => { if (playing()) { const m = r.moveVector(); this.sim!.tryDash(m.x, m.y); } };
    r.onSlot = (i) => { if (playing()) this.sim!.selectSlot(i); };
    r.onSlotCycle = (d) => { if (playing()) this.sim!.selectSlot((((this.sim!.slot + d) % 3) + 3) % 3); };
    r.onClear = () => { if (playing()) this.sim!.clearOrders(); };
    r.onPause = () => {
      if (this.state === "play") this.pause();
      else if (this.state === "pause") this.setState("play");
    };
    r.onInfo = (show) => this.info(show);
    r.onDebug = () => { Settings.debugHud = !Settings.debugHud; Settings.save(); };
    r.onHotkey = (i) => { if (this.state === "level") this.menus.pressHotkey(i); };
    r.onTouchMode = (on) => { this.menus.touchMode = on; };
    r.onBlur = () => { if (this.state === "play") this.pause(); };
    r.setTouchMode(Platform.prefersTouch());
    this.menus.touchMode = r.touchMode;
    document.addEventListener("pointerdown", () => this.sfx.unlock(), { capture: true });

    addEventListener("resize", () => this.resize());
    this.resize();
    this.toTitle();
    requestAnimationFrame((t) => { this.last = t; this.frame(t); });
  }

  // ---------------------------------------------------------------- loop
  resize(): void {
    const rc = this.cv.getBoundingClientRect();
    // 画面の細かさは最大2倍まで（3倍で描いても見た目はほぼ同じで、描く量は2倍以上になる）
    this.DPR = Math.min(2, window.devicePixelRatio || 1) * (urlFlag("lowres") !== null ? 0.5 : 1);
    this.W = rc.width;
    this.H = rc.height;
    this.cv.width = Math.max(1, Math.round(this.W * this.DPR));
    this.cv.height = Math.max(1, Math.round(this.H * this.DPR));
    this.router.W = this.W;
    this.router.H = this.H;
  }

  frame(now: number): void {
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > 0.25) dt = 0.25;
    const p = this.perf;
    p.frames++;
    p.acc += dt;
    if (p.acc >= 0.5) { p.fps = p.frames / p.acc; p.frames = 0; p.acc = 0; }
    if (this.cv.clientWidth !== Math.round(this.W) || this.cv.clientHeight !== Math.round(this.H)) this.resize();

    this.touch.update();
    if (this.state === "play" && this.sim) {
      this.acc += dt;
      let n = 0;
      while (this.acc >= STEP && n < MAX_STEPS_PER_FRAME) {
        this.acc -= STEP;
        n++;
        this.tick();
        if (this.state !== "play") { this.acc = 0; break; }
      }
      if (n >= MAX_STEPS_PER_FRAME) this.acc = 0;
    } else {
      this.acc = 0;
    }
    this.view.update(dt, this.sim, this.W, this.H, this.router.touchMode);
    this.hud.update(dt);
    this.render();
    requestAnimationFrame((t) => this.frame(t));
  }

  /** 戦闘は固定ステップ（1/60秒）で進める → seed 再現性 */
  private tick(): void {
    const sim = this.sim!;
    const m = this.router.moveVector();
    sim.step(STEP, m.x, m.y);
    for (const e of sim.drainEvents()) {
      if (e.type === "fx") this.view.addFx(e);
      else if (e.type === "sfx") this.sfx.play(e.name);
      else if (e.type === "toast") this.hud.toast(e.text);
      else if (e.type === "shake" && Settings.shake) this.view.addShake(e.amount);
    }
    if (sim.result !== "") {
      if (sim.endTimer <= 0) this.showResult();
    } else if (sim.pendingLevels > 0) {
      this.openLevelup();
    }
  }

  private render(): void {
    const ctx = this.ctx;
    ctx.setTransform(this.DPR, 0, 0, this.DPR, 0, 0);
    ctx.fillStyle = "#120f19";
    ctx.fillRect(0, 0, this.W, this.H);
    if (!this.sim) {
      this.drawTitleBg();
      return;
    }
    this.view.draw(ctx, this.sim, this.router);
    this.hud.draw(ctx, this.sim, this.view, this.W, this.H, this.router.touchMode, Settings.debugHud, this.perf.fps);
    if (this.router.touchMode && this.state === "play") this.touch.draw(ctx, this.sim, this.W, this.H);
  }

  private drawTitleBg(): void {
    const ctx = this.ctx, t = performance.now() / 1000;
    for (let i = 0; i < 26; i++) {
      const x = ((i * 173 + t * 14 * (1 + (i % 3))) % (this.W + 60)) - 30;
      const y = this.H * (0.15 + (0.7 * ((i * 41) % 100)) / 100) + Math.sin(t * 2 + i) * 6;
      ctx.globalAlpha = 0.1 + 0.06 * Math.sin(t + i);
      ctx.fillStyle = ["#6fd27a", "#f09a3e", "#e8e2cf"][i % 3];
      ctx.beginPath(); ctx.arc(x, y, 6 + (i % 3) * 2, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- states
  setState(s: State): void {
    this.state = s;
    this.router.gameplayEnabled = s === "play";
    this.touch.reset();
    if (s !== "play") this.infoOpen = false;
    if (s === "play") this.menus.hideAll();
  }

  private start(seed: number, mode: RunMode): void {
    this.seed = seed;
    this.mode = mode;
    this.sim = new Simulation(this.data, seed, mode);
    this.view.clear();
    this.setState("play");
  }

  toTitle(): void {
    this.sim = null;
    this.view.clear();
    this.setState("title");
    this.menus.seed = this.seed;
    this.menus.mode = this.mode;
    this.menus.showTitle({ play: (s, m) => this.start(s, m), settings: () => this.openSettings(() => this.toTitle()) });
  }

  private pause(): void {
    this.setState("pause");
    this.menus.showPause({ resume: () => this.setState("play"), settings: () => this.openSettings(() => this.pause()), title: () => this.toTitle() });
  }

  private openSettings(back: () => void): void {
    this.setState("settings");
    this.menus.showSettings({ back, volume: (v) => this.sfx.setVolume(v) });
  }

  private openLevelup(): void {
    const sim = this.sim!;
    this.setState("level");
    this.menus.showLevelup(sim.level - sim.pendingLevels + 1, sim.rollUpgrades(), sim.upgrades, (id) => {
      if (this.state !== "level") return;
      sim.applyUpgrade(id);
      if (sim.pendingLevels > 0) this.openLevelup();
      else this.setState("play");
    });
  }

  private showResult(): void {
    const s = this.sim!;
    this.setState("result");
    const rows: [string, string | number][] = [["生存時間", fmtTime(s.t)], ["召喚総数", s.summonCount], ["撃破数", s.kills],
      ["最大同時召喚", s.maxAllies], ["到達レベル", s.level], ["seed", s.seed]];
    const picks = s.picks.length ? `選んだ強化：${s.picks.join("、")}` : "強化は選ばなかった";
    this.menus.showResult(s.result === "win", rows, picks, {
      same: () => this.start(this.seed, this.mode),
      fresh: () => this.start(Math.floor(Math.random() * 1_000_000), this.mode),
      title: () => this.toTitle(),
    });
  }

  /** 詳細（Tab を押している間 / i をタップ） */
  private info(show: boolean): void {
    if (show && this.state === "play" && this.sim) {
      this.infoOpen = true;
      this.router.gameplayEnabled = false;   // 表示中は時間を止める
      this.state = "pause";
      this.touch.reset();
      this.menus.showInfo(this.infoLines(), () => this.info(false));
    } else if (this.infoOpen) {
      this.infoOpen = false;
      this.setState("play");
    }
  }

  private infoLines(): string[] {
    const s = this.sim!, d = this.data;
    const lines = ["【召喚】"];
    for (const sd of d.summons) {
      const u = d.units[sd.unit_id];
      lines.push(`  ${u.name}  魔${sd.mana_cost} / CD${sd.cooldown}s  ×${s.counts[sd.unit_id] ?? 0}  … ${POLICY[u.target_policy ?? ""] ?? ""}`);
    }
    lines.push("【シナジー】");
    for (const [id, on] of [["swarm_evo", s.swarmOn], ["necro", !!s.flags.necro], ["squad", s.squadOn]] as const) {
      const st = s.upgrades[id] ? (on ? "発動中" : "取得済（条件未達）") : "未取得";
      lines.push(`  ${d.upgradeById[id].name}：${st}`);
    }
    lines.push("【敵の特性】",
      "  戦士：魔王へ直進。配下に足止めされる",
      "  弓兵：距離を取り魔王を射る。矢は配下が体で防げる",
      "  僧侶：後方から味方を回復。集中攻撃で落とす",
      "  勇者：密集した配下を範囲技で崩す（赤い円が予兆）");
    return lines;
  }
}

// 開発・計測用にコンソールから触れるようにしておく
(globalThis as unknown as { __ds: Game }).__ds = new Game();

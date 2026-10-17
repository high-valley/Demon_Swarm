// 戦闘ロジックとデータのテスト（Godot 版 tests/run_tests.gd から移植）
import assert from "node:assert/strict";
import { test } from "node:test";
import { loadData } from "../src/data/dataLoader.ts";
import { followOrigin, JOY_RADIUS, stickVector } from "../src/input/stick.ts";
import { STEP } from "../src/sim/simulation.ts";
import { data, readJson, runTicks, sim } from "./helpers.ts";

const near = (a: number, b: number): boolean => Math.abs(a - b) < 1e-6;
const U = data.units;

test("data/*.json に検証エラーがない", () => {
  assert.deepEqual(data.errors, []);
});

test("壊れたデータ（max_hp欠落・敵を召喚・ボス無し）を検出する", () => {
  const units = readJson("units") as Record<string, unknown>[];
  delete units[0].max_hp;
  const summons = readJson("summons") as Record<string, unknown>[];
  summons[1].unit_id = "swordsman";
  const d = loadData(readJson("tuning"), units, summons, [], readJson("upgrades"));
  assert.ok(d.errors.length >= 3, d.errors.join(" / "));
});

test("召喚: 魔力とクールダウン", () => {
  const s = sim();
  s.selectSlot(0);
  const m = s.mana;
  assert.ok(s.trySummon(50, 0), "召喚できるはず");
  assert.ok(near(s.mana, m - 15), "スライムは魔力15");
  assert.equal(s.allies.length, 1);
  assert.ok(!s.trySummon(50, 0), "CD中は召喚できない");
  runTicks(s, 121);
  assert.ok(s.trySummon(50, 0), "2秒後は召喚できる");
});

test("召喚失敗では魔力を消費しない", () => {
  const s = sim();
  s.selectSlot(2);
  s.mana = 10;
  assert.ok(!s.trySummon(50, 0));
  assert.ok(near(s.mana, 10));
  assert.equal(s.allies.length, 0);
});

test("召喚: 射程と障害物の補正", () => {
  const s = sim();
  s.selectSlot(0);
  s.trySummon(5000, 0);
  assert.ok(Math.hypot(s.allies[0].x - s.king.x, s.allies[0].y - s.king.y) <= 341, "射程340でクランプ");
  const s2 = sim();
  s2.obstacles = [{ x: 100, y: 0, r: 40 }];
  s2.trySummon(100, 0);
  assert.ok(!s2.inObstacle(s2.allies[0].x, s2.allies[0].y, s2.allies[0].r), "障害物の外へ補正");
  const s3 = sim();
  s3.obstacles = [{ x: 100, y: 0, r: 400 }];
  const m = s3.mana;
  assert.ok(!s3.trySummon(100, 0), "安全点がないと失敗");
  assert.ok(near(s3.mana, m), "補正失敗時は魔力を消費しない");
});

test("召喚上限60体", () => {
  const s = sim();
  for (let i = 0; i < 60; i++) s.spawnAlly(U.slime, i * 3, 200);
  assert.ok(!s.trySummon(0, 50));
  assert.equal(s.allies.length, 60);
});

test("スライム分裂で2体出る", () => {
  const s = sim();
  s.applyUpgrade("slime_qty");
  s.trySummon(60, 0);
  assert.equal(s.allies.length, 2);
});

test("ダッシュ中は無敵、CDは4秒", () => {
  const s = sim();
  s.tryDash(1, 0);
  s.damageKing(10);
  assert.ok(near(s.hp, 100), "ダッシュ無敵中は被弾しない");
  runTicks(s, 12);
  s.damageKing(10);
  assert.ok(near(s.hp, 90), "無敵後は被弾する");
  assert.ok(!s.tryDash(1, 0), "ダッシュCD4秒");
});

test("魔王はHP0で一度だけ敗北", () => {
  const s = sim();
  s.damageKing(60); s.damageKing(60); s.damageKing(60);
  assert.equal(s.result, "lose");
  assert.equal(s.hp, 0);
  assert.ok(!s.trySummon(30, 0), "終了後は召喚できない");
});

test("命令は指揮半径内だけに届き、8秒で切れる", () => {
  const s = sim();
  const n = s.spawnAlly(U.goblin, 900, 0);
  const f = s.spawnAlly(U.goblin, -1800, 1500);
  s.issueOrder(950, 0);
  assert.ok(n.order !== null, "命令地点の近くの配下には届く");
  assert.equal(f.order, null, "遠くの配下には届かない");
  assert.ok(!s.issueOrder(950, 0), "命令CD1秒");
  runTicks(s, 8 * 60 + 2);
  assert.equal(n.order, null, "8秒で命令が切れる");
});

test("集中攻撃の標的が死んだら命令とターゲットが失効", () => {
  const s = sim();
  const a = s.spawnAlly(U.goblin, 40, 0);
  const e = s.spawnEnemy(U.swordsman, 120, 0, 1);
  s.gridE.clear();
  s.gridE.add(e);
  s.issueOrder(e.x, e.y);
  assert.ok(a.order !== null && a.order.target === e);
  e.hp = 0;
  runTicks(s, 2);
  assert.ok(a.order === null && a.tgt === null);
});

test("同seedで強化候補の順序が一致し、seedが違えば変わる", () => {
  const ids = (seed: number): string => {
    const s = sim(seed);
    const out: string[] = [];
    for (let i = 0; i < 5; i++) out.push(s.rollUpgrades().map((u) => u.id).join(","));
    return out.join("|");
  };
  assert.equal(ids(777), ids(777));
  assert.notEqual(ids(777), ids(778));
});

test("上限に達した強化は候補に出ない", () => {
  const s = sim();
  s.applyUpgrade("swarm_evo");
  for (let i = 0; i < 30; i++) for (const u of s.rollUpgrades()) assert.notEqual(u.id, "swarm_evo");
});

test("同seedで敵の出現が一致", () => {
  const list = (): string[] => {
    const s = sim(4242);
    runTicks(s, 60 * 30);
    return s.enemies.map((e) => `${e.def.id}@${e.x.toFixed(1)},${e.y.toFixed(1)}`);
  };
  const a = list(), b = list();
  assert.ok(a.length > 5);
  assert.deepEqual(a, b);
});

test("同seed・同入力で完全一致", () => {
  const digests: string[] = [];
  for (let k = 0; k < 2; k++) {
    const s = sim(99);
    for (let i = 0; i < 60 * 60; i++) {
      if (i % 30 === 0) {
        s.selectSlot(Math.floor(i / 30) % 3);
        s.trySummon(s.king.x + 120, s.king.y);
      }
      if (i % 300 === 0 && s.enemies.length > 0) s.issueOrder(s.enemies[0].x, s.enemies[0].y);
      if (s.pendingLevels > 0) s.applyUpgrade(s.rollUpgrades()[0].id);
      s.step(STEP, Math.floor(i / 240) % 2 === 0 ? 1 : -1, 0);
    }
    digests.push(s.stateDigest());
  }
  assert.equal(digests[0], digests[1]);
});

test("短縮モードは3分でボス出現、撃破で勝利", () => {
  const s = sim(5, "short");
  s.hp = 1e9;
  runTicks(s, Math.floor(s.bossRealSec() * 60) + 2);
  assert.ok(s.bossSpawned && s.boss);
  s.boss!.hp = 0;
  runTicks(s, 1);
  assert.equal(s.result, "win");
});

test("タッチ操作: 大きくスワイプした後でも、少し逆に動かすだけで向きが変わる", () => {
  let o = { x: 100, y: 100 };
  const p = { x: 100, y: 100 };
  for (let i = 0; i < 20; i++) { p.x += 10; o = followOrigin(o, p); }
  assert.ok(Math.hypot(p.x - o.x, p.y - o.y) <= JOY_RADIUS + 0.01);
  assert.ok(stickVector(o, p).x > 0.99);
  for (let i = 0; i < 7; i++) { p.x -= 10; o = followOrigin(o, p); }
  assert.ok(stickVector(o, p).x < 0);
});

test("ボット: 逃げながら召喚・命令・強化で最後まで回る", () => {
  const outcomes: string[] = [];
  for (const seed of [11, 22, 33]) {
    const s = sim(seed, "short");
    for (let i = 0; s.result === "" && i < 60 * 240; i++) {
      if (s.pendingLevels > 0) s.applyUpgrade(s.rollUpgrades()[0].id);
      const e = s.gridE.nearest(s.king.x, s.king.y, 600);
      let mx = 0, my = 0;
      if (e && Math.hypot(e.x - s.king.x, e.y - s.king.y) < 200) {
        const l = Math.hypot(s.king.x - e.x, s.king.y - e.y) || 1;
        mx = (s.king.x - e.x) / l; my = (s.king.y - e.y) / l;
      } else if (s.souls.length > 0) {
        const l = Math.hypot(s.souls[0].x - s.king.x, s.souls[0].y - s.king.y) || 1;
        mx = (s.souls[0].x - s.king.x) / l; my = (s.souls[0].y - s.king.y) / l;
      }
      if (e && i % 10 === 0) {
        s.selectSlot([0, 0, 1, 2][Math.floor(i / 60) % 4]);
        s.trySummon((s.king.x + e.x) / 2, (s.king.y + e.y) / 2);
      }
      if (e && i % 300 === 0) s.issueOrder(e.x, e.y);
      s.step(STEP, mx, my);
      s.drainEvents();
    }
    outcomes.push(`${seed}:${s.result || "timeout"}@${s.t.toFixed(0)}s kills=${s.kills} lv=${s.level}`);
    assert.ok(s.kills > 20, `ボットでも敵を倒せる (seed ${seed})`);
  }
  console.log(`    bot: ${outcomes.join(", ")}`);
});

test("味方60体・敵80体でも1ティックが軽い", () => {
  const s = sim(3);
  s.hp = 1e9;
  for (let i = 0; i < 60; i++) s.spawnAlly(U[["slime", "goblin", "skeleton"][i % 3]], Math.cos(i) * 150, Math.sin(i) * 150);
  for (let i = 0; i < 80; i++) s.spawnEnemy(U[["swordsman", "archer", "priest"][i % 3]], Math.cos(i * 0.7) * 500, Math.sin(i * 0.7) * 500, 50);
  s.waveState = s.waveState.map(() => ({ next: 1e9, done: true }));
  runTicks(s, 60);
  const t0 = performance.now();
  runTicks(s, 600);
  const ms = (performance.now() - t0) / 600;
  console.log(`    perf: ${ms.toFixed(3)} ms/tick (allies=${s.allies.length} enemies=${s.enemies.length})  ※60FPSの予算は16.7ms`);
  assert.ok(ms < 4, `${ms.toFixed(2)}ms`);
});

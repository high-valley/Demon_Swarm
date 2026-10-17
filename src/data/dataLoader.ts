// data/*.json を検証して1つにまとめる。項目を足したら、ここにも検証を足す。
import type { GameData, SummonDef, Tuning, UnitDef, UpgradeDef, WaveDef } from "./types.ts";

const REQUIRED = {
  unit: ["id", "name", "faction", "max_hp", "move_speed", "attack", "attack_range", "attack_interval", "radius", "color", "mass"],
  summon: ["unit_id", "mana_cost", "cooldown", "quantity", "cast_range"],
  wave: ["enemy_id", "start_sec"],
  upgrade: ["id", "name", "desc", "rarity", "max_stacks", "effects"],
  tuning: ["schema_version", "king_hp", "king_speed", "king_radius", "dash_speed", "dash_time", "dash_cd", "dash_iframe",
    "ally_cap", "enemy_cap", "order_duration", "order_cd", "command_radius", "soul_pickup", "world_half", "spawn_ring",
    "boss_sec", "short_boss_sec", "short_difficulty_rate", "hp_scale_per_min", "exp_base", "exp_per_level", "base_stats", "rarity_weight"],
} as const;
const POLICIES = ["swarm", "threat", "guard"];
const ENEMY_AI = ["melee", "ranged", "support", "boss"];

type Dict = Record<string, unknown>;
const isDict = (v: unknown): v is Dict => typeof v === "object" && v !== null && !Array.isArray(v);

export function loadData(rawTuning: unknown, rawUnits: unknown, rawSummons: unknown, rawWaves: unknown, rawUpgrades: unknown): GameData {
  const errors: string[] = [];
  const tuning = (isDict(rawTuning) ? rawTuning : {}) as unknown as Tuning;
  const summons = (Array.isArray(rawSummons) ? rawSummons : []) as SummonDef[];
  const waves = (Array.isArray(rawWaves) ? rawWaves : []) as WaveDef[];
  const upgrades = (Array.isArray(rawUpgrades) ? rawUpgrades : []) as UpgradeDef[];
  const units: Record<string, UnitDef> = {};
  if (Array.isArray(rawUnits)) for (const u of rawUnits) if (isDict(u) && typeof u.id === "string") units[u.id] = u as unknown as UnitDef;
  const upgradeById: Record<string, UpgradeDef> = {};
  for (const u of upgrades) if (isDict(u) && typeof u.id === "string") upgradeById[u.id] = u;

  const require = (kind: keyof typeof REQUIRED, d: unknown, label: string): boolean => {
    if (!isDict(d)) {
      errors.push(`${label}: 辞書ではない`);
      return false;
    }
    let ok = true;
    for (const k of REQUIRED[kind]) {
      if (!(k in d)) {
        errors.push(`${label}: '${k}' がない`);
        ok = false;
      }
    }
    return ok;
  };

  if (require("tuning", tuning, "tuning")) {
    for (const stat of ["max_mana", "mana_regen"]) if (!(stat in tuning.base_stats)) errors.push(`tuning.base_stats: '${stat}' がない`);
  }
  for (const id of Object.keys(units)) {
    const u = units[id], label = `units[${id}]`;
    if (!require("unit", u, label)) continue;
    if (u.faction === "ally") {
      if (!POLICIES.includes(u.target_policy ?? "")) errors.push(`${label}: target_policy は ${POLICIES.join("/")} のどれか`);
    } else if (u.faction === "enemy") {
      if (!ENEMY_AI.includes(u.ai ?? "")) errors.push(`${label}: ai は ${ENEMY_AI.join("/")} のどれか`);
      if (u.ai === "boss" && !u.aoe) errors.push(`${label}: ボスには aoe が必要`);
    } else {
      errors.push(`${label}: faction は ally か enemy`);
    }
    for (const k of ["max_hp", "move_speed", "attack_interval", "radius", "mass"] as const) if (!(Number(u[k]) > 0)) errors.push(`${label}: ${k} は正の数`);
    if (!/^#[0-9a-fA-F]{6}$/.test(String(u.color))) errors.push(`${label}: color が不正`);
  }
  if (summons.length !== 3) errors.push(`summons: MVPは3スロット固定（現在 ${summons.length}）`);
  summons.forEach((s, i) => {
    const label = `summons[${i}]`;
    if (!require("summon", s, label)) return;
    if (!units[s.unit_id] || units[s.unit_id].faction !== "ally") errors.push(`${label}: unit_id '${s.unit_id}' は味方ユニットではない`);
  });
  let hasBoss = false;
  waves.forEach((w, i) => {
    const label = `waves[${i}]`;
    if (!require("wave", w, label)) return;
    if (!units[w.enemy_id] || units[w.enemy_id].faction !== "enemy") {
      errors.push(`${label}: enemy_id '${w.enemy_id}' は敵ユニットではない`);
      return;
    }
    if (w.once) {
      hasBoss = hasBoss || units[w.enemy_id].ai === "boss";
    } else {
      for (const k of ["end_sec", "spawn_interval", "group", "group_per_min", "rate_per_min"] as const) if (!(k in w)) errors.push(`${label}: '${k}' がない`);
      if (!(Number(w.spawn_interval) > 0)) errors.push(`${label}: spawn_interval は正の数`);
    }
  });
  if (!hasBoss) errors.push("waves: ボス出現（once: true）の定義がない");
  for (const u of upgrades) {
    const label = `upgrades[${isDict(u) ? String(u.id ?? "?") : "?"}]`;
    if (!require("upgrade", u, label)) continue;
    if (tuning.rarity_weight && !(u.rarity in tuning.rarity_weight)) errors.push(`${label}: rarity '${u.rarity}' の重みがない`);
    for (const ef of u.effects) {
      if ("stat" in ef) {
        if (tuning.base_stats && !(ef.stat in tuning.base_stats)) errors.push(`${label}: 未知のstat '${ef.stat}'`);
        if (!("add" in ef)) errors.push(`${label}: stat効果には add が必要`);
      } else if (!("flag" in ef)) {
        errors.push(`${label}: 効果は stat か flag`);
      }
    }
  }
  return { tuning, units, summons, waves, upgrades, upgradeById, errors };
}

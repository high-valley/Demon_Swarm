// data/*.json の型。バランス値はコードに書かず、すべてここから参照する。

export interface UnitDef {
  id: string; name: string; faction: "ally" | "enemy";
  max_hp: number; move_speed: number; attack: number; attack_range: number; attack_interval: number;
  radius: number; color: string; mass: number;
  target_policy?: "swarm" | "threat" | "guard";
  ai?: "melee" | "ranged" | "support" | "boss";
  heal?: number; soul?: number; tags?: string[];
  aoe?: { damage: number; radius: number; interval: number; windup: number };
}

export interface SummonDef { unit_id: string; mana_cost: number; cooldown: number; quantity: number; cast_range: number }

export interface WaveDef {
  enemy_id: string; start_sec: number; end_sec?: number; spawn_interval?: number;
  group?: number; group_per_min?: number; rate_per_min?: number; once?: boolean;
}

export interface UpgradeDef {
  id: string; name: string; desc: string; rarity: string; max_stacks: number;
  effects: ({ stat: string; add: number } | { flag: string })[];
}

export interface Tuning {
  schema_version: number;
  king_hp: number; king_speed: number; king_radius: number;
  dash_speed: number; dash_time: number; dash_cd: number; dash_iframe: number;
  ally_cap: number; enemy_cap: number; order_duration: number; order_cd: number; command_radius: number;
  soul_pickup: number; world_half: number; spawn_ring: number;
  boss_sec: number; short_boss_sec: number; short_difficulty_rate: number; hp_scale_per_min: number;
  exp_base: number; exp_per_level: number;
  base_stats: Record<string, number>;
  rarity_weight: Record<string, number>;
}

export interface GameData {
  tuning: Tuning;
  units: Record<string, UnitDef>;
  summons: SummonDef[];
  waves: WaveDef[];
  upgrades: UpgradeDef[];
  upgradeById: Record<string, UpgradeDef>;
  errors: string[];
}

export type RunMode = "short" | "full";

// テスト共通: データ読み込みとシミュレーションの作成
import { readFileSync } from "node:fs";
import { loadData } from "../src/data/dataLoader.ts";
import type { RunMode } from "../src/data/types.ts";
import { Simulation, STEP } from "../src/sim/simulation.ts";

export const readJson = (name: string): unknown => JSON.parse(readFileSync(new URL(`../data/${name}.json`, import.meta.url), "utf8"));
export const data = loadData(readJson("tuning"), readJson("units"), readJson("summons"), readJson("waves"), readJson("upgrades"));

export const sim = (seed = 1, mode: RunMode = "short"): Simulation => new Simulation(data, seed, mode);

export function runTicks(s: Simulation, n: number, mx = 0, my = 0): void {
  for (let i = 0; i < n; i++) s.step(STEP, mx, my);
}

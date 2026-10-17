// 設定の保存と読込（ブラウザ内 localStorage）。セーブデータとは別に保存する。
const KEY = "demon_swarm.settings";
const SCHEMA_VERSION = 1;

export const Settings = {
  volume: 0.6,
  shake: true,
  debugHud: false,

  load(): void {
    try {
      const v = JSON.parse(localStorage.getItem(KEY) ?? "null") as Record<string, unknown> | null;
      if (!v) return;
      if (typeof v.volume === "number") this.volume = Math.min(1, Math.max(0, v.volume));
      if (typeof v.shake === "boolean") this.shake = v.shake;
      if (typeof v.debugHud === "boolean") this.debugHud = v.debugHud;
    } catch { /* 読めなければ既定値 */ }
  },

  save(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify({ schema_version: SCHEMA_VERSION, volume: this.volume, shake: this.shake, debugHud: this.debugHud }));
    } catch { /* 保存できない環境（プライベートブラウズ等）でも遊べるようにする */ }
  },
};

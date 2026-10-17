// 色と書体（Canvas と DOM の両方で使う）。日本語は端末に入っている書体を使う（iPhone=ヒラギノ、Windows=游ゴシック/メイリオ）。
export const FONT = `"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic UI", "Yu Gothic", Meiryo, "Noto Sans JP", "Noto Sans CJK JP", sans-serif`;
export const MONO = `ui-monospace, "SF Mono", Menlo, Consolas, monospace`;

export const C = {
  bg: "#120f19",
  panel: "#1e1928",
  edge: "#3c3250",
  text: "#ece6f3",
  dim: "#a59cb6",
  demon: "#9a63e8",   // 魔王・魔力
  ember: "#e7a93b",   // 強調・選択中
  blood: "#ff5163",   // HP・危険
  soul: "#b98cff",    // 魂・経験値
  ok: "#7be08a",
} as const;

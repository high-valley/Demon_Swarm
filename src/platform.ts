// 実行環境の違いを1か所に閉じ込める。
// - Web版（GitHub Pages）と将来のデスクトップ版（Steam / Electron）で同じコードを使う
// - Steam 連携は将来ここに追加し、Web版では読み込まない

const mm = (q: string): boolean => {
  try { return matchMedia(q).matches; } catch { return false; }
};

export const Platform = {
  /** 指で操作する端末か（実際の入力が来たら InputRouter が切り替える） */
  prefersTouch(): boolean {
    return mm("(pointer: coarse)") || (typeof navigator !== "undefined" && navigator.maxTouchPoints > 0 && !mm("(pointer: fine)"));
  },
  /** 将来: Steam 版（Electron＋Steamworks）の時だけ true。Web版では常に false */
  steamAvailable(): boolean {
    return false;
  },
  /** 「終了」ボタンを出すか（ブラウザでは出さない） */
  canQuit(): boolean {
    return false;
  },
  quit(): void {
    window.close();
  },
};

/** URL の ?key や ?key=value を読む */
export function urlFlag(key: string): string | null {
  try { return new URLSearchParams(location.search).get(key); } catch { return null; }
}

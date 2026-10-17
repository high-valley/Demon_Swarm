// タイトル / ポーズ / 設定 / レベルアップ / 詳細 / リザルト の各画面（HTML）。
// 画面を開くたびに作り直す。
import type { RunMode, UpgradeDef } from "../data/types.ts";
import { Platform } from "../platform.ts";
import { Settings } from "../settings.ts";
import { button, h } from "./dom.ts";

export class Menus {
  readonly root: HTMLElement;
  touchMode = false;
  seed = 0;
  mode: RunMode = "short";
  private hotkeys: HTMLButtonElement[] = [];

  constructor(root: HTMLElement) {
    this.root = root;
  }

  private open(cls = "", onBackdrop?: () => void): HTMLElement {
    this.hotkeys = [];
    const panel = h("div", { class: `panel ${cls}` });
    const ov = h("div", { class: "ov" }, panel);
    if (onBackdrop) ov.addEventListener("pointerdown", (e) => { e.preventDefault(); onBackdrop(); });
    this.root.replaceChildren(ov);
    this.root.hidden = false;
    return panel;
  }

  hideAll(): void {
    this.root.hidden = true;
    this.root.replaceChildren();
    this.hotkeys = [];
  }

  pressHotkey(i: number): void {
    const b = this.hotkeys[i];
    if (b && !b.disabled) b.click();
  }

  showTitle(on: { play: (seed: number, mode: RunMode) => void; settings: () => void }): void {
    const p = this.open("title");
    const seedIn = h("input", { id: "seedIn", inputmode: "numeric", value: String(this.seed), size: 10 });
    const mseg = h("div", { class: "seg" });
    const modes: [RunMode, string][] = [["short", "短縮：3分でボス出現"], ["full", "仕様どおり：10分"]];
    const renderModes = (): void => {
      mseg.replaceChildren(...modes.map(([id, name]) => h("button", { type: "button", "aria-pressed": String(this.mode === id), onclick: () => { this.mode = id; renderModes(); } }, name)));
    };
    renderModes();
    const row = h("div", { class: "row" },
      button("プレイ", () => {
        const n = Number.parseInt(seedIn.value, 10);
        on.play(Number.isFinite(n) ? n : 0, this.mode);
      }, "primary"),
      button("設定", on.settings));
    if (Platform.canQuit()) row.append(button("終了", () => Platform.quit()));
    p.append(
      h("div", { class: "eyebrow" }, `Prototype · Web · v${__VERSION__}`),
      h("h1", {}, "DEMON ", h("span", {}, "SWARM")),
      h("p", {}, "魔王は攻撃できない。逃げて、召喚して、命令する。勇者が魔王に届く前に、魔物の群れで押し返せ。"),
      h("div", { class: "row" }, h("label", { for: "seedIn" }, "Seed", seedIn), mseg),
      row,
      h("p", { class: "note" }, this.touchMode
        ? "左側ドラッグ 移動 / タップ 召喚 / 長押し 命令（敵＝集中攻撃・地面＝集結）/ 右下 回避・命令解除 / スロットをタップで切替 / 横向き推奨"
        : "WASD 移動 / Space 回避 / 1・2・3 召喚スロット / 左クリック 召喚 / 右クリック 敵＝集中攻撃・地面＝集結 / R 命令解除 / Esc・P ポーズ / Tab 詳細 / F3 デバッグ"),
    );
  }

  showPause(on: { resume: () => void; settings: () => void; title: () => void }): void {
    const p = this.open();
    p.append(h("h2", {}, "ポーズ中"), h("p", {}, "ゲーム時間・AI・攻撃はすべて停止しています。"),
      h("div", { class: "row" }, button("再開", on.resume, "primary"), button("設定", on.settings), button("タイトルへ戻る", on.title)));
  }

  showSettings(on: { back: () => void; volume: (v: number) => void }): void {
    const p = this.open();
    const vol = h("input", { id: "volIn", type: "range", min: 0, max: 100, step: 5, value: Math.round(Settings.volume * 100) });
    vol.addEventListener("input", () => on.volume(Number(vol.value) / 100));
    const shake = h("input", { type: "checkbox", checked: Settings.shake });
    const dbg = h("input", { type: "checkbox", checked: Settings.debugHud });
    p.append(
      h("h2", {}, "設定"),
      h("label", { for: "volIn" }, "音量", vol),
      h("label", { class: "check" }, shake, "被弾時の画面揺れ"),
      h("label", { class: "check" }, dbg, "デバッグ表示（FPS・体数・AI時間・seed）"),
      h("p", { class: "note" }, "Steam版ではここに解像度・フルスクリーン・キー設定が入る予定。"),
      h("div", { class: "row" }, button("戻る", () => {
        Settings.volume = Number(vol.value) / 100;
        Settings.shake = shake.checked;
        Settings.debugHud = dbg.checked;
        Settings.save();
        on.back();
      }, "primary")),
    );
  }

  showLevelup(level: number, picks: UpgradeDef[], stacks: Record<string, number>, onPick: (id: string) => void): void {
    const p = this.open("level");
    p.append(h("div", { class: "eyebrow" }, `Level ${level}`), h("h2", {}, "強化を1つ選ぶ"));
    const cards = h("div", { class: "cards" });
    picks.forEach((u, i) => {
      const rare = u.rarity === "rare";
      const b = h("button", { type: "button", class: `card${rare ? " rare" : ""}`, onclick: () => onPick(u.id) },
        h("span", { class: "k" }, `${this.touchMode ? "" : `[${i + 1}] `}${rare ? "シナジー" : "強化"} · ${stacks[u.id] ?? 0}/${u.max_stacks}`),
        h("span", { class: "n" }, u.name),
        h("span", { class: "d" }, u.desc));
      cards.append(b);
      this.hotkeys.push(b);
    });
    p.append(cards);
    // 戦闘中の指がそのまま離れて誤タップしないよう、少しだけ押せない時間を作る
    for (const b of this.hotkeys) b.disabled = true;
    setTimeout(() => { for (const b of this.hotkeys) b.disabled = false; }, 250);
  }

  showInfo(lines: string[], onClose: () => void): void {
    const p = this.open("info", onClose);
    p.append(h("div", { class: "eyebrow" }, this.touchMode ? "タップで閉じる" : "Tab を離す / クリックで閉じる"),
      h("pre", { class: "info" }, lines.join("\n")));
  }

  showResult(win: boolean, rows: [string, string | number][], picks: string, on: { same: () => void; fresh: () => void; title: () => void }): void {
    const p = this.open("result");
    p.append(h("div", { class: "eyebrow" }, "Run result"), h("h2", { class: win ? "win" : "lose" }, win ? "勝利：勇者を撃退" : "敗北：魔王は倒れた"));
    const stats = h("div", { class: "stats" });
    for (const [k, v] of rows) stats.append(h("div", {}, h("b", {}, String(v)), h("span", {}, k)));
    p.append(stats, h("p", {}, picks),
      h("div", { class: "row" }, button("同じseedで再挑戦", on.same, "primary"), button("新しいseedで挑戦", on.fresh), button("タイトル", on.title)));
  }
}

# Demon Swarm — Claude Code 向け引き継ぎメモ

このファイルは Claude Code が最初に読む。作業前に必ず目を通すこと。

## プロジェクト
- 逆 Vampire Survivors 型の召喚アクション・ローグライト。魔王は攻撃せず、逃げながら魔物を召喚・指揮する。
- 仕様書: `docs/specs/01_Demon_Summoner_GDD.md`（MVP要件）、`docs/specs/03_Claude_Code_Architecture_Prompt.md`
- 配信方針: GitHub Pages（Web版・スマホでも確認）→ 固まったら同じコードを Electron で包んで Windows 版を作り Steam へ。
- 姉妹作: `high-valley/death_legacy`（同じ構成・同じCI。先に TypeScript へ移行した）、`high-valley/life_debt`。コードは各リポジトリで独立。
- オーナーとのやり取りは**日本語**。報告は「何ができたか / 残っていること / 次にお願いしたいこと」を短く。専門用語はかみ砕く。

## 現在地（2026-10 時点）
- M0 縦切りスライス完了。進捗とMVP受け入れ条件の対応表は `docs/milestones.md`。
- 公開URL: https://high-valley.github.io/Demon_Swarm/
- 経緯: 単一HTMLの試作 → Godot 版 → **iPhone のブラウザで重く遊べなかったため TypeScript（Canvas 2D）へ移行**（ADR-010）。Godot 版は `godot-legacy` ブランチ。
- 次は M1（手触り調整）。数値調整は `data/*.json` だけで行う。

## よく使うコマンド
```bash
npm install            # 初回（この作業環境では npm に繋がらないので、ln -s /opt/npm-tools/node_modules node_modules で代用できる）
npm test               # 単体テスト 19件（Node 22.18+ が TypeScript をそのまま実行）
npm run typecheck
npm run build          # dist/ に書き出し
npm run dev            # http://localhost:8000
```
画面確認は Playwright（`/opt/pw-browsers/chromium`）で dist/ を開き、`globalThis.__ds`（Game）から状態を読める。URL: `?fps` `?lowres`。

## 設計のルール（崩さないこと）
- `src/sim/simulation.ts` は DOM・描画・入力に依存しない純粋ロジック。表示側は状態を読むだけ、通知は events キュー。
- シミュレーションは requestAnimationFrame の中で 1/60 秒ずつ `step()`（1フレーム最大4回）。乱数は `RngStreams` の用途別ストリーム（spawn / upgrade / misc / map）を使い、新しい用途を足す時は既存ストリームを流用しない（seed 再現性が壊れる）。`Math.random` は描画の揺れ以外で使わない。
- 入力は必ず `InputRouter` のコールバック経由。タッチは `TouchControls` が同じコールバックに変換する（マウスは pointerType で区別）。
- HUD とタッチボタンの位置は `src/ui/hudLayout.ts` の1か所で決める（描画と当たり判定で共有）。
- バランス値はコードに書かず `data/*.json` に置く。項目を足したら `src/data/types.ts` と `loadData()` の検証にも足す。
- TypeScript は「型を消すだけで動く」書き方にする（`enum`・引数プロパティ禁止、import は `.ts` 付き）。

## CI / 公開
- `main` に push → `.github/workflows/build.yml` が型チェック → テスト → Web版を Pages に公開。テストが落ちると公開されない。

## 未実装・今後
- 仮アセット（図形・コード生成の効果音）→ 本番素材への差し替え
- 解像度/フルスクリーン/キー割当の設定、ゲームパッド
- 統計・アンロックのセーブ（schema_version 付き）
- Steam 版（Electron＋Steamworks）。入口は `src/platform.ts` の `steamAvailable()`

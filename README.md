# Demon Swarm（仮）

魔王は攻撃できない。逃げて、召喚して、命令する。
**逆 Vampire Survivors 型の召喚アクション・ローグライト**の最小縦切りスライス（TypeScript / Canvas 2D）。

- 遊ぶ（Web版・スマホ可）: https://high-valley.github.io/Demon_Swarm/
- 仕様: GDD v1.0（`docs/specs/01_Demon_Summoner_GDD.md`）の MVP をもとに実装
- 配信方針: GitHub Pages で確認 → 固まったら同じコードを Electron で包んで Windows 版を作り Steam へ（ADR-010）
- 旧 Godot 版は `godot-legacy` ブランチに保存（iPhone のブラウザで重かったため移行）

## 操作

| 操作 | キーボード＋マウス | スマホ（横向き推奨） |
|---|---|---|
| 魔王移動 | WASD / 矢印 | 画面左側をドラッグ（スティックは指に付いてくる） |
| 回避ダッシュ | Space | 右下「回避」 |
| 召喚スロット | 1 / 2 / 3、ホイール、スロットをクリック | 下のスロットをタップ |
| 召喚 | 左クリック（カーソル位置） | タップ |
| 集中攻撃 / 集結 | 右クリック（敵 / 地面） | 長押し（敵 / 地面） |
| 命令解除 | R | 右下「解除」 |
| ポーズ | Esc / P | 右上「II」 |
| 詳細 | Tab（押している間） | 右上「i」（タップで閉じる） |
| デバッグ表示 | F3 | 設定画面 / URL に `?fps` |

タイトルで「短縮：3分でボス出現」と「仕様どおり：10分」を選べる。seed を指定すると敵の出現と強化候補の順序が再現される。
URL の付け足し: `?fps`（FPS表示）、`?lowres`（解像度を半分に）。

## ローカルで動かす

Node.js 22.18 以上が必要。

```bash
npm install
npm run dev        # http://localhost:8000
npm test           # 単体テスト 19件
npm run typecheck
npm run build      # dist/ に書き出し（GitHub Pages に置くもの）
```

`main` に push すると、型チェック → テスト → Web版を Pages に公開（テストが落ちると公開されない）。

## フォルダ構成

```
data/*.json         バランス値（ユニット・召喚・ウェーブ・強化・調整値）。数値調整はここだけ
src/
  sim/simulation.ts 戦闘ロジック本体（DOM非依存・固定ステップ・テスト可能）
  data/             JSON の型と読込時の検証
  core/             乱数（用途別ストリーム）・空間グリッド
  input/            InputRouter（キーボード・マウス）・TouchControls（スティック・タップ・長押し）
  view/ ui/         戦場の描画・HUD・効果音 / 画面（HTML）・HUD配置
  main.ts           状態機械・60Hz固定ステップのループ・配線
tests/              単体テスト（CIで実行）
docs/               設計メモ・判断記録（ADR）・マイルストーン・仕様書
```

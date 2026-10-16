# Demon Swarm（仮）

魔王は攻撃できない。逃げて、召喚して、命令する。
**逆 Vampire Survivors 型の召喚アクション・ローグライト**の最小縦切りスライス（Godot 4.7 / GDScript）。

- 遊ぶ（Web版）: `https://high-valley.github.io/demon_swarm/` ※ Pages 有効化後
- 仕様: GDD v1.0（`01_Demon_Summoner_GDD.md`）の MVP をもとに実装
- 配信方針: **GitHub Pages で確認 → 固まったら同じプロジェクトから Windows 版を書き出して Steam へ**

## 操作

| 操作 | キーボード＋マウス | スマホ（横向き推奨） |
|---|---|---|
| 魔王移動 | WASD / 矢印 | 画面左側をドラッグ（仮想スティック） |
| 回避ダッシュ | Space | 右下「回避」 |
| 召喚スロット | 1 / 2 / 3、ホイール | 下のスロットをタップ |
| 召喚 | 左クリック（カーソル位置） | タップ |
| 集中攻撃 / 集結 | 右クリック（敵 / 地面） | 長押し（敵 / 地面） |
| 命令解除 | R | 右下「解除」 |
| ポーズ | Esc / P | 右上「II」 |
| 詳細 | Tab（押している間） | 右上「i」 |
| デバッグHUD | F3 | 設定画面から |

タイトルで「短縮：3分でボス出現」と「仕様どおり：10分」を選べる。seed を指定すると敵の出現と強化候補の順序が再現される。

## 初回だけ必要な設定（GitHub Pages）

1. リポジトリの **Settings → Pages** を開く
2. **Build and deployment → Source** を **GitHub Actions** にする
3. **Actions** タブで最新の「Build & Deploy」を **Re-run all jobs**（または何か push）

以降は `main` に push するたびに、テスト → Web版を Pages に公開 → Windows版を Actions の成果物に保存、が自動で走る。

## ローカルで動かす（Windows）

1. [Godot 4.7.2](https://godotengine.org/download/archive/4.7.2-stable/)（標準版、.NET版ではない）をダウンロードして解凍
2. Godot を起動 →「インポート」→ このフォルダの `project.godot` を選択
3. F5 で実行。テストはコマンドで:
   ```
   Godot_v4.7.2-stable_win64_console.exe --headless --path . -s res://tests/run_tests.gd
   ```
4. Web版をローカルで書き出す場合は、エディタの「エディター → エクスポートテンプレートの管理」でテンプレートを入れてから「プロジェクト → エクスポート → Web」

開発用のスクリーンショット: `godot --path . -- --shot=out.png --play --touch --frames=600`

## フォルダ構成

```
data/            バランス値（JSON）。数値調整はここだけ
scripts/
  autoload/      Settings（設定保存）, Platform（Web/デスクトップ/Steamの差を吸収）
  core/          Unit, SquadOrder, SpatialGrid, RngStreams
  data/          DataLoader（JSON読込＋検証）
  sim/           Simulation（戦闘ロジック本体。ノード非依存・テスト可能）
  input/         InputRouter（キーボード/マウス/タッチ → 意図）
  view/          BattleView（戦場描画）, Sfx（仮効果音）
  ui/            Hud, TouchControls, Menus, HudLayout
  main.gd        状態機械と配線
tests/           ヘッドレス単体テスト（CIで実行）
tools/           フォントのサブセット作成スクリプト
docs/            設計メモ・判断記録・マイルストーン
```

## 既知の未実装・仮のもの

- 見た目は図形の仮アセット、効果音はコード生成の仮音
- 解像度・フルスクリーン・キー割当の設定画面、ゲームパッド
- Steam 連携（GodotSteam）。`scripts/autoload/platform.gd` に入口だけ用意
- 恒久アンロック・統計のセーブ（設定のみ保存）
- フォントは Noto Sans CJK JP を JIS第1水準＋使用文字にサブセット。第2水準の漢字を使ったら `python3 tools/subset_font.py` を再実行

## ライセンス

- フォント: Noto Sans CJK JP（SIL Open Font License 1.1）— `assets/fonts/LICENSE-NotoSansCJK.txt`

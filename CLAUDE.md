# Demon Swarm — Claude Code 向け引き継ぎメモ

このファイルは Claude Code が最初に読む。作業前に必ず目を通すこと。

## プロジェクト
- 逆 Vampire Survivors 型の召喚アクション・ローグライト。魔王は攻撃せず、逃げながら魔物を召喚・指揮する。
- 仕様書: `docs/specs/01_Demon_Summoner_GDD.md`（MVP要件）、`docs/specs/03_Claude_Code_Architecture_Prompt.md`
- 配信方針: GitHub Pages（Web版）で確認 → 固まったら同じプロジェクトから Windows 版を書き出して Steam へ。
- オーナーとのやり取りは**日本語**で行う。報告は「何ができたか / 残っていること / 次にお願いしたいこと」を短く。

## 現在地（2026-10 時点）
- M0 縦切りスライス完了。進捗とMVP受け入れ条件の対応表は `docs/milestones.md`。
- 公開URL: https://high-valley.github.io/demon_swarm/
- 次は M1（手触り調整）。数値調整は `data/*.json` だけで行う。
- 経緯: 最初に単一HTMLのブラウザ試作で手触りを確認 → 同じ仕様で Godot 版を作成。スマホのタッチ操作は「Web版でスマホ確認したい」というオーナーの要望で最初から入れている。

## 技術スタック
- Godot **4.7.2-stable** / GDScript（C# は Web 書き出し非対応なので使わない）
- レンダラー: Compatibility（Web 必須）
- Web 書き出しは**スレッドなし**（GitHub Pages は COOP/COEP ヘッダーを付けられないため）
- 判断の理由は `docs/decisions.md`（ADR）。新しい判断をしたら追記する。

## よく使うコマンド
```bash
godot --headless --path . --import                         # 初回・アセット追加後
godot --headless --path . -s res://tests/run_tests.gd      # 単体テスト（失敗で終了コード1）
godot --path . -- --shot=out.png --play --touch --frames=600   # 画面確認用スクリーンショット
godot --headless --path . --export-release "Web" build/web/index.html
python3 tools/subset_font.py /path/to/NotoSansCJK-Regular.ttc  # 日本語フォント再生成
```

## 設計のルール（崩さないこと）
- `scripts/sim/simulation.gd` はノード・描画・入力に依存しない純粋ロジック。表示側は状態を読むだけ、通知は events キュー。
- シミュレーションは `_physics_process`（60Hz固定）で `step(1/60)`。乱数は `RngStreams` の用途別ストリームを使い、新しい用途を足す時は既存ストリームを流用しない（seed 再現性が壊れる）。
- 入力は必ず `InputRouter` のシグナル経由。タッチは `TouchControls` が同じシグナルに変換する。タッチ由来のエミュレーションマウス（`DEVICE_ID_EMULATION`）は無視する。
- バランス値はコードに書かず `data/*.json` に置く。`DataLoader` に検証ルールがあるので、項目を足したら検証も足す。
- ユニットが他ユニットを参照したら、死亡時・`dispose()` で参照を切る（RefCounted の循環でリークする）。
- 全画面の Control は `set_anchors_and_offsets_preset(PRESET_FULL_RECT)` を使う（`set_anchors_preset` だけだとサイズ0になり描画されない）。
- UIテキストに JIS 第2水準の漢字を足したら `tools/subset_font.py` を再実行（しないと Web 版で豆腐表示）。

## CI / 公開
- `main` に push → `.github/workflows/build.yml` がテスト → Web版を Pages に公開 → Windows版を Artifacts に保存。
- テストが落ちると公開されない。push 前にローカルでテストを通す。
- Godot のバージョンを上げる時は `project.godot` の features と workflow の `GODOT_VERSION` / `GODOT_RELEASE` を同時に変える。

## 未実装・今後
- 仮アセット（図形・コード生成の効果音）→ 本番素材への差し替え
- 解像度/フルスクリーン/キー割当の設定、ゲームパッド
- 統計・アンロックのセーブ（schema_version 付き）
- Steam: GodotSteam は `scripts/autoload/platform.gd` の `steam_available()` を入口にし、Web版では読み込まない

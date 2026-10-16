#!/usr/bin/env python3
"""Web版でも日本語が表示されるよう、Noto Sans CJK JP を必要な文字だけに絞って同梱する。

含める文字: ASCII / 記号 / ひらがな・カタカナ / JIS第1水準漢字 / プロジェクト内で使っている全文字
  python3 tools/subset_font.py /path/to/NotoSansCJK-Regular.ttc
テキストに新しい漢字（第2水準）を足したら再実行する。
"""
import pathlib, sys
from fontTools.ttLib import TTCollection, TTFont
from fontTools import subset

root = pathlib.Path(__file__).resolve().parent.parent
src = sys.argv[1] if len(sys.argv) > 1 else "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"
chars = set(chr(c) for c in range(0x20, 0x7F))
chars |= set(chr(c) for c in range(0x3000, 0x30FF + 1))   # 記号・かな
chars |= set(chr(c) for c in range(0xFF01, 0xFF5E + 1))   # 全角英数記号
chars |= set("・ー〜…→←↑↓×÷±≦≧♪★☆○●◎◇◆□■△▲▽▼")
for row in range(16, 48):                                  # JIS X 0208 第1水準
    for cell in range(1, 95):
        try:
            chars.add(bytes([0xA0 + row, 0xA0 + cell]).decode("euc_jp"))
        except UnicodeDecodeError:
            pass
for path in list(root.glob("scripts/**/*.gd")) + list(root.glob("data/*.json")):
    chars |= set(path.read_text(encoding="utf-8"))
chars = {c for c in chars if c.isprintable()}
font = TTCollection(src).fonts[0] if src.endswith(".ttc") else TTFont(src)
opts = subset.Options()
opts.layout_features = ["kern", "palt", "vert"]
opts.name_IDs = ["*"]
opts.notdef_outline = True
sub = subset.Subsetter(opts)
sub.populate(text="".join(sorted(chars)))
sub.subset(font)
out = root / "assets/fonts/NotoSansJP-Subset.otf"
font.save(out)
print(f"{len(chars)} chars -> {out} ({out.stat().st_size // 1024} KB)")

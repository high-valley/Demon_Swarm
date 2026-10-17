// Web版を dist/ に書き出す（GitHub Pages にそのまま置ける）。
//   node tools/build.mjs          … 本番用（圧縮あり）
//   node tools/build.mjs --serve  … 開発用（http://localhost:8000 、保存するたびに作り直す）
import * as esbuild from "esbuild";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const serve = process.argv.includes("--serve");
const root = new URL("..", import.meta.url).pathname;
const out = root + "dist/";
const version = JSON.parse(readFileSync(root + "package.json", "utf8")).version;
const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const f of ["style.css", "icon.svg"]) cpSync(root + f, out + f);
// 更新後に古いファイルが残らないよう、読み込むファイル名にビルドごとの印を付ける
const tag = Date.now().toString(36);
writeFileSync(out + "index.html", readFileSync(root + "index.html", "utf8")
  .replace('href="style.css"', `href="style.css?v=${tag}"`)
  .replace('src="main.js"', `src="main.js?v=${tag}"`));

const opts = {
  entryPoints: [root + "src/main.ts"],
  bundle: true,
  format: "esm",
  target: ["es2020", "safari15"],
  outfile: out + "main.js",
  sourcemap: true,
  minify: !serve,
  define: { __VERSION__: JSON.stringify(`${version} (${stamp})`) },
  logLevel: "info",
};

if (serve) {
  const ctx = await esbuild.context(opts);
  await ctx.watch();
  const { port } = await ctx.serve({ servedir: out, port: 8000 });
  console.log(`http://localhost:${port}/`);
} else {
  await esbuild.build(opts);
}

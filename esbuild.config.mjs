import esbuild from "esbuild";
import { existsSync, mkdirSync } from "fs";

const outdir = "../.obsidian/plugins/obsidian-blob-upload";
if (!existsSync(outdir)) mkdirSync(outdir, { recursive: true });

const watch = process.argv.includes("--watch");

const ctx = await esbuild.context({
	entryPoints: ["src/main.ts"],
	bundle: true,
	external: ["obsidian", "electron", "@codemirror/*", "@lezer/*"],
	format: "cjs",
	target: "es2022",
	logLevel: "info",
	sourcemap: "inline",
	treeShaking: true,
	outfile: `${outdir}/main.js`,
});

if (watch) {
	await ctx.watch();
} else {
	await ctx.rebuild();
	await ctx.dispose();
}

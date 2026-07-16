import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const source = resolve(root, "dist");
const target = resolve(root, "website", "public");

if (!existsSync(resolve(source, "index.html")) || !existsSync(resolve(source, "assets"))) {
  throw new Error("Missing public game build. Run npm run build:public first.");
}

rmSync(resolve(target, "assets"), { recursive: true, force: true });
rmSync(resolve(target, "play"), { recursive: true, force: true });
mkdirSync(resolve(target, "play"), { recursive: true });
cpSync(resolve(source, "assets"), resolve(target, "assets"), { recursive: true });
cpSync(resolve(source, "index.html"), resolve(target, "play", "index.html"));

console.log("Public game bundle synchronized into the hosted site.");

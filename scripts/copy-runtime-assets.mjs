import { copyFile, cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";

const source = path.resolve("src/analysis/skills-v1");
const target = path.resolve("dist/analysis/skills-v1");

await mkdir(path.dirname(target), { recursive: true });
await rm(target, { recursive: true, force: true });
await cp(source, target, { recursive: true, force: true });
await mkdir(path.resolve("dist/providers"), { recursive: true });
await copyFile(
  path.resolve("src/providers/panda-worker.py"),
  path.resolve("dist/providers/panda-worker.py"),
);
await copyFile(
  path.resolve("src/providers/akshare-worker.py"),
  path.resolve("dist/providers/akshare-worker.py"),
);

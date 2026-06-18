import { rmSync } from "node:fs";
import { resolve } from "node:path";

const workspace = resolve(process.cwd());
const targets = [resolve(workspace, ".next"), resolve(workspace, "tsconfig.tsbuildinfo")];

for (const target of targets) {
  if (!target.startsWith(workspace)) {
    throw new Error("Refusing to clean outside the workspace.");
  }

  rmSync(target, { recursive: true, force: true });
}

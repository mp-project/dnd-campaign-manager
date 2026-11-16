/**
 * The demo for `npm run dev`: the clickdummy's dev server (http://localhost:5180), which the start
 * page links as the demo (`VITE_DEMO_URL`). The clickdummy is local only (gitignored), so without
 * it, or without its dependencies, this says so and waits instead of exiting: `concurrently -k`
 * would otherwise stop the backend and frontend too.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const clickdummy = fileURLToPath(new URL("../clickdummy/", import.meta.url));

function idle(reason) {
  console.log(`[demo] not started: ${reason}`);
  setInterval(() => {}, 1 << 30);
}

if (!existsSync(`${clickdummy}package.json`)) {
  idle("no clickdummy/ in this checkout");
} else if (!existsSync(`${clickdummy}node_modules`)) {
  idle("clickdummy dependencies missing, run `npm install` in clickdummy/ once");
} else {
  const child = spawn("npm", ["run", "-s", "dev"], { cwd: clickdummy, stdio: "inherit", shell: process.platform === "win32" });
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
  child.on("exit", (code) => process.exit(code ?? 0));
}

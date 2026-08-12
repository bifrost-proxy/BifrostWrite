import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = fileURLToPath(new URL("..", import.meta.url));
const source = path.join(appRoot, "out", "native-backend");
const destination = path.join(appRoot, "src-tauri", "resources", "native-backend");

function run(command, args) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            cwd: appRoot,
            env: process.env,
            stdio: "inherit",
            shell: process.platform === "win32",
        });
        child.on("error", reject);
        child.on("exit", (code, signal) => {
            if (code === 0) return resolve();
            reject(new Error(signal ? `${command} terminated with ${signal}` : `${command} exited with ${code}`));
        });
    });
}

await run("node", ["scripts/stage-native-runtime-assets.mjs", ...process.argv.slice(2)]);
await fs.rm(destination, { recursive: true, force: true });
await fs.mkdir(path.dirname(destination), { recursive: true });
await fs.cp(source, destination, { recursive: true, dereference: true });
console.log(`Staged BifrostWrite native resources at ${destination}`);

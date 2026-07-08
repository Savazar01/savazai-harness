import { spawn } from "node:child_process";
import { resolve } from "node:path";

const VENV_PATH = resolve(process.cwd(), ".venv");

export async function runPython(
  scriptPath: string,
  args: string[] = [],
): Promise<unknown> {
  return new Promise((resolvePromise, reject) => {
    const proc = spawn("python3", [scriptPath, ...args], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        VIRTUAL_ENV: VENV_PATH,
        PATH: `${VENV_PATH}/bin;${process.env.PATH ?? ""}`,
      },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Python exited with code ${code}\n${stderr}`));
        return;
      }
      if (stderr) {
        console.warn("[python-runner] stderr:", stderr);
      }
      try {
        resolvePromise(JSON.parse(stdout));
      } catch {
        resolvePromise(stdout);
      }
    });

    proc.on("error", reject);
  });
}

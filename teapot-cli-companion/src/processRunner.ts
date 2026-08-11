import { spawn } from "node:child_process";

export interface ProcessResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export function runProcess(
  executable: string,
  args: readonly string[],
  options: {
    cwd?: string;
    signal?: AbortSignal;
    input?: string;
    timeoutMs?: number;
    env?: Readonly<NodeJS.ProcessEnv>;
    inheritEnv?: boolean;
  } = {},
): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(new Error("CLI generation timed out")),
      options.timeoutMs ?? 180_000,
    );
    const onAbort = () => controller.abort(options.signal?.reason);
    options.signal?.addEventListener("abort", onAbort, { once: true });
    const child = spawn(executable, [...args], {
      cwd: options.cwd,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
      signal: controller.signal,
      env: {
        ...(options.inheritEnv === false ? {} : process.env),
        ...options.env,
        NO_COLOR: "1",
      },
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    const maxCapture = 64 * 1024;
    let stdoutSize = 0;
    let stderrSize = 0;
    child.stdout.on("data", (chunk: Buffer) => {
      if (stdoutSize < maxCapture) {
        stdout.push(chunk.subarray(0, maxCapture - stdoutSize));
        stdoutSize += chunk.byteLength;
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      if (stderrSize < maxCapture) {
        stderr.push(chunk.subarray(0, maxCapture - stderrSize));
        stderrSize += chunk.byteLength;
      }
    });
    child.once("error", reject);
    child.once("close", (exitCode) => {
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", onAbort);
      resolve({
        exitCode: exitCode ?? 1,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      });
    });
    if (options.input) child.stdin.end(options.input);
    else child.stdin.end();
  });
}

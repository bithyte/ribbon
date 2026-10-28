import { spawn, type ChildProcessByStdio } from "node:child_process";
import type { Readable, Writable } from "node:stream";
import {
  NESTED_RENDER_VALUE,
  NESTED_RENDER_VARIABLE,
  RUN_OUTPUT_MAX_BYTES,
  SHELL_PATH,
} from "./constants.ts";

type ShellChild = ChildProcessByStdio<Writable, Readable, null>;

/** Runs a shell command with stdin input and a deadline. Never throws; every failure is `undefined`. */
export class CommandRunner {
  private readonly command: string;
  private readonly input: string;
  private readonly timeoutMs: number;
  private readonly chunks: Buffer[] = [];
  private storedByteCount = 0;
  private isFirstLineComplete = false;

  private constructor(command: string, input: string, timeoutMs: number) {
    this.command = command;
    this.input = input;
    this.timeoutMs = timeoutMs;
  }

  /** Resolves the first stdout line (at most 64 KiB) without trailing whitespace, or `undefined` on empty output, non-zero exit, spawn failure or timeout. Never throws. */
  public static run(
    command: string,
    input: string,
    timeoutMs: number,
  ): Promise<string | undefined> {
    return new CommandRunner(command, input, timeoutMs).execute();
  }

  private execute(): Promise<string | undefined> {
    let child: ShellChild;
    try {
      child = spawn(SHELL_PATH, ["-c", this.command], {
        detached: true,
        env: { ...process.env, [NESTED_RENDER_VARIABLE]: NESTED_RENDER_VALUE },
        stdio: ["pipe", "pipe", "ignore"],
      });
    } catch {
      // spawn throws synchronously on invalid arguments, such as a command containing NUL.
      return Promise.resolve(undefined);
    }
    const { promise, resolve } = Promise.withResolvers<string | undefined>();
    const timer = setTimeout(() => {
      CommandRunner.killGroup(child);
      finish(undefined);
    }, this.timeoutMs);
    const finish = (output: string | undefined): void => {
      clearTimeout(timer);
      resolve(output);
    };
    child.on("error", () => {
      finish(undefined);
    });
    child.on("close", (code) => {
      finish(code === 0 ? this.toFirstLine() : undefined);
    });
    child.stdout.on("data", (chunk: Buffer) => {
      this.store(chunk);
    });
    // Commands may exit without reading stdin; the resulting EPIPE is expected, not a failure.
    child.stdin.on("error", () => {});
    child.stdin.end(this.input);
    return promise;
  }

  // Once the first line is complete, later chunks are still read so the child never blocks
  // on a full pipe, but they are dropped.
  private store(chunk: Buffer): void {
    if (this.isFirstLineComplete) {
      return;
    }
    const newlineIndex = chunk.indexOf("\n");
    const lineEnd = newlineIndex === -1 ? chunk.length : newlineIndex;
    const keptByteCount = Math.min(lineEnd, RUN_OUTPUT_MAX_BYTES - this.storedByteCount);
    this.chunks.push(chunk.subarray(0, keptByteCount));
    this.storedByteCount += keptByteCount;
    this.isFirstLineComplete = newlineIndex !== -1 || this.storedByteCount === RUN_OUTPUT_MAX_BYTES;
  }

  private toFirstLine(): string | undefined {
    const line = Buffer.concat(this.chunks).toString("utf8").trimEnd();
    return line === "" ? undefined : line;
  }

  // Detached children lead their own process group, so the negative pid also reaches
  // background jobs that still hold stdout open and would otherwise delay `close`.
  private static killGroup(child: ShellChild): void {
    child.stdin.destroy();
    child.stdout.destroy();
    if (child.pid === undefined) {
      return;
    }
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      // The group already exited between the deadline and the kill.
    }
  }
}

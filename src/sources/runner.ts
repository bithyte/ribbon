import { spawn, type ChildProcessByStdio } from "node:child_process";
import type { Readable, Writable } from "node:stream";
import { SHELL_PATH } from "./constants.ts";

type ShellChild = ChildProcessByStdio<Writable, Readable, null>;

/** Runs a shell command with stdin input and a deadline. Never throws; every failure is `undefined`. */
export class CommandRunner {
  private readonly command: string;
  private readonly input: string;
  private readonly timeoutMs: number;
  private readonly chunks: string[] = [];

  private constructor(command: string, input: string, timeoutMs: number) {
    this.command = command;
    this.input = input;
    this.timeoutMs = timeoutMs;
  }

  /** Resolves the first stdout line without trailing whitespace, or `undefined` on empty output, non-zero exit, spawn failure or timeout. Never throws. */
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
      finish(code === 0 ? CommandRunner.toFirstLine(this.chunks.join("")) : undefined);
    });
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      this.chunks.push(chunk);
    });
    // Commands may exit without reading stdin; the resulting EPIPE is expected, not a failure.
    child.stdin.on("error", () => {});
    child.stdin.end(this.input);
    return promise;
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

  private static toFirstLine(output: string): string | undefined {
    const line = (output.split("\n")[0] ?? "").trimEnd();
    return line === "" ? undefined : line;
  }
}

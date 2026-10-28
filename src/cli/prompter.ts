import { createInterface, type Interface } from "node:readline";
import type { Readable, Writable } from "node:stream";
import { YES_ANSWER_PATTERN } from "./constants.ts";

/** Asks y/N questions on a terminal. One shared line iterator, so piped answers that arrive early aren't lost. */
export class CliPrompter {
  private readonly input: Readable;
  private readonly output: Writable;
  private lineReader: Interface | undefined;
  private lines: AsyncIterator<string> | undefined;

  public constructor(input: Readable, output: Writable) {
    this.input = input;
    this.output = output;
    this.lineReader = undefined;
    this.lines = undefined;
  }

  /** Writes `question` and reads one line; `y` or `yes` (any case) is yes, anything else or EOF is no. */
  public async confirm(question: string): Promise<boolean> {
    this.output.write(question);
    const next = await this.requireLines().next();
    return next.done !== true && YES_ANSWER_PATTERN.test(next.value.trim());
  }

  /** Releases stdin so the process can exit. Safe to call when nothing was asked. */
  public close(): void {
    this.lineReader?.close();
  }

  private requireLines(): AsyncIterator<string> {
    if (this.lines !== undefined) {
      return this.lines;
    }
    // Created on first question so a run that asks nothing never touches stdin.
    const lineReader = createInterface({ input: this.input, crlfDelay: Infinity });
    this.lineReader = lineReader;
    this.lines = lineReader[Symbol.asyncIterator]();
    return this.lines;
  }
}

import { PassThrough, type Readable, type Writable } from "node:stream";
import { createInterface, type Interface } from "node:readline";
import { confirm, isCancel } from "@clack/prompts";

/**
 * Asks yes/no questions with clack. Off a terminal each question gets one line from a shared line
 * iterator, so piped answers that arrive early aren't lost; clack alone drops them after the first.
 */
export class CliPrompter {
  private readonly input: Readable;
  private readonly output: Writable;
  private readonly isTerminal: boolean;
  private lineReader: Interface | undefined;
  private lines: AsyncIterator<string> | undefined;

  public constructor(input: Readable, output: Writable, isTerminal: boolean) {
    this.input = input;
    this.output = output;
    this.isTerminal = isTerminal;
    this.lineReader = undefined;
    this.lines = undefined;
  }

  /** Shows `question`; yes only on an explicit yes, so cancel, EOF or anything else is no. */
  public async confirm(question: string): Promise<boolean> {
    if (this.isTerminal) {
      return this.ask(question, this.input);
    }
    const next = await this.requireLines().next();
    if (next.done === true) {
      return false;
    }
    const answer = new PassThrough();
    answer.end(`${next.value}\n`);
    return this.ask(question, answer);
  }

  /** Releases stdin so the process can exit. Safe to call when nothing was asked. */
  public close(): void {
    this.lineReader?.close();
  }

  private async ask(question: string, input: Readable): Promise<boolean> {
    const answer = await confirm({
      message: question,
      initialValue: false,
      input,
      output: this.output,
    });
    return !isCancel(answer) && answer;
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

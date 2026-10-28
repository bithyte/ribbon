#!/usr/bin/env node
import { homedir } from "node:os";
import { join } from "node:path";
import { text } from "node:stream/consumers";
import { Installer, type InstallResult } from "@ribbon/install";
import { LAYOUT_FILE_NAME, LayoutStore } from "@ribbon/layout";
import { PayloadParser, Renderer } from "@ribbon/render";
import { NESTED_RENDER_VARIABLE, RenderSources } from "@ribbon/sources";
import { Command, CommanderError } from "commander";
import {
  CLAUDE_DIRECTORY_NAME,
  COMMANDER_ERROR_PREFIX_PATTERN,
  HELP_ERROR_CODES,
  INSTALL_DESCRIPTION,
  INSTALL_TTY_OFF,
  INSTALL_TTY_ON,
  LINE_BREAK_PATTERN,
  MS_PER_SECOND,
  PROGRAM_DESCRIPTION,
  PROGRAM_NAME,
  RENDER_DESCRIPTION,
  UNINSTALL_DESCRIPTION,
  UNIX_TIMESTAMP_PATTERN,
  YES_DESCRIPTION,
} from "./constants.ts";
import { CliPrompter } from "./prompter.ts";
import type { InstallCommandOptions } from "./types.ts";

/** usage: ribbon <render|install [--yes]|uninstall> */
class RibbonCli {
  private exitCode: number;

  private constructor() {
    this.exitCode = 0;
  }

  public static async run(args: readonly string[]): Promise<number> {
    // Known before parsing options, so a bad render option still reaches the status line.
    const command = args[0];
    try {
      return await new RibbonCli().parse(args);
    } catch (error) {
      if (error instanceof CommanderError && HELP_ERROR_CODES.has(error.code)) {
        return error.exitCode;
      }
      const message = RibbonCli.describeError(error);
      // Claude Code shows a status line command's stdout, never its stderr.
      if (command === "render") {
        process.stdout.write(`ribbon: ${message.replace(LINE_BREAK_PATTERN, " ")}\n`);
        return 0;
      }
      process.stderr.write(`ribbon: ${message}\n`);
      return 1;
    }
  }

  private async parse(args: readonly string[]): Promise<number> {
    await this.createProgram().parseAsync([...args], { from: "user" });
    return this.exitCode;
  }

  private createProgram(): Command {
    // Set before adding commands, which copy these settings when created. Errors are thrown
    // instead of printed so run() can write them, with render's going to stdout.
    const program = new Command(PROGRAM_NAME)
      .description(PROGRAM_DESCRIPTION)
      .exitOverride()
      .configureOutput({ outputError: () => {} });
    program
      .command("render")
      .description(RENDER_DESCRIPTION)
      .action(async () => {
        this.exitCode = await RibbonCli.render();
      });
    program
      .command("install")
      .description(INSTALL_DESCRIPTION)
      .option("-y, --yes", YES_DESCRIPTION)
      .action(async (options: InstallCommandOptions) => {
        this.exitCode = await RibbonCli.install(options.yes === true);
      });
    program
      .command("uninstall")
      .description(UNINSTALL_DESCRIPTION)
      .action(async () => {
        this.exitCode = await RibbonCli.uninstall();
      });
    return program;
  }

  private static async render(): Promise<number> {
    const nowSeconds = RibbonCli.resolveNowSeconds(process.env["RIBBON_NOW"]);
    const configDir = RibbonCli.resolveConfigDir(process.env["CLAUDE_CONFIG_DIR"]);
    const isRunDisabled = RibbonCli.isNestedRender(process.env[NESTED_RENDER_VARIABLE]);
    const layoutPath = join(configDir, LAYOUT_FILE_NAME);
    const payloadText = await text(process.stdin);
    const result = await LayoutStore.load(layoutPath);
    if (result.kind === "invalid") {
      throw new Error(`config ${JSON.stringify(layoutPath)}: ${result.message}`);
    }
    const payload = PayloadParser.parse(payloadText);
    const inputs = await RenderSources.gather(
      result.layout,
      payload,
      payloadText,
      { configDir, nowSeconds },
      { isRunDisabled },
    );
    process.stdout.write(Renderer.render(result.layout, inputs));
    return 0;
  }

  private static async install(isYes: boolean): Promise<number> {
    const configDir = RibbonCli.resolveConfigDir(process.env["CLAUDE_CONFIG_DIR"]);
    const prompter =
      isYes || !RibbonCli.isInteractive(process.env["RIBBON_INSTALL_TTY"])
        ? undefined
        : new CliPrompter(process.stdin, process.stdout, process.stdin.isTTY === true);
    let result: InstallResult;
    try {
      result = await Installer.install({
        configDir,
        confirm: (question) => RibbonCli.confirm(question, isYes, prompter),
      });
    } finally {
      prompter?.close();
    }
    process.stdout.write(RibbonCli.formatLines(result.lines));
    return result.kind === "declined" ? 1 : 0;
  }

  private static async uninstall(): Promise<number> {
    const configDir = RibbonCli.resolveConfigDir(process.env["CLAUDE_CONFIG_DIR"]);
    const result = await Installer.uninstall(configDir);
    process.stdout.write(RibbonCli.formatLines(result.lines));
    return 0;
  }

  private static async confirm(
    question: string,
    isYes: boolean,
    prompter: CliPrompter | undefined,
  ): Promise<boolean> {
    if (isYes) {
      return true;
    }
    if (prompter === undefined) {
      throw new Error(
        "install needs confirmation to replace the existing statusLine; rerun with --yes",
      );
    }
    return prompter.confirm(question);
  }

  private static isInteractive(rawInstallTty: string | undefined): boolean {
    if (rawInstallTty === INSTALL_TTY_ON) {
      return true;
    }
    if (rawInstallTty === INSTALL_TTY_OFF) {
      return false;
    }
    return process.stdin.isTTY === true;
  }

  // Set by ribbon's own runner: a render inside a `run` segment must not run segments again.
  private static isNestedRender(rawNestedRender: string | undefined): boolean {
    return rawNestedRender !== undefined && rawNestedRender !== "";
  }

  private static describeError(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    return error instanceof CommanderError
      ? message.replace(COMMANDER_ERROR_PREFIX_PATTERN, "")
      : message;
  }

  private static formatLines(lines: readonly string[]): string {
    return lines.map((line) => `${line}\n`).join("");
  }

  private static resolveNowSeconds(rawNow: string | undefined): number {
    if (rawNow === undefined) {
      return Math.floor(Date.now() / MS_PER_SECOND);
    }
    if (!UNIX_TIMESTAMP_PATTERN.test(rawNow)) {
      throw new Error(`RIBBON_NOW ${JSON.stringify(rawNow)} is not a unix timestamp`);
    }
    return Number(rawNow);
  }

  private static resolveConfigDir(rawConfigDir: string | undefined): string {
    return rawConfigDir === undefined || rawConfigDir === ""
      ? join(homedir(), CLAUDE_DIRECTORY_NAME)
      : rawConfigDir;
  }
}

process.exitCode = await RibbonCli.run(process.argv.slice(2));

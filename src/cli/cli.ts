#!/usr/bin/env node
import { homedir } from "node:os";
import { join } from "node:path";
import { text } from "node:stream/consumers";
import { parseArgs } from "node:util";
import { Installer, type InstallResult } from "../install/index.ts";
import { LAYOUT_FILE_NAME, LayoutStore } from "../layout/index.ts";
import { PayloadParser, Renderer } from "../render/index.ts";
import { RenderSources } from "../sources/index.ts";
import {
  CLAUDE_DIRECTORY_NAME,
  CLI_OPTIONS,
  HELP_TEXT,
  INSTALL_TTY_OFF,
  INSTALL_TTY_ON,
  MS_PER_SECOND,
  UNIX_TIMESTAMP_PATTERN,
  USAGE,
} from "./constants.ts";
import { CliPrompter } from "./prompter.ts";

/** usage: ribbon <render|install|uninstall> [--yes] */
class RibbonCli {
  private constructor() {}

  public static async run(args: readonly string[]): Promise<number> {
    let command: string | undefined;
    try {
      const { values, positionals } = parseArgs({
        args: [...args],
        options: CLI_OPTIONS,
        allowPositionals: true,
      });
      command = positionals[0];
      if (values.help === true || command === "help") {
        process.stdout.write(HELP_TEXT);
        return 0;
      }
      return await RibbonCli.dispatch(command, values.yes === true);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Claude Code shows a status line command's stdout, never its stderr.
      if (command === "render") {
        process.stdout.write(`ribbon: ${message}\n`);
        return 0;
      }
      process.stderr.write(`ribbon: ${message}\n`);
      return 1;
    }
  }

  private static async dispatch(command: string | undefined, isYes: boolean): Promise<number> {
    switch (command) {
      case "render":
        return RibbonCli.render();
      case "install":
        return RibbonCli.install(isYes);
      case "uninstall":
        return RibbonCli.uninstall();
      case undefined:
        process.stderr.write(`${USAGE}\n`);
        return 1;
      default:
        throw new Error(`unknown command ${JSON.stringify(command)}`);
    }
  }

  private static async render(): Promise<number> {
    const nowSeconds = RibbonCli.resolveNowSeconds(process.env["RIBBON_NOW"]);
    const configDir = RibbonCli.resolveConfigDir(process.env["CLAUDE_CONFIG_DIR"]);
    const layoutPath = join(configDir, LAYOUT_FILE_NAME);
    const payloadText = await text(process.stdin);
    const result = await LayoutStore.load(layoutPath);
    if (result.kind === "invalid") {
      throw new Error(`config ${JSON.stringify(layoutPath)}: ${result.message}`);
    }
    const payload = PayloadParser.parse(payloadText);
    const inputs = await RenderSources.gather(result.layout, payload, payloadText, {
      configDir,
      nowSeconds,
    });
    process.stdout.write(Renderer.render(result.layout, inputs));
    return 0;
  }

  private static async install(isYes: boolean): Promise<number> {
    const configDir = RibbonCli.resolveConfigDir(process.env["CLAUDE_CONFIG_DIR"]);
    const prompter =
      isYes || !RibbonCli.isInteractive(process.env["RIBBON_INSTALL_TTY"])
        ? undefined
        : new CliPrompter(process.stdin, process.stdout);
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

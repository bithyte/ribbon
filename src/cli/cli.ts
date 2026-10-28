#!/usr/bin/env node
import { homedir } from "node:os";
import { join } from "node:path";
import { text } from "node:stream/consumers";
import { parseArgs } from "node:util";
import { LAYOUT_FILE_NAME, LayoutStore } from "../layout/index.ts";
import { PayloadParser, Renderer } from "../render/index.ts";
import { RenderSources } from "../sources/index.ts";
import {
  CLAUDE_DIRECTORY_NAME,
  CLI_OPTIONS,
  HELP_TEXT,
  MS_PER_SECOND,
  UNIX_TIMESTAMP_PATTERN,
  USAGE,
} from "./constants.ts";

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
      return await RibbonCli.dispatch(command);
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

  private static async dispatch(command: string | undefined): Promise<number> {
    switch (command) {
      case "render":
        return RibbonCli.render();
      case "install":
      case "uninstall":
        throw new Error("not implemented");
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

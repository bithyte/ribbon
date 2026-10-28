import { join } from "node:path";
import { DEFAULT_LAYOUT, LAYOUT_FILE_NAME, LayoutParser } from "../layout/index.ts";
import {
  BACKUP_SUFFIX,
  BYTE_ORDER_MARK,
  MISSING_FILE,
  RIBBON_COMMAND,
  SETTINGS_FILE_NAME,
} from "./constants.ts";
import { InstallPlanner } from "./planner.ts";
import { JsonFileStore } from "./store.ts";
import type {
  InstallOptions,
  InstallResult,
  JsonObject,
  LayoutFile,
  UninstallResult,
} from "./types.ts";

/** Wires ribbon into, and out of, `<configDir>/settings.json`. Nothing is written until every read and check passed. */
export class Installer {
  private readonly settingsPath: string;
  private readonly layoutPath: string;

  private constructor(configDir: string) {
    this.settingsPath = join(configDir, SETTINGS_FILE_NAME);
    this.layoutPath = join(configDir, LAYOUT_FILE_NAME);
  }

  /** Points `statusLine` at ribbon, creating `ribbon.json` if missing. Throws on corrupt files, I/O, or a throwing `confirm`. */
  public static async install(options: InstallOptions): Promise<InstallResult> {
    return new Installer(options.configDir).install(options.confirm);
  }

  /** Removes `statusLine` only while it runs ribbon. Never touches `ribbon.json`. Throws on corrupt settings or I/O. */
  public static async uninstall(configDir: string): Promise<UninstallResult> {
    return new Installer(configDir).uninstall();
  }

  private async install(confirm: InstallOptions["confirm"]): Promise<InstallResult> {
    const settings = await this.readSettings();
    const layoutFile = await this.readLayout();
    const decision = InstallPlanner.decideInstall(settings);
    if (decision.kind === "alreadyInstalled") {
      return {
        kind: "alreadyInstalled",
        lines: [`ribbon is already installed in ${this.settingsPath}`],
      };
    }
    if (decision.kind === "replace") {
      const isReplaced = await confirm(
        `statusLine in ${this.settingsPath} is ${JSON.stringify(decision.previous)}\nreplace it with ${JSON.stringify(RIBBON_COMMAND)}? [y/N] `,
      );
      if (!isReplaced) {
        return { kind: "declined", lines: [`left ${this.settingsPath} unchanged`] };
      }
    }
    const baseLayout = layoutFile.kind === "found" ? layoutFile.layout : DEFAULT_LAYOUT;
    const keptCommand =
      decision.kind === "replace"
        ? await this.resolveKeptCommand(decision.previousCommand, baseLayout, confirm)
        : undefined;
    const lines: string[] = [];
    if (layoutFile.kind === "missing" || keptCommand !== undefined) {
      await JsonFileStore.write(
        this.layoutPath,
        keptCommand === undefined ? baseLayout : InstallPlanner.withRunRow(baseLayout, keptCommand),
      );
    }
    if (layoutFile.kind === "missing") {
      lines.push(`created ${this.layoutPath}`);
    }
    if (keptCommand !== undefined) {
      lines.push(`added ${JSON.stringify(keptCommand)} as a run segment in ${this.layoutPath}`);
    }
    if (decision.kind === "replace") {
      await JsonFileStore.backup(this.settingsPath);
      lines.push(`backed up ${this.settingsPath} to ${this.settingsPath}${BACKUP_SUFFIX}`);
    }
    await JsonFileStore.write(this.settingsPath, InstallPlanner.withStatusLine(settings));
    lines.push(`installed ribbon in ${this.settingsPath}`);
    return { kind: "installed", lines };
  }

  private async resolveKeptCommand(
    previousCommand: string | undefined,
    layout: JsonObject,
    confirm: InstallOptions["confirm"],
  ): Promise<string | undefined> {
    if (previousCommand === undefined || InstallPlanner.hasRunSegment(layout, previousCommand)) {
      return undefined;
    }
    const isKept = await confirm(
      `keep ${JSON.stringify(previousCommand)} as a run segment in ${this.layoutPath}? [y/N] `,
    );
    return isKept ? previousCommand : undefined;
  }

  private async uninstall(): Promise<UninstallResult> {
    const settings = await this.readSettings();
    const decision = InstallPlanner.decideUninstall(settings);
    switch (decision.kind) {
      case "notInstalled":
        return { kind: "notInstalled", lines: [`ribbon is not installed in ${this.settingsPath}`] };
      case "foreign":
        return {
          kind: "foreign",
          lines: [
            decision.command === undefined
              ? `statusLine in ${this.settingsPath} is not ribbon; left unchanged`
              : `statusLine in ${this.settingsPath} runs ${JSON.stringify(decision.command)}, not ribbon; left unchanged`,
          ],
        };
      case "remove":
        await JsonFileStore.write(this.settingsPath, InstallPlanner.withoutStatusLine(settings));
        return { kind: "removed", lines: [`removed ribbon from ${this.settingsPath}`] };
    }
  }

  private async readSettings(): Promise<JsonObject> {
    const file = await JsonFileStore.read(this.settingsPath);
    if (file.kind === "missing") {
      return {};
    }
    const context = `settings ${JSON.stringify(this.settingsPath)}`;
    const value = Installer.parseJson(file.text, `${context} is not valid json`);
    if (!Installer.isJsonObject(value)) {
      throw new Error(`${context} is not a json object`);
    }
    return value;
  }

  private async readLayout(): Promise<LayoutFile> {
    const file = await JsonFileStore.read(this.layoutPath);
    if (file.kind === "missing") {
      return MISSING_FILE;
    }
    const context = `config ${JSON.stringify(this.layoutPath)}`;
    const value = Installer.parseJson(file.text, `${context}: not valid json`);
    const result = LayoutParser.validate(value);
    if (result.kind === "invalid") {
      throw new Error(`${context}: ${result.message}`);
    }
    // Kept raw, not the parsed layout, so appending a row doesn't drop the user's extra keys;
    // validate only passes plain objects.
    return { kind: "found", layout: value as JsonObject };
  }

  private static parseJson(text: string, context: string): unknown {
    try {
      return JSON.parse(
        text.startsWith(BYTE_ORDER_MARK) ? text.slice(BYTE_ORDER_MARK.length) : text,
      );
    } catch (error) {
      throw new Error(`${context}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private static isJsonObject(value: unknown): value is JsonObject {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
}

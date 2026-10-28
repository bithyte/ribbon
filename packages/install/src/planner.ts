import {
  ALREADY_INSTALLED,
  NOT_INSTALLED,
  REFRESH_INTERVAL_SECONDS,
  REMOVE,
  RIBBON_COMMAND,
  RIBBON_RENDER_COMMAND_PATTERN,
  STATUS_LINE,
  STATUS_LINE_KEY,
  STATUS_LINE_TYPE,
  UPDATE,
} from "./constants.ts";
import type { InstallDecision, JsonObject, UninstallDecision } from "./types.ts";

/** Pure decisions and edits on parsed settings and layout objects. Never throws. */
export class InstallPlanner {
  private constructor() {}

  /** `update` with no `statusLine`, `alreadyInstalled` when it's ribbon's exact value, else `replace`. Never throws. */
  public static decideInstall(settings: JsonObject): InstallDecision {
    if (!Object.hasOwn(settings, STATUS_LINE_KEY)) {
      return UPDATE;
    }
    const statusLine = settings[STATUS_LINE_KEY];
    if (!InstallPlanner.isRibbonStatusLine(statusLine)) {
      return {
        kind: "replace",
        previous: statusLine,
        previousCommand: InstallPlanner.findKeepableCommand(statusLine),
      };
    }
    return statusLine["type"] === STATUS_LINE_TYPE &&
      statusLine["refreshInterval"] === REFRESH_INTERVAL_SECONDS
      ? ALREADY_INSTALLED
      : UPDATE;
  }

  /** `remove` when `statusLine` runs ribbon, whatever its other fields. Never throws. */
  public static decideUninstall(settings: JsonObject): UninstallDecision {
    if (!Object.hasOwn(settings, STATUS_LINE_KEY)) {
      return NOT_INSTALLED;
    }
    const statusLine = settings[STATUS_LINE_KEY];
    if (InstallPlanner.isRibbonStatusLine(statusLine)) {
      return REMOVE;
    }
    return { kind: "foreign", command: InstallPlanner.findCommand(statusLine) };
  }

  /** `settings` with `statusLine` set to ribbon's value; every other key kept. Never throws. */
  public static withStatusLine(settings: JsonObject): JsonObject {
    return { ...settings, [STATUS_LINE_KEY]: STATUS_LINE };
  }

  /** `settings` without `statusLine`; every other key kept. Never throws. */
  public static withoutStatusLine(settings: JsonObject): JsonObject {
    return Object.fromEntries(Object.entries(settings).filter(([key]) => key !== STATUS_LINE_KEY));
  }

  /** Whether any row of `layout` holds a `run` segment with exactly `command`. Never throws. */
  public static hasRunSegment(layout: JsonObject, command: string): boolean {
    return InstallPlanner.toRows(layout).some(
      (row) =>
        Array.isArray(row) &&
        row.some(
          (segment: unknown) =>
            InstallPlanner.isJsonObject(segment) &&
            segment["type"] === "run" &&
            segment["command"] === command,
        ),
    );
  }

  /** `layout` with a new last row holding only a `run` segment for `command`. Never throws. */
  public static withRunRow(layout: JsonObject, command: string): JsonObject {
    return { ...layout, rows: [...InstallPlanner.toRows(layout), [{ type: "run", command }]] };
  }

  private static isRibbonStatusLine(value: unknown): value is JsonObject {
    return InstallPlanner.findCommand(value)?.trim() === RIBBON_COMMAND;
  }

  // A blank command can't become a valid run segment, and one that runs ribbon render
  // would make every render spawn another, so neither is offered for keeping.
  private static findKeepableCommand(statusLine: unknown): string | undefined {
    const command = InstallPlanner.findCommand(statusLine);
    if (
      command === undefined ||
      command.trim() === "" ||
      RIBBON_RENDER_COMMAND_PATTERN.test(command)
    ) {
      return undefined;
    }
    return command;
  }

  private static findCommand(statusLine: unknown): string | undefined {
    if (!InstallPlanner.isJsonObject(statusLine)) {
      return undefined;
    }
    const command = statusLine["command"];
    return typeof command === "string" ? command : undefined;
  }

  private static toRows(layout: JsonObject): readonly unknown[] {
    const rows = layout["rows"];
    return Array.isArray(rows) ? rows : [];
  }

  private static isJsonObject(value: unknown): value is JsonObject {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
}

import { DEFAULT_MODEL, NULL_TEXT } from "./constants.ts";
import type { Payload, PlainObject } from "./types.ts";

/** Parses the status line payload. Never throws; invalid JSON or a non-object parses as `{}`. */
export class PayloadParser {
  private constructor() {}

  /** Never throws. */
  public static parse(text: string): Payload {
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      // Claude Code may send nothing or garbage; render as for an empty payload, like jq on "{}".
      value = {};
    }
    const root = PayloadParser.isPlainObject(value) ? value : {};
    const rawModel = PayloadParser.findValue(root, ["model", "display_name"]);
    return {
      model: typeof rawModel === "string" ? rawModel : DEFAULT_MODEL,
      effort: PayloadParser.toText(PayloadParser.findValue(root, ["effort", "level"])),
      cwd:
        PayloadParser.toText(PayloadParser.findValue(root, ["workspace", "current_dir"])) ??
        PayloadParser.toText(root["cwd"]),
      repoName: PayloadParser.toText(PayloadParser.findValue(root, ["workspace", "repo", "name"])),
      sessionId: PayloadParser.toText(root["session_id"]),
      contextUsedPercent: PayloadParser.toNumber(
        PayloadParser.findValue(root, ["context_window", "used_percentage"]),
      ),
      contextTokens:
        PayloadParser.toCount(
          PayloadParser.findValue(root, ["context_window", "total_input_tokens"]),
        ) +
        PayloadParser.toCount(
          PayloadParser.findValue(root, ["context_window", "total_output_tokens"]),
        ),
      fiveHourPercent: PayloadParser.toNumber(
        PayloadParser.findValue(root, ["rate_limits", "five_hour", "used_percentage"]),
      ),
      fiveHourResetsAt: PayloadParser.toNumber(
        PayloadParser.findValue(root, ["rate_limits", "five_hour", "resets_at"]),
      ),
      sevenDayPercent: PayloadParser.toNumber(
        PayloadParser.findValue(root, ["rate_limits", "seven_day", "used_percentage"]),
      ),
      sevenDayResetsAt: PayloadParser.toNumber(
        PayloadParser.findValue(root, ["rate_limits", "seven_day", "resets_at"]),
      ),
      costUsd: PayloadParser.toNumber(PayloadParser.findValue(root, ["cost", "total_cost_usd"])),
    };
  }

  private static findValue(root: PlainObject, keys: readonly string[]): unknown {
    let current: unknown = root;
    for (const key of keys) {
      if (!PayloadParser.isPlainObject(current)) {
        return undefined;
      }
      current = current[key];
    }
    return current;
  }

  private static toText(value: unknown): string | undefined {
    return typeof value === "string" && value !== "" && value !== NULL_TEXT ? value : undefined;
  }

  // Mirrors bash: jq `//` drops null and false, segments drop "" and "null", and
  // `printf '%.0f'` turns any other non-numeric text into 0.
  private static toNumber(value: unknown): number | undefined {
    if (
      value === undefined ||
      value === null ||
      value === false ||
      value === "" ||
      value === NULL_TEXT
    ) {
      return undefined;
    }
    if (typeof value === "number") {
      return value;
    }
    const parsed = typeof value === "string" ? Number(value) : Number.NaN;
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private static toCount(value: unknown): number {
    return typeof value === "number" ? value : 0;
  }

  private static isPlainObject(value: unknown): value is PlainObject {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
}

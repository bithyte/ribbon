import { BUILTIN_SEGMENT_TYPES } from "./constants.ts";
import type { BuiltinSegmentType, LayoutParseResult, PlainObject, Segment } from "./types.ts";

type SegmentOutcome =
  | { readonly kind: "parsed"; readonly segment: Segment }
  | { readonly kind: "invalid"; readonly message: string };

/** Parses and validates layout files. Never throws; unknown keys are dropped. */
export class LayoutParser {
  private constructor() {}

  public static parse(text: string): LayoutParseResult {
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return { kind: "invalid", message: `not valid json: ${reason}` };
    }
    return LayoutParser.validate(value);
  }

  public static validate(value: unknown): LayoutParseResult {
    if (!LayoutParser.isPlainObject(value) || !Array.isArray(value["rows"])) {
      return { kind: "invalid", message: '"rows" must be an array of rows' };
    }
    const rows: (readonly Segment[])[] = [];
    for (const [rowIndex, rawRow] of (value["rows"] as readonly unknown[]).entries()) {
      if (!Array.isArray(rawRow)) {
        return { kind: "invalid", message: `rows[${rowIndex}] must be an array of segments` };
      }
      const row: Segment[] = [];
      for (const [segmentIndex, rawSegment] of (rawRow as readonly unknown[]).entries()) {
        const outcome = LayoutParser.parseSegment(rawSegment, `rows[${rowIndex}][${segmentIndex}]`);
        if (outcome.kind === "invalid") {
          return outcome;
        }
        row.push(outcome.segment);
      }
      rows.push(row);
    }
    return { kind: "parsed", layout: { rows } };
  }

  private static parseSegment(rawSegment: unknown, location: string): SegmentOutcome {
    if (!LayoutParser.isPlainObject(rawSegment) || typeof rawSegment["type"] !== "string") {
      return { kind: "invalid", message: `${location} must be an object with a "type"` };
    }
    const type = rawSegment["type"];
    if (type === "run") {
      const command = rawSegment["command"];
      if (typeof command !== "string" || command === "") {
        return { kind: "invalid", message: `${location} is a "run" segment without a "command"` };
      }
      return { kind: "parsed", segment: { type, command } };
    }
    if (!LayoutParser.isBuiltinType(type)) {
      return {
        kind: "invalid",
        message: `${location} has unknown segment type ${JSON.stringify(type)}`,
      };
    }
    return { kind: "parsed", segment: { type } };
  }

  private static isPlainObject(value: unknown): value is PlainObject {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  private static isBuiltinType(value: string): value is BuiltinSegmentType {
    return (BUILTIN_SEGMENT_TYPES as readonly string[]).includes(value);
  }
}

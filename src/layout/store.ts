import { readFile } from "node:fs/promises";
import { DEFAULT_LAYOUT } from "./constants.ts";
import { LayoutParser } from "./parser.ts";
import type { LayoutParseResult } from "./types.ts";

/** Loads layout files. A missing file yields the default layout; other read errors throw. */
export class LayoutStore {
  private constructor() {}

  public static async load(path: string): Promise<LayoutParseResult> {
    let text: string;
    try {
      text = await readFile(path, "utf8");
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return { kind: "parsed", layout: DEFAULT_LAYOUT };
      }
      throw error;
    }
    return LayoutParser.parse(text);
  }
}

import type { BuiltinSegmentType, Layout } from "./types.ts";

export const LAYOUT_FILE_NAME = "ribbon.json";

export const BUILTIN_SEGMENT_TYPES: readonly BuiltinSegmentType[] = [
  "title",
  "git",
  "emotion",
  "model",
  "effort",
  "context",
  "fiveHour",
  "sevenDay",
  "cost",
  "email",
];

/** Matches the order of the original bash status line. */
export const DEFAULT_LAYOUT: Layout = {
  rows: [
    [{ type: "title" }, { type: "git" }],
    [
      { type: "emotion" },
      { type: "model" },
      { type: "effort" },
      { type: "context" },
      { type: "fiveHour" },
      { type: "sevenDay" },
      { type: "cost" },
    ],
  ],
};

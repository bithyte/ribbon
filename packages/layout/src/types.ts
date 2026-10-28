/** Segment types ribbon renders itself. */
export type BuiltinSegmentType =
  | "title"
  | "git"
  | "emotion"
  | "model"
  | "effort"
  | "context"
  | "fiveHour"
  | "sevenDay"
  | "cost"
  | "email";

/** Segment rendered by ribbon. */
export type BuiltinSegment = { readonly type: BuiltinSegmentType };

/** Segment whose text is the output of a shell command. */
export type RunSegment = { readonly type: "run"; readonly command: string };

/** Discriminant is `type` (not `kind`) because it mirrors the layout file format. */
export type Segment = BuiltinSegment | RunSegment;

/** Rows of segments, rendered one line per row. */
export type Layout = { readonly rows: readonly (readonly Segment[])[] };

/** Outcome of parsing a layout; bad input is data, never a throw. */
export type LayoutParseResult =
  | { readonly kind: "parsed"; readonly layout: Layout }
  | { readonly kind: "invalid"; readonly message: string };

type PlainObject = Readonly<Record<string, unknown>>;

export type { PlainObject };

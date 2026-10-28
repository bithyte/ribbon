export const RESET = "\x1b[0m";
export const DIM = "\x1b[2m";
export const CYAN = "\x1b[36m";
export const MAGENTA = "\x1b[35m";
export const GREEN = "\x1b[32m";
export const YELLOW = "\x1b[33m";
export const ORANGE = "\x1b[38;5;208m";
export const RED = "\x1b[31m";
export const BRIGHT_BLUE = "\x1b[94m";
export const TEAL = "\x1b[38;5;43m";
export const WHITE = "\x1b[37m";
export const BOLD_RED = "\x1b[1;31m";
export const BOLD_MAGENTA = "\x1b[1;35m";

/** Joins segments within a row. */
export const SEPARATOR = `${DIM} | ${RESET}`;

export const BAR_WIDTH = 10;
export const SEVEN_DAY_BAR_WIDTH = 14;
export const PERCENT_WARN = 50;
export const PERCENT_CRITICAL = 80;
export const CONTEXT_PERCENT_WARN = 20;
export const CONTEXT_PERCENT_ORANGE = 40;
export const CONTEXT_PERCENT_CRITICAL = 60;
/** Points above or below the even-spend pace that still count as on pace. */
export const PACE_TOLERANCE = 5;
export const EMOTION_MAX_AGE_SECONDS = 600;
export const FIVE_HOUR_WINDOW_SECONDS = 18_000;
export const SEVEN_DAY_WINDOW_SECONDS = 604_800;
export const HOUR_SECONDS = 3_600;
export const DAY_SECONDS = 86_400;
export const PERCENT_SCALE = 100;
/** Over-pace colors differ so the two windows stay distinguishable side by side. */
export const FIVE_HOUR_AHEAD_COLOR = RED;
export const SEVEN_DAY_AHEAD_COLOR = ORANGE;
/** Labels when no reset time is known; otherwise the countdown plus the unit. */
export const FIVE_HOUR_LABEL = "5h";
export const SEVEN_DAY_LABEL = "7d";
export const HOUR_UNIT = "h";
export const DAY_UNIT = "d";

export const FILLED_GLYPH = "█";
export const EMPTY_GLYPH = "░";
/** Pace tick when usage is at or ahead of the even-spend pace. */
export const AHEAD_TICK_GLYPH = "▮";
export const BEHIND_TICK_GLYPH = "▯";
/** One glyph per eighth of the percentage scale, lowest first. */
export const GAUGE_GLYPHS = "▁▂▃▄▅▆▇█";
/** Glyphs for one, two, and three quarters of a countdown unit. */
export const QUARTER_GLYPHS = "¼½¾";
export const QUARTERS_PER_UNIT = 4;
/** Countdown once the reset has arrived; any time left rounds up to at least a quarter. */
export const RESET_ARRIVED_TEXT = "<1";

export const DEFAULT_MODEL = "Claude";
/** Text the bash segments treat as missing, since jq prints a JSON null as `null`. */
export const NULL_TEXT = "null";

export const TOKENS_PER_MILLION = 1_000_000;
export const TOKENS_PER_THOUSAND = 1_000;

/** Digits after the rounding position of an exact tie: a 5 then only zeros. */
export const TIE_REST_PATTERN = /^50*$/;
export const TRAILING_ZERO_DECIMAL_PATTERN = /\.0$/;

/** Checked in order against the lowercased model name; the first contained family wins. */
export const MODEL_COLORS_BY_FAMILY: ReadonlyMap<string, string> = new Map([
  ["opus", BRIGHT_BLUE],
  ["sonnet", CYAN],
  ["haiku", WHITE],
  ["fable", MAGENTA],
]);
export const DEFAULT_MODEL_COLOR = CYAN;

export const EFFORT_COLORS_BY_LEVEL: ReadonlyMap<string, string> = new Map([
  ["low", GREEN],
  ["medium", YELLOW],
  ["high", TEAL],
  ["xhigh", BOLD_RED],
  ["max", BOLD_MAGENTA],
]);
export const DEFAULT_EFFORT_COLOR = CYAN;

/** Emotion that renders as an uppercase warning instead of its name. */
export const DESPERATE_EMOTION = "desperate";
export const DESPERATE_TEXT = "DESPERATE";

/** Names missing here render without color. */
export const EMOTION_COLORS_BY_NAME: ReadonlyMap<string, string> = new Map([
  ["curious", CYAN],
  ["focused", WHITE],
  ["satisfied", GREEN],
  ["cautious", YELLOW],
  ["enthusiastic", MAGENTA],
  ["contemplative", BRIGHT_BLUE],
  ["confident", GREEN],
  ["uncertain", YELLOW],
  ["determined", WHITE],
  ["amused", MAGENTA],
  ["concerned", RED],
  ["relieved", GREEN],
  ["calm", TEAL],
  ["unknown", DIM],
]);

export const GIT_BRANCH_HEAD_PREFIX = "# branch.head ";
export const GIT_BRANCH_OID_PREFIX = "# branch.oid ";
export const GIT_DETACHED_HEAD = "(detached)";
export const GIT_DETACHED_LABEL = "detached@";
export const GIT_SHORT_OID_LENGTH = 7;
/** Status field character meaning no change on that side. */
export const GIT_UNCHANGED_FLAG = ".";
export const GIT_CLEAN_MARK = "✓";
export const GIT_DIRTY_MARK = "✗";

import {
  AHEAD_TICK_GLYPH,
  BEHIND_TICK_GLYPH,
  CONTEXT_PERCENT_CRITICAL,
  CONTEXT_PERCENT_ORANGE,
  CONTEXT_PERCENT_WARN,
  DEFAULT_EFFORT_COLOR,
  DEFAULT_MODEL_COLOR,
  EFFORT_COLORS_BY_LEVEL,
  EMPTY_GLYPH,
  FILLED_GLYPH,
  GAUGE_GLYPHS,
  GREEN,
  MODEL_COLORS_BY_FAMILY,
  ORANGE,
  PACE_TOLERANCE,
  PERCENT_CRITICAL,
  PERCENT_SCALE,
  PERCENT_WARN,
  QUARTER_GLYPHS,
  QUARTERS_PER_UNIT,
  RED,
  RESET_ARRIVED_TEXT,
  TIE_REST_PATTERN,
  TOKENS_PER_MILLION,
  TOKENS_PER_THOUSAND,
  TRAILING_ZERO_DECIMAL_PATTERN,
  YELLOW,
} from "./constants.ts";

/** Number formatting matching C `printf`, and the color scales segments share. */
export class RenderFormat {
  private constructor() {}

  /** Like `printf "%.<digits>f"`: exact ties round to even, unlike `toFixed`. */
  public static formatFixed(value: number, digits: number): string {
    const rounded = value.toFixed(digits);
    // toFixed(100) is the exact decimal expansion for the magnitudes segments format.
    // oxlint-disable-next-line number-arg-out-of-range -- the spec allows up to 100 since ES2018.
    const exact = value.toFixed(100);
    const point = exact.indexOf(".");
    const rest = exact.slice(point + 1 + digits);
    if (!TIE_REST_PATTERN.test(rest)) {
      return rounded;
    }
    const truncated = exact.slice(0, digits === 0 ? point : point + 1 + digits);
    const lastDigit = Number(truncated.at(-1));
    return lastDigit % 2 === 0 ? truncated : rounded;
  }

  /** Like `printf '%.0f'`. */
  public static roundToInteger(value: number): number {
    return Number(RenderFormat.formatFixed(value, 0));
  }

  /** `999`, `84k`, `2.5M`: one decimal, dropped when it is zero. */
  public static formatTokens(count: number): string {
    if (count >= TOKENS_PER_MILLION) {
      return `${RenderFormat.formatScaled(count / TOKENS_PER_MILLION)}M`;
    }
    if (count >= TOKENS_PER_THOUSAND) {
      return `${RenderFormat.formatScaled(count / TOKENS_PER_THOUSAND)}k`;
    }
    return String(Math.trunc(count));
  }

  public static modelColor(model: string): string {
    const name = model.toLowerCase();
    for (const [family, color] of MODEL_COLORS_BY_FAMILY) {
      if (name.includes(family)) {
        return color;
      }
    }
    return DEFAULT_MODEL_COLOR;
  }

  public static effortColor(level: string): string {
    return EFFORT_COLORS_BY_LEVEL.get(level) ?? DEFAULT_EFFORT_COLOR;
  }

  /** Four-band context scale, on the rounded percentage. */
  public static contextColor(percent: number): string {
    if (percent < CONTEXT_PERCENT_WARN) {
      return GREEN;
    }
    if (percent < CONTEXT_PERCENT_ORANGE) {
      return YELLOW;
    }
    if (percent < CONTEXT_PERCENT_CRITICAL) {
      return ORANGE;
    }
    return RED;
  }

  /** Three-band usage severity scale for rate limits without a known pace. */
  public static percentColor(percent: number): string {
    if (percent < PERCENT_WARN) {
      return GREEN;
    }
    if (percent < PERCENT_CRITICAL) {
      return YELLOW;
    }
    return RED;
  }

  /** Green below the even-spend pace, yellow within the tolerance, `aheadColor` above. */
  public static paceColor(percent: number, elapsedPercent: number, aheadColor: string): string {
    const difference = percent - elapsedPercent;
    if (difference < -PACE_TOLERANCE) {
      return GREEN;
    }
    if (difference > PACE_TOLERANCE) {
      return aheadColor;
    }
    return YELLOW;
  }

  /** `width` cells, filled in proportion to `percent` clamped to 0 through 100. */
  public static formatBar(percent: number, width: number): string {
    const filledCount = Math.min(Math.max(Math.trunc((percent * width) / PERCENT_SCALE), 0), width);
    return `${FILLED_GLYPH.repeat(filledCount)}${EMPTY_GLYPH.repeat(width - filledCount)}`;
  }

  /** Usage bar with a tick at the even-spend pace, overriding that cell; solid when at or ahead. */
  public static formatPaceBar(percent: number, elapsedPercent: number, width: number): string {
    const filledCount = Math.trunc((percent * width) / PERCENT_SCALE);
    const tickIndex = Math.min(
      Math.max(Math.trunc((elapsedPercent * width) / PERCENT_SCALE), 0),
      width - 1,
    );
    const tickGlyph = percent >= elapsedPercent ? AHEAD_TICK_GLYPH : BEHIND_TICK_GLYPH;
    return Array.from({ length: width }, (_value, index) => {
      if (index === tickIndex) {
        return tickGlyph;
      }
      return index < filledCount ? FILLED_GLYPH : EMPTY_GLYPH;
    }).join("");
  }

  /** One of eight block glyphs for `percent` clamped to 0 through 100. */
  public static formatGauge(percent: number): string {
    const index = Math.min(
      Math.max(Math.trunc((percent * GAUGE_GLYPHS.length) / PERCENT_SCALE), 0),
      GAUGE_GLYPHS.length - 1,
    );
    return GAUGE_GLYPHS.charAt(index);
  }

  /** Time left in `unitSeconds` units, rounded up to a quarter: `¼`, `2½`, `3`; `<1` at zero. */
  public static formatCountdown(remainingSeconds: number, unitSeconds: number): string {
    const clampedSeconds = Math.max(remainingSeconds, 0);
    if (clampedSeconds === 0) {
      return RESET_ARRIVED_TEXT;
    }
    const quarterSeconds = Math.trunc(unitSeconds / QUARTERS_PER_UNIT);
    const quarterCount = Math.trunc((clampedSeconds + quarterSeconds - 1) / quarterSeconds);
    const wholeCount = Math.trunc(quarterCount / QUARTERS_PER_UNIT);
    const fractionIndex = quarterCount % QUARTERS_PER_UNIT;
    if (fractionIndex === 0) {
      return String(wholeCount);
    }
    const fraction = QUARTER_GLYPHS.charAt(fractionIndex - 1);
    return wholeCount === 0 ? fraction : `${wholeCount}${fraction}`;
  }

  private static formatScaled(value: number): string {
    return RenderFormat.formatFixed(value, 1).replace(TRAILING_ZERO_DECIMAL_PATTERN, "");
  }
}

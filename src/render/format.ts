import {
  CONTEXT_PERCENT_CRITICAL,
  CONTEXT_PERCENT_ORANGE,
  CONTEXT_PERCENT_WARN,
  DEFAULT_EFFORT_COLOR,
  DEFAULT_MODEL_COLOR,
  EFFORT_COLORS_BY_LEVEL,
  GREEN,
  MODEL_COLORS_BY_FAMILY,
  ORANGE,
  RED,
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

  private static formatScaled(value: number): string {
    return RenderFormat.formatFixed(value, 1).replace(TRAILING_ZERO_DECIMAL_PATTERN, "");
  }
}

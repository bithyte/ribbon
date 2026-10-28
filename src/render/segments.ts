import type { Segment } from "../layout/index.ts";
import {
  BAR_WIDTH,
  BOLD_RED,
  CYAN,
  DAY_SECONDS,
  DAY_UNIT,
  DESPERATE_EMOTION,
  DESPERATE_TEXT,
  DIM,
  EMOTION_COLORS_BY_NAME,
  EMOTION_MAX_AGE_SECONDS,
  FIVE_HOUR_AHEAD_COLOR,
  FIVE_HOUR_LABEL,
  FIVE_HOUR_WINDOW_SECONDS,
  GREEN,
  HOUR_SECONDS,
  HOUR_UNIT,
  PACE_TOLERANCE,
  PERCENT_SCALE,
  RESET,
  SEVEN_DAY_AHEAD_COLOR,
  SEVEN_DAY_BAR_WIDTH,
  SEVEN_DAY_LABEL,
  SEVEN_DAY_WINDOW_SECONDS,
} from "./constants.ts";
import { GitStatus } from "./git.ts";
import { RenderFormat } from "./format.ts";
import type { RenderInputs } from "./types.ts";

/** Renders one segment's text, or `undefined` when it drops out of its row. Never throws. */
export class RenderSegments {
  private constructor() {}

  public static render(segment: Segment, inputs: RenderInputs): string | undefined {
    switch (segment.type) {
      case "title":
        return RenderSegments.renderTitle(inputs);
      case "model":
        return RenderSegments.renderModel(inputs);
      case "effort":
        return RenderSegments.renderEffort(inputs);
      case "context":
        return RenderSegments.renderContext(inputs);
      case "cost":
        return RenderSegments.renderCost(inputs);
      case "email":
        return RenderSegments.renderEmail(inputs);
      case "emotion":
        return RenderSegments.renderEmotion(inputs);
      case "run":
        return RenderSegments.renderRun(segment.command, inputs);
      case "fiveHour":
        return RenderSegments.renderFiveHour(inputs);
      case "sevenDay":
        return RenderSegments.renderSevenDay(inputs);
      case "git":
        return RenderSegments.renderGit(inputs);
    }
  }

  private static renderTitle(inputs: RenderInputs): string | undefined {
    const { repoName, cwd } = inputs.payload;
    const title = repoName ?? cwd?.slice(cwd.lastIndexOf("/") + 1);
    if (title === undefined || title === "") {
      return undefined;
    }
    return `${DIM}${title}${RESET}`;
  }

  private static renderModel(inputs: RenderInputs): string {
    const { model } = inputs.payload;
    return `${RenderFormat.modelColor(model)}${model}${RESET}`;
  }

  private static renderEffort(inputs: RenderInputs): string | undefined {
    const { effort } = inputs.payload;
    if (effort === undefined) {
      return undefined;
    }
    return `${RenderFormat.effortColor(effort)}${effort}${RESET}`;
  }

  private static renderContext(inputs: RenderInputs): string | undefined {
    const { contextUsedPercent, contextTokens } = inputs.payload;
    if (contextUsedPercent === undefined) {
      return undefined;
    }
    const color = RenderFormat.contextColor(RenderFormat.roundToInteger(contextUsedPercent));
    return `${color}${RenderFormat.formatTokens(contextTokens)}${RESET}`;
  }

  private static renderCost(inputs: RenderInputs): string | undefined {
    const { costUsd } = inputs.payload;
    if (costUsd === undefined) {
      return undefined;
    }
    return `${GREEN}$${RenderFormat.formatFixed(costUsd, 2)}${RESET}`;
  }

  private static renderEmail(inputs: RenderInputs): string | undefined {
    if (inputs.email === undefined) {
      return undefined;
    }
    return `${CYAN}${inputs.email}${RESET}`;
  }

  private static renderEmotion(inputs: RenderInputs): string | undefined {
    const { emotion, nowSeconds } = inputs;
    if (
      emotion === undefined ||
      emotion.name === "" ||
      nowSeconds - emotion.modifiedSeconds > EMOTION_MAX_AGE_SECONDS
    ) {
      return undefined;
    }
    if (emotion.name === DESPERATE_EMOTION) {
      return `${BOLD_RED}${DESPERATE_TEXT}${RESET}`;
    }
    const color = EMOTION_COLORS_BY_NAME.get(emotion.name);
    return color === undefined ? emotion.name : `${color}${emotion.name}${RESET}`;
  }

  private static renderFiveHour(inputs: RenderInputs): string | undefined {
    const { fiveHourPercent, fiveHourResetsAt } = inputs.payload;
    if (fiveHourPercent === undefined) {
      return undefined;
    }
    const percent = RenderFormat.roundToInteger(fiveHourPercent);
    if (fiveHourResetsAt === undefined) {
      return RenderSegments.formatUsage(
        FIVE_HOUR_LABEL,
        RenderFormat.percentColor(percent),
        RenderFormat.formatBar(percent, BAR_WIDTH),
      );
    }
    const remainingSeconds = fiveHourResetsAt - inputs.nowSeconds;
    const elapsedPercent = RenderSegments.toElapsedPercent(
      remainingSeconds,
      FIVE_HOUR_WINDOW_SECONDS,
    );
    return RenderSegments.formatUsage(
      `${RenderFormat.formatCountdown(remainingSeconds, HOUR_SECONDS)}${HOUR_UNIT}`,
      RenderFormat.paceColor(percent, elapsedPercent, FIVE_HOUR_AHEAD_COLOR),
      RenderFormat.formatPaceBar(percent, elapsedPercent, BAR_WIDTH),
    );
  }

  // A compact gauge by default; expands into a pace bar only when over pace, the one case
  // worth flagging.
  private static renderSevenDay(inputs: RenderInputs): string | undefined {
    const { sevenDayPercent, sevenDayResetsAt } = inputs.payload;
    if (sevenDayPercent === undefined) {
      return undefined;
    }
    const percent = RenderFormat.roundToInteger(sevenDayPercent);
    if (sevenDayResetsAt === undefined) {
      return RenderSegments.formatUsage(
        SEVEN_DAY_LABEL,
        RenderFormat.percentColor(percent),
        RenderFormat.formatGauge(percent),
      );
    }
    const remainingSeconds = sevenDayResetsAt - inputs.nowSeconds;
    const elapsedPercent = RenderSegments.toElapsedPercent(
      remainingSeconds,
      SEVEN_DAY_WINDOW_SECONDS,
    );
    const usage =
      percent - elapsedPercent > PACE_TOLERANCE
        ? RenderFormat.formatPaceBar(percent, elapsedPercent, SEVEN_DAY_BAR_WIDTH)
        : RenderFormat.formatGauge(percent);
    return RenderSegments.formatUsage(
      `${RenderFormat.formatCountdown(remainingSeconds, DAY_SECONDS)}${DAY_UNIT}`,
      RenderFormat.paceColor(percent, elapsedPercent, SEVEN_DAY_AHEAD_COLOR),
      usage,
    );
  }

  private static renderGit(inputs: RenderInputs): string | undefined {
    return inputs.gitStatus === undefined ? undefined : GitStatus.describe(inputs.gitStatus);
  }

  private static renderRun(command: string, inputs: RenderInputs): string | undefined {
    return inputs.runOutputsByCommand.get(command);
  }

  private static formatUsage(label: string, color: string, usage: string): string {
    return `${DIM}${label}${RESET} ${color}${usage}${RESET}`;
  }

  /** Share of the window already elapsed, from 0 through 100. */
  private static toElapsedPercent(remainingSeconds: number, windowSeconds: number): number {
    const clampedSeconds = Math.min(Math.max(remainingSeconds, 0), windowSeconds);
    return Math.trunc(((windowSeconds - clampedSeconds) * PERCENT_SCALE) / windowSeconds);
  }
}

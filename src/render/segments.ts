import type { Segment } from "../layout/index.ts";
import {
  BOLD_RED,
  CYAN,
  DESPERATE_EMOTION,
  DESPERATE_TEXT,
  DIM,
  EMOTION_COLORS_BY_NAME,
  EMOTION_MAX_AGE_SECONDS,
  GREEN,
  RESET,
} from "./constants.ts";
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
      case "git":
      case "fiveHour":
      case "sevenDay":
        // Not ported yet.
        return undefined;
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

  private static renderRun(command: string, inputs: RenderInputs): string | undefined {
    const output = inputs.runOutputsByCommand.get(command);
    return output === "" ? undefined : output;
  }
}

import type { Layout, Segment } from "@ribbon/layout";
import type { EmotionCache, Payload, RenderInputs } from "@ribbon/render";
import { DEFAULT_SOURCE_OPTIONS } from "./constants.ts";
import { SourceFiles } from "./files.ts";
import { CommandRunner } from "./runner.ts";
import type { SourceContext, SourceOptions } from "./types.ts";

/** Gathers the external inputs a layout needs, concurrently. Never throws; every failure is `undefined`. */
export class RenderSources {
  private constructor() {}

  /** Reads only the sources the layout's segments use; each distinct `run` command runs once, none when runs are disabled. Never throws. */
  public static async gather(
    layout: Layout,
    payload: Payload,
    payloadText: string,
    context: SourceContext,
    options: SourceOptions = {},
  ): Promise<RenderInputs> {
    const runTimeoutMs = options.runTimeoutMs ?? DEFAULT_SOURCE_OPTIONS.runTimeoutMs;
    const gitTimeoutMs = options.gitTimeoutMs ?? DEFAULT_SOURCE_OPTIONS.gitTimeoutMs;
    const isRunDisabled = options.isRunDisabled ?? DEFAULT_SOURCE_OPTIONS.isRunDisabled;
    const segments = layout.rows.flat();
    const commands = isRunDisabled
      ? []
      : [...new Set(segments.flatMap((segment) => RenderSources.toCommands(segment)))];
    const [gitStatus, emotion, email, runOutputs] = await Promise.all([
      RenderSources.gatherGitStatus(segments, payload.cwd, gitTimeoutMs),
      RenderSources.gatherEmotion(segments, context.configDir, payload.sessionId),
      RenderSources.gatherEmail(segments, context.configDir),
      Promise.all(commands.map((command) => CommandRunner.run(command, payloadText, runTimeoutMs))),
    ]);
    return {
      payload,
      nowSeconds: context.nowSeconds,
      gitStatus,
      emotion,
      email,
      runOutputsByCommand: new Map(
        commands.map((command, index) => [command, runOutputs[index]] as const),
      ),
    };
  }

  private static async gatherGitStatus(
    segments: readonly Segment[],
    cwd: string | undefined,
    timeoutMs: number,
  ): Promise<string | undefined> {
    if (cwd === undefined || !RenderSources.hasSegment(segments, "git")) {
      return undefined;
    }
    return SourceFiles.readGitStatus(cwd, timeoutMs);
  }

  private static async gatherEmotion(
    segments: readonly Segment[],
    configDir: string,
    sessionId: string | undefined,
  ): Promise<EmotionCache | undefined> {
    if (!RenderSources.hasSegment(segments, "emotion")) {
      return undefined;
    }
    return SourceFiles.readEmotion(configDir, sessionId);
  }

  private static async gatherEmail(
    segments: readonly Segment[],
    configDir: string,
  ): Promise<string | undefined> {
    if (!RenderSources.hasSegment(segments, "email")) {
      return undefined;
    }
    return SourceFiles.readEmail(configDir);
  }

  private static hasSegment(segments: readonly Segment[], type: Segment["type"]): boolean {
    return segments.some((segment) => segment.type === type);
  }

  private static toCommands(segment: Segment): readonly string[] {
    return segment.type === "run" ? [segment.command] : [];
  }
}

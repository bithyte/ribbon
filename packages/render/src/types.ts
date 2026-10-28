/** Fields of the Claude Code status line payload that segments read. Missing values are `undefined`. */
export type Payload = {
  /** `.model.display_name` when it is a string (even `""`), else `"Claude"`. */
  readonly model: string;
  /** `.effort.level`. */
  readonly effort: string | undefined;
  /** `.workspace.current_dir`, else `.cwd`. */
  readonly cwd: string | undefined;
  /** `.workspace.repo.name`. */
  readonly repoName: string | undefined;
  /** `.session_id`. */
  readonly sessionId: string | undefined;
  /** `.context_window.used_percentage`. */
  readonly contextUsedPercent: number | undefined;
  /** Input plus output tokens of the context window, each `0` when not a number. */
  readonly contextTokens: number;
  /** `.rate_limits.five_hour.used_percentage`. */
  readonly fiveHourPercent: number | undefined;
  /** `.rate_limits.five_hour.resets_at`, unix seconds. */
  readonly fiveHourResetsAt: number | undefined;
  /** `.rate_limits.seven_day.used_percentage`. */
  readonly sevenDayPercent: number | undefined;
  /** `.rate_limits.seven_day.resets_at`, unix seconds. */
  readonly sevenDayResetsAt: number | undefined;
  /** `.cost.total_cost_usd`. */
  readonly costUsd: number | undefined;
};

/** Emotion read from the emotion-statusline cache file. */
export type EmotionCache = {
  /** Emotion label as written by the plugin. */
  readonly name: string;
  /** Cache file modification time, unix seconds. */
  readonly modifiedSeconds: number;
};

/** Everything a render reads; gathered by the edges so rendering stays pure. */
export type RenderInputs = {
  readonly payload: Payload;
  /** Clock read once per render, unix seconds. */
  readonly nowSeconds: number;
  /** Raw `git status --porcelain=v2 --branch` stdout, `undefined` outside a repository. */
  readonly gitStatus: string | undefined;
  readonly emotion: EmotionCache | undefined;
  /** Logged-in account email. */
  readonly email: string | undefined;
  /** Output of each `run` segment command, never `""`; `undefined` when it failed or printed nothing. */
  readonly runOutputsByCommand: ReadonlyMap<string, string | undefined>;
};

type PlainObject = Readonly<Record<string, unknown>>;

export type { PlainObject };

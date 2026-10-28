import type { SourceOptions } from "./types.ts";

export const DEFAULT_SOURCE_OPTIONS = {
  runTimeoutMs: 500,
  gitTimeoutMs: 2_000,
  isRunDisabled: false,
} as const satisfies Required<SourceOptions>;

export const SHELL_PATH = "/bin/sh";

/** Set in every `run` child's environment; a ribbon render that sees it skips its own `run` segments. */
export const NESTED_RENDER_VARIABLE = "RIBBON_RENDER";

export const NESTED_RENDER_VALUE = "1";

/** Bytes of a `run` command's first line kept; everything after is drained unread. */
export const RUN_OUTPUT_MAX_BYTES = 65_536;

/** `git status` on a huge worktree can run past execFile's 1 MB default. */
export const GIT_MAX_BUFFER_BYTES = 64 * 1_024 * 1_024;

/** Session ids that are safe inside a cache file name; anything else uses the global cache. */
export const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
export const GIT_COMMAND = "git";
export const GIT_STATUS_ARGUMENTS = [
  "--no-optional-locks",
  "status",
  "--porcelain=v2",
  "--branch",
] as const;
export const ACCOUNT_FILE_NAME = ".claude.json";
export const CACHE_DIRECTORY_NAME = "cache";
export const EMOTION_FILE_NAME = "claude-emotion.json";
export const EMOTION_SESSION_FILE_PREFIX = "claude-emotion-";
export const EMOTION_SESSION_FILE_SUFFIX = ".json";
export const MS_PER_SECOND = 1_000;

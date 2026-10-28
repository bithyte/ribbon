import type { SourceOptions } from "./types.ts";

export const DEFAULT_SOURCE_OPTIONS = {
  runTimeoutMs: 500,
  gitTimeoutMs: 2_000,
} as const satisfies Required<SourceOptions>;

export const SHELL_PATH = "/bin/sh";
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

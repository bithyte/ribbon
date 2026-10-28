import type { ParseArgsOptionsConfig } from "node:util";

export const CLI_OPTIONS = {
  yes: { type: "boolean", short: "y" },
  help: { type: "boolean", short: "h" },
} as const satisfies ParseArgsOptionsConfig;

export const USAGE = "usage: ribbon <render|install|uninstall> [--yes]";

export const HELP_TEXT = [
  USAGE,
  "",
  "commands:",
  "  render      print the status line for the Claude Code payload on stdin",
  "  install     point Claude Code's statusLine at ribbon render",
  "  uninstall   remove ribbon from Claude Code's statusLine",
  "",
  "options:",
  "  -y, --yes   replace an existing statusLine without asking",
  "  -h, --help  print this help",
]
  .map((line) => `${line}\n`)
  .join("");

/** Used when `CLAUDE_CONFIG_DIR` is unset or empty, like bash `${CLAUDE_CONFIG_DIR:-~/.claude}`. */
export const CLAUDE_DIRECTORY_NAME = ".claude";

export const UNIX_TIMESTAMP_PATTERN = /^\d+$/;

export const MS_PER_SECOND = 1_000;

/** An answer of `y` or `yes`, any case, confirms; everything else declines. */
export const YES_ANSWER_PATTERN = /^y(es)?$/i;

/** `RIBBON_INSTALL_TTY` value that forces prompting; `"0"` forbids it. Unset falls back to `stdin.isTTY`. */
export const INSTALL_TTY_ON = "1";

export const INSTALL_TTY_OFF = "0";

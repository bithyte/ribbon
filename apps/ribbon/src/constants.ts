export const PROGRAM_NAME = "ribbon";

export const PROGRAM_DESCRIPTION = "Configurable status line for Claude Code";

export const RENDER_DESCRIPTION = "print the status line for the Claude Code payload on stdin";

export const INSTALL_DESCRIPTION = "point Claude Code's statusLine at ribbon render";

export const UNINSTALL_DESCRIPTION = "remove ribbon from Claude Code's statusLine";

export const YES_DESCRIPTION = "replace an existing statusLine without asking";

/** Commander errors that only mean help was printed; their exit code is the whole outcome. */
export const HELP_ERROR_CODES: ReadonlySet<string> = new Set([
  "commander.help",
  "commander.helpDisplayed",
]);

/** Commander's own `error: ` prefix, swapped for `ribbon: ` like every other error. */
export const COMMANDER_ERROR_PREFIX_PATTERN = /^error: /;

/** Used when `CLAUDE_CONFIG_DIR` is unset or empty, like bash `${CLAUDE_CONFIG_DIR:-~/.claude}`. */
export const CLAUDE_DIRECTORY_NAME = ".claude";

export const UNIX_TIMESTAMP_PATTERN = /^\d+$/;

export const MS_PER_SECOND = 1_000;

/** Line breaks with their surrounding space; render errors collapse them so the status line stays one line. */
export const LINE_BREAK_PATTERN = /\s*\n\s*/g;

/** `RIBBON_INSTALL_TTY` value that forces prompting; `"0"` forbids it. Unset falls back to `stdin.isTTY`. */
export const INSTALL_TTY_ON = "1";

export const INSTALL_TTY_OFF = "0";

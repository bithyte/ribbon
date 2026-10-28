import type { InstallDecision, StoredFile, UninstallDecision } from "./types.ts";

/** The command install writes into `statusLine`, and the one uninstall recognizes. */
export const RIBBON_COMMAND = "ribbon render";

/** A `statusLine` command that already runs ribbon's render, however invoked; kept as a run segment it would recurse. */
export const RIBBON_RENDER_COMMAND_PATTERN = /\bribbon\b.*\brender\b/;

/** Some editors prefix saved JSON with one; `JSON.parse` rejects it. */
export const BYTE_ORDER_MARK = "\uFEFF";

export const REFRESH_INTERVAL_SECONDS = 30;

export const SETTINGS_FILE_NAME = "settings.json";

export const STATUS_LINE_KEY = "statusLine";

export const STATUS_LINE_TYPE = "command";

export const BACKUP_SUFFIX = ".bak";

/** Permission and special bits of `stat().mode`, without the file type. */
export const FILE_MODE_MASK = 0o7777;

/** The installed `statusLine` value, exactly. */
export const STATUS_LINE = {
  type: STATUS_LINE_TYPE,
  command: RIBBON_COMMAND,
  refreshInterval: REFRESH_INTERVAL_SECONDS,
} as const;

export const ALREADY_INSTALLED = { kind: "alreadyInstalled" } as const satisfies InstallDecision;

export const UPDATE = { kind: "update" } as const satisfies InstallDecision;

export const REMOVE = { kind: "remove" } as const satisfies UninstallDecision;

export const NOT_INSTALLED = { kind: "notInstalled" } as const satisfies UninstallDecision;

export const MISSING_FILE = { kind: "missing" } as const satisfies StoredFile;

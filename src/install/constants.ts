import type { InstallDecision, StoredFile, UninstallDecision } from "./types.ts";

/** The command install writes into `statusLine`, and the one uninstall recognizes. */
export const RIBBON_COMMAND = "ribbon render";

export const REFRESH_INTERVAL_SECONDS = 30;

export const SETTINGS_FILE_NAME = "settings.json";

export const STATUS_LINE_KEY = "statusLine";

export const STATUS_LINE_TYPE = "command";

export const BACKUP_SUFFIX = ".bak";

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

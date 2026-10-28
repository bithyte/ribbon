/** Parsed JSON object whose unknown keys are carried through untouched. */
export type JsonObject = { readonly [key: string]: unknown };

/** What install does to the current `statusLine`. */
export type InstallDecision =
  | { readonly kind: "alreadyInstalled" }
  /** No `statusLine`, or ribbon's command with a stale `type` or `refreshInterval`; no prompt needed. */
  | { readonly kind: "update" }
  /** A foreign `statusLine`; `previousCommand` is its `command` when that's a non-blank string. */
  | {
      readonly kind: "replace";
      readonly previous: unknown;
      readonly previousCommand: string | undefined;
    };

/** What uninstall does to the current `statusLine`. */
export type UninstallDecision =
  | { readonly kind: "remove" }
  | { readonly kind: "notInstalled" }
  | { readonly kind: "foreign"; readonly command: string | undefined };

/** Outcome of install; `lines` are what happened, in order, for the user. */
export type InstallResult = {
  readonly kind: "installed" | "alreadyInstalled" | "declined";
  readonly lines: readonly string[];
};

/** Outcome of uninstall; `lines` are what happened, for the user. */
export type UninstallResult = {
  readonly kind: "removed" | "notInstalled" | "foreign";
  readonly lines: readonly string[];
};

/** Install inputs. `confirm` answers a y/N question and may throw to refuse. */
export type InstallOptions = {
  readonly configDir: string;
  readonly confirm: (question: string) => Promise<boolean>;
};

/** A file read that treats a missing file as a normal state. */
export type StoredFile =
  { readonly kind: "missing" } | { readonly kind: "found"; readonly text: string };

type LayoutFile =
  { readonly kind: "missing" } | { readonly kind: "found"; readonly layout: JsonObject };

export type { LayoutFile };

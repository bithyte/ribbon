/** Per-render values the sources read. */
export type SourceContext = {
  /** Claude config directory holding `.claude.json` and `cache/`. */
  readonly configDir: string;
  /** Clock read once per render, unix seconds. */
  readonly nowSeconds: number;
};

/** Limits on the external processes a render waits on. */
export type SourceOptions = {
  /** Per `run` command; the whole process group is killed when it expires. */
  readonly runTimeoutMs?: number;
  readonly gitTimeoutMs?: number;
  /** Skips every `run` segment without running it, so a render nested in a `run` can't recurse. */
  readonly isRunDisabled?: boolean;
};

type PlainObject = Readonly<Record<string, unknown>>;

export type { PlainObject };

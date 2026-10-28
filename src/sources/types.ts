/** Per-render values the sources read. */
export type SourceContext = {
  /** Claude config directory holding `.claude.json` and `cache/`. */
  readonly configDir: string;
  /** Clock read once per render, unix seconds. */
  readonly nowSeconds: number;
};

/** Timeouts for the external processes a render waits on. */
export type SourceOptions = {
  /** Per `run` command; the whole process group is killed when it expires. */
  readonly runTimeoutMs?: number;
  readonly gitTimeoutMs?: number;
};

type PlainObject = Readonly<Record<string, unknown>>;

export type { PlainObject };

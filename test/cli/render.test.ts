import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { DEFAULT_LAYOUT, type Layout } from "../../src/layout/index.ts";

type RibbonResult = {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
};

const CLI_PATH = join(import.meta.dirname, "../../src/cli/cli.ts");
const FIXTURES_DIRECTORY = join(import.meta.dirname, "fixtures");
const GOLDEN_DIRECTORY = join(import.meta.dirname, "golden");
const NOW_SECONDS = 1_750_000_000;
const RESET = "\x1b[0m";
const DIM = "\x1b[2m";
const CYAN = "\x1b[36m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const MAGENTA = "\x1b[35m";
const SEPARATOR = `${DIM} | ${RESET}`;
const DEFAULT_MODEL_LINE = `${CYAN}Claude${RESET}\n`;
const GIT_ENV = {
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_SYSTEM: "/dev/null",
  GIT_AUTHOR_NAME: "test",
  GIT_AUTHOR_EMAIL: "t@t",
  GIT_AUTHOR_DATE: "2026-01-01T00:00:00Z",
  GIT_COMMITTER_NAME: "test",
  GIT_COMMITTER_EMAIL: "t@t",
  GIT_COMMITTER_DATE: "2026-01-01T00:00:00Z",
};
const GOLDEN_NAMES = [
  "full",
  "no-effort",
  "no-rate-limits",
  "no-resets",
  "seven-day-under-pace",
  "seven-day-on-pace",
  "five-hour-ahead",
  "boundary-low",
  "boundary-high",
  "tokens-million",
  "cost-only",
  "empty",
] as const;

async function createHome(t: TestContext): Promise<string> {
  const home = await mkdtemp(join(tmpdir(), "ribbon-cli-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  return home;
}

function runRibbon(
  home: string,
  args: readonly string[],
  options: { readonly stdin?: string; readonly env?: Readonly<Record<string, string>> } = {},
): RibbonResult {
  const result = spawnSync(process.execPath, [CLI_PATH, ...args], {
    input: options.stdin ?? "",
    encoding: "utf8",
    env: {
      PATH: process.env["PATH"],
      HOME: home,
      CLAUDE_CONFIG_DIR: join(home, "claude"),
      RIBBON_NOW: String(NOW_SECONDS),
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_SYSTEM: "/dev/null",
      ...options.env,
    },
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

async function readFixture(name: string): Promise<string> {
  return readFile(join(FIXTURES_DIRECTORY, `${name}.json`), "utf8");
}

async function readGolden(name: string): Promise<string> {
  return readFile(join(GOLDEN_DIRECTORY, `${name}.out`), "utf8");
}

async function writeLayout(home: string, layout: Layout | string): Promise<string> {
  const directory = join(home, "claude");
  const path = join(directory, "ribbon.json");
  await mkdir(directory, { recursive: true });
  await writeFile(path, typeof layout === "string" ? layout : JSON.stringify(layout));
  return path;
}

async function copyConfigFixture(home: string, name: string): Promise<string> {
  const directory = join(home, "claude");
  await cp(join(FIXTURES_DIRECTORY, name), directory, { recursive: true });
  return directory;
}

function git(repo: string, ...args: readonly string[]): string {
  const result = spawnSync("git", ["-C", repo, ...args], {
    encoding: "utf8",
    env: { PATH: process.env["PATH"], ...GIT_ENV },
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

async function createRepo(home: string): Promise<string> {
  const repo = join(home, "proj");
  await mkdir(repo);
  git(repo, "-c", "init.defaultBranch=main", "init", "-q");
  return repo;
}

function renderRepo(home: string, repo: string): RibbonResult {
  return runRibbon(home, ["render"], {
    stdin: JSON.stringify({ workspace: { current_dir: repo } }),
  });
}

function expectRepoLine(branchSegment: string): RibbonResult {
  return {
    status: 0,
    stdout: `${DIM}proj${RESET}${SEPARATOR}${branchSegment}\n${DEFAULT_MODEL_LINE}`,
    stderr: "",
  };
}

for (const name of GOLDEN_NAMES) {
  test(`renders the ${name} fixture byte for byte`, async (t) => {
    const home = await createHome(t);
    const result = runRibbon(home, ["render"], { stdin: await readFixture(name) });
    assert.deepEqual(result, { status: 0, stdout: await readGolden(name), stderr: "" });
  });
}

test("renders the email row when the layout includes it", async (t) => {
  const home = await createHome(t);
  await copyConfigFixture(home, "fake-claude-config");
  await writeLayout(home, { rows: [...DEFAULT_LAYOUT.rows, [{ type: "email" }]] });
  const result = runRibbon(home, ["render"], { stdin: await readFixture("full") });
  assert.deepEqual(result, { status: 0, stdout: await readGolden("email"), stderr: "" });
});

test("renders a fresh emotion cache at the start of row two", async (t) => {
  for (const [fixture, golden] of [
    ["fake-claude-emotion", "emotion"],
    ["fake-claude-emotion-desperate", "emotion-desperate"],
  ] as const) {
    const home = await createHome(t);
    const directory = await copyConfigFixture(home, fixture);
    await utimes(join(directory, "cache", "claude-emotion.json"), NOW_SECONDS, NOW_SECONDS);
    const result = runRibbon(home, ["render"], { stdin: await readFixture("full") });
    assert.deepEqual(result, { status: 0, stdout: await readGolden(golden), stderr: "" });
  }
});

test("renders a clean git repo on row one", async (t) => {
  const home = await createHome(t);
  const repo = await createRepo(home);
  git(repo, "commit", "-q", "--allow-empty", "-m", "init");
  assert.deepEqual(renderRepo(home, repo), expectRepoLine(`${GREEN}main ✓${RESET}`));
});

test("renders a dirty git repo with counts", async (t) => {
  const home = await createHome(t);
  const repo = await createRepo(home);
  await writeFile(join(repo, "tracked.txt"), "b\n");
  git(repo, "add", "tracked.txt");
  git(repo, "commit", "-q", "-m", "init");
  await writeFile(join(repo, "tracked.txt"), "bb\n");
  await writeFile(join(repo, "staged.txt"), "a\n");
  git(repo, "add", "staged.txt");
  await writeFile(join(repo, "untracked.txt"), "c\n");
  assert.deepEqual(
    renderRepo(home, repo),
    expectRepoLine(`${YELLOW}main ✗${RESET} ${GREEN}+1${RESET}${YELLOW}~1${RESET}${DIM}?1${RESET}`),
  );
});

test("renders a detached head", async (t) => {
  const home = await createHome(t);
  const repo = await createRepo(home);
  git(repo, "commit", "-q", "--allow-empty", "-m", "init");
  git(repo, "checkout", "-q", "--detach");
  const sha = git(repo, "rev-parse", "--short=7", "HEAD").trim();
  assert.deepEqual(renderRepo(home, repo), expectRepoLine(`${GREEN}detached@${sha} ✓${RESET}`));
});

test("follows a custom layout order", async (t) => {
  const home = await createHome(t);
  await writeLayout(home, { rows: [[{ type: "cost" }, { type: "model" }]] });
  const result = runRibbon(home, ["render"], { stdin: await readFixture("full") });
  assert.deepEqual(result, {
    status: 0,
    stdout: `${GREEN}$1.23${RESET}${SEPARATOR}${MAGENTA}Fable 5${RESET}\n`,
    stderr: "",
  });
});

test("renders a run segment from the layout", async (t) => {
  const home = await createHome(t);
  await writeLayout(home, { rows: [[{ type: "model" }, { type: "run", command: "printf hi" }]] });
  const result = runRibbon(home, ["render"], { stdin: "{}" });
  assert.deepEqual(result, {
    status: 0,
    stdout: `${CYAN}Claude${RESET}${SEPARATOR}hi\n`,
    stderr: "",
  });
});

test("help prints usage", async (t) => {
  const home = await createHome(t);
  const result = runRibbon(home, ["--help"]);
  assert.equal(result.status, 0);
  assert.ok(result.stdout.startsWith("usage: ribbon"), result.stdout);
  assert.equal(result.stderr, "");
});

test("invalid layout is shown as the status line", async (t) => {
  const home = await createHome(t);
  const path = await writeLayout(home, "{");
  const result = runRibbon(home, ["render"], { stdin: "{}" });
  assert.equal(result.status, 0);
  assert.ok(result.stdout.startsWith(`ribbon: config "${path}": not valid json: `), result.stdout);
  assert.ok(result.stdout.endsWith("\n"), result.stdout);
  assert.equal(result.stderr, "");
});

test("invalid RIBBON_NOW is shown as the status line", async (t) => {
  const home = await createHome(t);
  const result = runRibbon(home, ["render"], { stdin: "{}", env: { RIBBON_NOW: "soon" } });
  assert.deepEqual(result, {
    status: 0,
    stdout: 'ribbon: RIBBON_NOW "soon" is not a unix timestamp\n',
    stderr: "",
  });
});

test("unknown command fails", async (t) => {
  const home = await createHome(t);
  assert.deepEqual(runRibbon(home, ["frobnicate"]), {
    status: 1,
    stdout: "",
    stderr: 'ribbon: unknown command "frobnicate"\n',
  });
});

test("no command prints usage to stderr", async (t) => {
  const home = await createHome(t);
  const result = runRibbon(home, []);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.ok(result.stderr.startsWith("usage: ribbon"), result.stderr);
});

test("empty or invalid stdin renders defaults", async (t) => {
  for (const stdin of ["", "not json"]) {
    const home = await createHome(t);
    assert.deepEqual(runRibbon(home, ["render"], { stdin }), {
      status: 0,
      stdout: DEFAULT_MODEL_LINE,
      stderr: "",
    });
  }
});

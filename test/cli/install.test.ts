import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test, { type TestContext } from "node:test";
import { DEFAULT_LAYOUT } from "../../src/layout/index.ts";

type RibbonResult = {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
};

type InstallPaths = {
  readonly home: string;
  readonly configDir: string;
  readonly settingsPath: string;
  readonly backupPath: string;
  readonly layoutPath: string;
};

const CLI_PATH = join(import.meta.dirname, "../../src/cli/cli.ts");
const STATUS_LINE = { type: "command", command: "ribbon render", refreshInterval: 30 };
const FOREIGN_STATUS_LINE = { type: "command", command: "other-status --x" };
const FOREIGN_RUN_ROW = [{ type: "run", command: "other-status --x" }];
const INTERACTIVE_ENV = { RIBBON_INSTALL_TTY: "1" };
const NON_INTERACTIVE_ENV = { RIBBON_INSTALL_TTY: "0" };

async function createPaths(t: TestContext): Promise<InstallPaths> {
  const home = await mkdtemp(join(tmpdir(), "ribbon-install-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  const configDir = join(home, "claude");
  const settingsPath = join(configDir, "settings.json");
  return {
    home,
    configDir,
    settingsPath,
    backupPath: `${settingsPath}.bak`,
    layoutPath: join(configDir, "ribbon.json"),
  };
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
      ...options.env,
    },
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
  return true;
}

test("fresh install writes settings and the default layout without prompting", async (t) => {
  const paths = await createPaths(t);
  const result = runRibbon(paths.home, ["install"]);
  assert.deepEqual(result, {
    status: 0,
    stdout: `created ${paths.layoutPath}\ninstalled ribbon in ${paths.settingsPath}\n`,
    stderr: "",
  });
  assert.deepEqual(await readJson(paths.settingsPath), { statusLine: STATUS_LINE });
  assert.deepEqual(await readJson(paths.layoutPath), { rows: DEFAULT_LAYOUT.rows });
  assert.equal(await exists(paths.backupPath), false);
});

test("install creates a missing config directory", async (t) => {
  const paths = await createPaths(t);
  assert.equal(await exists(paths.configDir), false);
  const result = runRibbon(paths.home, ["install"]);
  assert.equal(result.status, 0);
  assert.equal((await stat(paths.configDir)).isDirectory(), true);
  assert.deepEqual(await readJson(paths.settingsPath), { statusLine: STATUS_LINE });
});

test("install keeps unrelated settings keys", async (t) => {
  const paths = await createPaths(t);
  const hooks = { Stop: [{ hooks: [{ type: "command", command: "echo done" }] }] };
  await writeJson(paths.settingsPath, { model: "opus", hooks });
  const result = runRibbon(paths.home, ["install"]);
  assert.equal(result.status, 0);
  assert.deepEqual(await readJson(paths.settingsPath), {
    model: "opus",
    hooks,
    statusLine: STATUS_LINE,
  });
});

test("already installed writes nothing", async (t) => {
  const paths = await createPaths(t);
  await writeJson(paths.settingsPath, { statusLine: STATUS_LINE });
  await writeJson(paths.layoutPath, { rows: [[{ type: "model" }]] });
  const settingsBefore = await readFile(paths.settingsPath, "utf8");
  const layoutBefore = await readFile(paths.layoutPath, "utf8");
  const settingsStatBefore = await stat(paths.settingsPath);
  const layoutStatBefore = await stat(paths.layoutPath);
  const result = runRibbon(paths.home, ["install"]);
  assert.deepEqual(result, {
    status: 0,
    stdout: `ribbon is already installed in ${paths.settingsPath}\n`,
    stderr: "",
  });
  assert.equal(await readFile(paths.settingsPath, "utf8"), settingsBefore);
  assert.equal(await readFile(paths.layoutPath, "utf8"), layoutBefore);
  assert.equal((await stat(paths.settingsPath)).mtimeMs, settingsStatBefore.mtimeMs);
  assert.equal((await stat(paths.layoutPath)).mtimeMs, layoutStatBefore.mtimeMs);
  assert.deepEqual((await readdir(paths.configDir)).toSorted(), ["ribbon.json", "settings.json"]);
});

test("ribbon command with a stale refresh interval is updated without prompting", async (t) => {
  const paths = await createPaths(t);
  await writeJson(paths.settingsPath, { statusLine: { ...STATUS_LINE, refreshInterval: 60 } });
  const result = runRibbon(paths.home, ["install"], { env: NON_INTERACTIVE_ENV });
  assert.deepEqual(result, {
    status: 0,
    stdout: `created ${paths.layoutPath}\ninstalled ribbon in ${paths.settingsPath}\n`,
    stderr: "",
  });
  assert.deepEqual(await readJson(paths.settingsPath), { statusLine: STATUS_LINE });
  assert.equal(await exists(paths.backupPath), false);
});

test("foreign status line without a tty or --yes refuses", async (t) => {
  const paths = await createPaths(t);
  await writeJson(paths.settingsPath, { statusLine: FOREIGN_STATUS_LINE });
  const settingsBefore = await readFile(paths.settingsPath, "utf8");
  const result = runRibbon(paths.home, ["install"], { env: NON_INTERACTIVE_ENV });
  assert.deepEqual(result, {
    status: 1,
    stdout: "",
    stderr:
      "ribbon: install needs confirmation to replace the existing statusLine; rerun with --yes\n",
  });
  assert.equal(await readFile(paths.settingsPath, "utf8"), settingsBefore);
  assert.equal(await exists(paths.backupPath), false);
  assert.equal(await exists(paths.layoutPath), false);
});

test("foreign status line declined leaves settings unchanged", async (t) => {
  const paths = await createPaths(t);
  await writeJson(paths.settingsPath, { statusLine: FOREIGN_STATUS_LINE });
  const settingsBefore = await readFile(paths.settingsPath, "utf8");
  const result = runRibbon(paths.home, ["install"], { stdin: "n\n", env: INTERACTIVE_ENV });
  assert.deepEqual(result, {
    status: 1,
    stdout:
      `statusLine in ${paths.settingsPath} is ${JSON.stringify(FOREIGN_STATUS_LINE)}\n` +
      `replace it with "ribbon render"? [y/N] ` +
      `left ${paths.settingsPath} unchanged\n`,
    stderr: "",
  });
  assert.equal(await readFile(paths.settingsPath, "utf8"), settingsBefore);
  assert.equal(await exists(paths.backupPath), false);
  assert.equal(await exists(paths.layoutPath), false);
});

test("foreign status line with no answer before eof counts as declined", async (t) => {
  const paths = await createPaths(t);
  await writeJson(paths.settingsPath, { statusLine: FOREIGN_STATUS_LINE });
  const settingsBefore = await readFile(paths.settingsPath, "utf8");
  const result = runRibbon(paths.home, ["install"], { stdin: "", env: INTERACTIVE_ENV });
  assert.equal(result.status, 1);
  assert.ok(result.stdout.endsWith(`left ${paths.settingsPath} unchanged\n`), result.stdout);
  assert.equal(await readFile(paths.settingsPath, "utf8"), settingsBefore);
  assert.deepEqual((await readdir(paths.configDir)).toSorted(), ["settings.json"]);
});

test("foreign status line accepted and kept as a run segment", async (t) => {
  const paths = await createPaths(t);
  await writeJson(paths.settingsPath, { statusLine: FOREIGN_STATUS_LINE });
  const settingsBefore = await readFile(paths.settingsPath, "utf8");
  const result = runRibbon(paths.home, ["install"], { stdin: "y\ny\n", env: INTERACTIVE_ENV });
  assert.deepEqual(result, {
    status: 0,
    stdout:
      `statusLine in ${paths.settingsPath} is ${JSON.stringify(FOREIGN_STATUS_LINE)}\n` +
      `replace it with "ribbon render"? [y/N] ` +
      `keep "other-status --x" as a run segment in ${paths.layoutPath}? [y/N] ` +
      `created ${paths.layoutPath}\n` +
      `added "other-status --x" as a run segment in ${paths.layoutPath}\n` +
      `backed up ${paths.settingsPath} to ${paths.backupPath}\n` +
      `installed ribbon in ${paths.settingsPath}\n`,
    stderr: "",
  });
  assert.deepEqual(await readJson(paths.layoutPath), {
    rows: [...DEFAULT_LAYOUT.rows, FOREIGN_RUN_ROW],
  });
  assert.equal(await readFile(paths.backupPath, "utf8"), settingsBefore);
  assert.deepEqual(await readJson(paths.settingsPath), { statusLine: STATUS_LINE });
});

test("foreign status line accepted without keeping it", async (t) => {
  const paths = await createPaths(t);
  await writeJson(paths.settingsPath, { statusLine: FOREIGN_STATUS_LINE });
  const settingsBefore = await readFile(paths.settingsPath, "utf8");
  const result = runRibbon(paths.home, ["install"], { stdin: "y\nn\n", env: INTERACTIVE_ENV });
  assert.equal(result.status, 0);
  assert.equal(result.stdout.includes("added"), false);
  assert.deepEqual(await readJson(paths.layoutPath), { rows: DEFAULT_LAYOUT.rows });
  assert.equal(await readFile(paths.backupPath, "utf8"), settingsBefore);
  assert.deepEqual(await readJson(paths.settingsPath), { statusLine: STATUS_LINE });
});

test("--yes replaces and keeps the foreign command", async (t) => {
  const paths = await createPaths(t);
  await writeJson(paths.settingsPath, { statusLine: FOREIGN_STATUS_LINE });
  const settingsBefore = await readFile(paths.settingsPath, "utf8");
  const result = runRibbon(paths.home, ["install", "--yes"], { env: NON_INTERACTIVE_ENV });
  assert.deepEqual(result, {
    status: 0,
    stdout:
      `created ${paths.layoutPath}\n` +
      `added "other-status --x" as a run segment in ${paths.layoutPath}\n` +
      `backed up ${paths.settingsPath} to ${paths.backupPath}\n` +
      `installed ribbon in ${paths.settingsPath}\n`,
    stderr: "",
  });
  assert.deepEqual(await readJson(paths.layoutPath), {
    rows: [...DEFAULT_LAYOUT.rows, FOREIGN_RUN_ROW],
  });
  assert.equal(await readFile(paths.backupPath, "utf8"), settingsBefore);
  assert.deepEqual(await readJson(paths.settingsPath), { statusLine: STATUS_LINE });
});

test("keeping a command appends to an existing layout", async (t) => {
  const paths = await createPaths(t);
  await writeJson(paths.settingsPath, { statusLine: FOREIGN_STATUS_LINE });
  await writeJson(paths.layoutPath, { rows: [[{ type: "model" }]] });
  const result = runRibbon(paths.home, ["install", "--yes"]);
  assert.deepEqual(result, {
    status: 0,
    stdout:
      `added "other-status --x" as a run segment in ${paths.layoutPath}\n` +
      `backed up ${paths.settingsPath} to ${paths.backupPath}\n` +
      `installed ribbon in ${paths.settingsPath}\n`,
    stderr: "",
  });
  assert.deepEqual(await readJson(paths.layoutPath), {
    rows: [[{ type: "model" }], FOREIGN_RUN_ROW],
  });
});

test("a command already in the layout is not asked about or added twice", async (t) => {
  const paths = await createPaths(t);
  await writeJson(paths.settingsPath, { statusLine: FOREIGN_STATUS_LINE });
  await writeJson(paths.layoutPath, { rows: [[{ type: "model" }], FOREIGN_RUN_ROW] });
  const layoutBefore = await readFile(paths.layoutPath, "utf8");
  const result = runRibbon(paths.home, ["install"], { stdin: "y\n", env: INTERACTIVE_ENV });
  assert.deepEqual(result, {
    status: 0,
    stdout:
      `statusLine in ${paths.settingsPath} is ${JSON.stringify(FOREIGN_STATUS_LINE)}\n` +
      `replace it with "ribbon render"? [y/N] ` +
      `backed up ${paths.settingsPath} to ${paths.backupPath}\n` +
      `installed ribbon in ${paths.settingsPath}\n`,
    stderr: "",
  });
  assert.equal(await readFile(paths.layoutPath, "utf8"), layoutBefore);
  assert.deepEqual(await readJson(paths.settingsPath), { statusLine: STATUS_LINE });
});

test("invalid settings json is refused before writing anything", async (t) => {
  const cases = [
    { text: "{", problem: "is not valid json: " },
    { text: "[]", problem: "is not a json object" },
    { text: "42", problem: "is not a json object" },
  ];
  for (const { text, problem } of cases) {
    for (const command of ["install", "uninstall"]) {
      const paths = await createPaths(t);
      await mkdir(paths.configDir, { recursive: true });
      await writeFile(paths.settingsPath, text);
      const result = runRibbon(paths.home, [command, "--yes"]);
      assert.equal(result.status, 1, `${command} ${text}`);
      assert.equal(result.stdout, "");
      assert.ok(
        result.stderr.startsWith(
          `ribbon: settings ${JSON.stringify(paths.settingsPath)} ${problem}`,
        ),
        result.stderr,
      );
      assert.equal(await readFile(paths.settingsPath, "utf8"), text);
      assert.deepEqual((await readdir(paths.configDir)).toSorted(), ["settings.json"]);
    }
  }
});

test("invalid layout is refused before writing anything", async (t) => {
  const paths = await createPaths(t);
  await writeJson(paths.settingsPath, { statusLine: FOREIGN_STATUS_LINE });
  await mkdir(paths.configDir, { recursive: true });
  const layoutText = '{"rows":[[{"type":"foo"}]]}';
  await writeFile(paths.layoutPath, layoutText);
  const settingsBefore = await readFile(paths.settingsPath, "utf8");
  const result = runRibbon(paths.home, ["install", "--yes"]);
  assert.deepEqual(result, {
    status: 1,
    stdout: "",
    stderr: `ribbon: config ${JSON.stringify(paths.layoutPath)}: rows[0][0] has unknown segment type "foo"\n`,
  });
  assert.equal(await readFile(paths.settingsPath, "utf8"), settingsBefore);
  assert.equal(await readFile(paths.layoutPath, "utf8"), layoutText);
  assert.deepEqual((await readdir(paths.configDir)).toSorted(), ["ribbon.json", "settings.json"]);
});

test("layout that is not json is refused before writing anything", async (t) => {
  const paths = await createPaths(t);
  await mkdir(paths.configDir, { recursive: true });
  await writeFile(paths.layoutPath, "{");
  const result = runRibbon(paths.home, ["install"]);
  assert.equal(result.status, 1);
  assert.ok(
    result.stderr.startsWith(
      `ribbon: config ${JSON.stringify(paths.layoutPath)}: not valid json: `,
    ),
    result.stderr,
  );
  assert.deepEqual((await readdir(paths.configDir)).toSorted(), ["ribbon.json"]);
});

test("uninstall removes the ribbon status line only", async (t) => {
  const paths = await createPaths(t);
  await writeJson(paths.settingsPath, { model: "opus", statusLine: STATUS_LINE });
  await writeJson(paths.layoutPath, { rows: [[{ type: "model" }]] });
  const layoutBefore = await readFile(paths.layoutPath, "utf8");
  const result = runRibbon(paths.home, ["uninstall"]);
  assert.deepEqual(result, {
    status: 0,
    stdout: `removed ribbon from ${paths.settingsPath}\n`,
    stderr: "",
  });
  assert.deepEqual(await readJson(paths.settingsPath), { model: "opus" });
  assert.equal(await readFile(paths.layoutPath, "utf8"), layoutBefore);
});

test("uninstall leaves a foreign status line alone", async (t) => {
  const paths = await createPaths(t);
  await writeJson(paths.settingsPath, { statusLine: FOREIGN_STATUS_LINE });
  const settingsBefore = await readFile(paths.settingsPath, "utf8");
  const result = runRibbon(paths.home, ["uninstall"]);
  assert.deepEqual(result, {
    status: 0,
    stdout: `statusLine in ${paths.settingsPath} runs "other-status --x", not ribbon; left unchanged\n`,
    stderr: "",
  });
  assert.equal(await readFile(paths.settingsPath, "utf8"), settingsBefore);
});

test("uninstall without settings reports not installed", async (t) => {
  const paths = await createPaths(t);
  const result = runRibbon(paths.home, ["uninstall"]);
  assert.deepEqual(result, {
    status: 0,
    stdout: `ribbon is not installed in ${paths.settingsPath}\n`,
    stderr: "",
  });
  assert.equal(await exists(paths.configDir), false);
});

test("settings are written atomically with no stray temp files", async (t) => {
  const paths = await createPaths(t);
  await writeJson(paths.settingsPath, { model: "opus" });
  const inodeBefore = (await stat(paths.settingsPath)).ino;
  const result = runRibbon(paths.home, ["install"]);
  assert.equal(result.status, 0);
  assert.deepEqual((await readdir(paths.configDir)).toSorted(), ["ribbon.json", "settings.json"]);
  assert.notEqual((await stat(paths.settingsPath)).ino, inodeBefore);
});

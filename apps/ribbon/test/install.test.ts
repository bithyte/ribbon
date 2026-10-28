import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  readlink,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { onTestFinished, test } from "vite-plus/test";
import { DEFAULT_LAYOUT } from "@ribbon/layout";

type RibbonResult = {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
};

/** A run whose clack prompts are reduced to their submitted answers; `stdout` is what follows them. */
type PromptedResult = RibbonResult & {
  readonly answers: readonly string[];
};

type InstallPaths = {
  readonly home: string;
  readonly configDir: string;
  readonly settingsPath: string;
  readonly backupPath: string;
  readonly layoutPath: string;
};

const CLI_PATH = join(import.meta.dirname, "../src/cli.ts");
const STATUS_LINE = { type: "command", command: "ribbon render", refreshInterval: 30 };
const FOREIGN_STATUS_LINE = { type: "command", command: "other-status --x" };
const FOREIGN_RUN_ROW = [{ type: "run", command: "other-status --x" }];
const INTERACTIVE_ENV = { RIBBON_INSTALL_TTY: "1" };
const NON_INTERACTIVE_ENV = { RIBBON_INSTALL_TTY: "0" };
const RIBBON_RENDER_COMMANDS = [
  "npx -y @bithyte/ribbon render",
  "/abs/path/ribbon render --x",
  "ribbon  render",
];
const BYTE_ORDER_MARK = "\uFEFF";
// A submitted clack confirm; the question above it wraps at 80 columns, so it isn't compared.
const PROMPT_ANSWER_PATTERN = /^│ {2}(Yes|No)\n/gm;

async function createPaths(): Promise<InstallPaths> {
  const home = await mkdtemp(join(tmpdir(), "ribbon-install-"));
  onTestFinished(() => rm(home, { recursive: true, force: true }));
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

function runPrompted(home: string, stdin: string): PromptedResult {
  const result = runRibbon(home, ["install"], { stdin, env: INTERACTIVE_ENV });
  const matches = [...result.stdout.matchAll(PROMPT_ANSWER_PATTERN)];
  const last = matches.at(-1);
  return {
    ...result,
    stdout: last === undefined ? result.stdout : result.stdout.slice(last.index + last[0].length),
    answers: matches.map((match) => match[1] ?? ""),
  };
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

test("fresh install writes settings and the default layout without prompting", async () => {
  const paths = await createPaths();
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

test("install creates a missing config directory", async () => {
  const paths = await createPaths();
  assert.equal(await exists(paths.configDir), false);
  const result = runRibbon(paths.home, ["install"]);
  assert.equal(result.status, 0);
  assert.equal((await stat(paths.configDir)).isDirectory(), true);
  assert.deepEqual(await readJson(paths.settingsPath), { statusLine: STATUS_LINE });
});

test("install keeps unrelated settings keys", async () => {
  const paths = await createPaths();
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

test("already installed writes nothing", async () => {
  const paths = await createPaths();
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

test("ribbon command with a stale refresh interval is updated without prompting", async () => {
  const paths = await createPaths();
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

test("foreign status line without a tty or --yes refuses", async () => {
  const paths = await createPaths();
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

test("foreign status line declined leaves settings unchanged", async () => {
  const paths = await createPaths();
  await writeJson(paths.settingsPath, { statusLine: FOREIGN_STATUS_LINE });
  const settingsBefore = await readFile(paths.settingsPath, "utf8");
  assert.deepEqual(runPrompted(paths.home, "n\n"), {
    status: 1,
    answers: ["No"],
    stdout: `left ${paths.settingsPath} unchanged\n`,
    stderr: "",
  });
  assert.equal(await readFile(paths.settingsPath, "utf8"), settingsBefore);
  assert.equal(await exists(paths.backupPath), false);
  assert.equal(await exists(paths.layoutPath), false);
});

test("foreign status line with no answer before eof counts as declined", async () => {
  const paths = await createPaths();
  await writeJson(paths.settingsPath, { statusLine: FOREIGN_STATUS_LINE });
  const settingsBefore = await readFile(paths.settingsPath, "utf8");
  assert.deepEqual(runPrompted(paths.home, ""), {
    status: 1,
    answers: [],
    stdout: `left ${paths.settingsPath} unchanged\n`,
    stderr: "",
  });
  assert.equal(await readFile(paths.settingsPath, "utf8"), settingsBefore);
  assert.deepEqual((await readdir(paths.configDir)).toSorted(), ["settings.json"]);
});

test("foreign status line accepted and kept as a run segment", async () => {
  const paths = await createPaths();
  await writeJson(paths.settingsPath, { statusLine: FOREIGN_STATUS_LINE });
  const settingsBefore = await readFile(paths.settingsPath, "utf8");
  assert.deepEqual(runPrompted(paths.home, "y\ny\n"), {
    status: 0,
    answers: ["Yes", "Yes"],
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

test("foreign status line accepted without keeping it", async () => {
  const paths = await createPaths();
  await writeJson(paths.settingsPath, { statusLine: FOREIGN_STATUS_LINE });
  const settingsBefore = await readFile(paths.settingsPath, "utf8");
  assert.deepEqual(runPrompted(paths.home, "y\nn\n"), {
    status: 0,
    answers: ["Yes", "No"],
    stdout:
      `created ${paths.layoutPath}\n` +
      `backed up ${paths.settingsPath} to ${paths.backupPath}\n` +
      `installed ribbon in ${paths.settingsPath}\n`,
    stderr: "",
  });
  assert.deepEqual(await readJson(paths.layoutPath), { rows: DEFAULT_LAYOUT.rows });
  assert.equal(await readFile(paths.backupPath, "utf8"), settingsBefore);
  assert.deepEqual(await readJson(paths.settingsPath), { statusLine: STATUS_LINE });
});

test("--yes replaces and keeps the foreign command", async () => {
  const paths = await createPaths();
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

test("keeping a command appends to an existing layout", async () => {
  const paths = await createPaths();
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

test("a command already in the layout is not asked about or added twice", async () => {
  const paths = await createPaths();
  await writeJson(paths.settingsPath, { statusLine: FOREIGN_STATUS_LINE });
  await writeJson(paths.layoutPath, { rows: [[{ type: "model" }], FOREIGN_RUN_ROW] });
  const layoutBefore = await readFile(paths.layoutPath, "utf8");
  assert.deepEqual(runPrompted(paths.home, "y\n"), {
    status: 0,
    answers: ["Yes"],
    stdout:
      `backed up ${paths.settingsPath} to ${paths.backupPath}\n` +
      `installed ribbon in ${paths.settingsPath}\n`,
    stderr: "",
  });
  assert.equal(await readFile(paths.layoutPath, "utf8"), layoutBefore);
  assert.deepEqual(await readJson(paths.settingsPath), { statusLine: STATUS_LINE });
});

test("--yes replaces a command that runs ribbon render without keeping it", async () => {
  for (const command of RIBBON_RENDER_COMMANDS) {
    const paths = await createPaths();
    await writeJson(paths.settingsPath, { statusLine: { type: "command", command } });
    const settingsBefore = await readFile(paths.settingsPath, "utf8");
    const result = runRibbon(paths.home, ["install", "--yes"], { env: NON_INTERACTIVE_ENV });
    assert.deepEqual(result, {
      status: 0,
      stdout:
        `created ${paths.layoutPath}\n` +
        `backed up ${paths.settingsPath} to ${paths.backupPath}\n` +
        `installed ribbon in ${paths.settingsPath}\n`,
      stderr: "",
    });
    assert.deepEqual(await readJson(paths.layoutPath), { rows: DEFAULT_LAYOUT.rows });
    assert.equal(await readFile(paths.backupPath, "utf8"), settingsBefore);
    assert.deepEqual(await readJson(paths.settingsPath), { statusLine: STATUS_LINE });
  }
});

test("a command that runs ribbon render is not offered as a run segment", async () => {
  const paths = await createPaths();
  const statusLine = { type: "command", command: "npx -y @bithyte/ribbon render" };
  await writeJson(paths.settingsPath, { statusLine });
  assert.deepEqual(runPrompted(paths.home, "y\ny\n"), {
    status: 0,
    answers: ["Yes"],
    stdout:
      `created ${paths.layoutPath}\n` +
      `backed up ${paths.settingsPath} to ${paths.backupPath}\n` +
      `installed ribbon in ${paths.settingsPath}\n`,
    stderr: "",
  });
  assert.deepEqual(await readJson(paths.layoutPath), { rows: DEFAULT_LAYOUT.rows });
});

test("settings with a byte order mark are read", async () => {
  const paths = await createPaths();
  await mkdir(paths.configDir, { recursive: true });
  await writeFile(paths.settingsPath, `${BYTE_ORDER_MARK}${JSON.stringify({ model: "opus" })}`);
  const result = runRibbon(paths.home, ["install"]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(await readJson(paths.settingsPath), { model: "opus", statusLine: STATUS_LINE });
});

test("invalid settings json is refused before writing anything", async () => {
  const cases = [
    { text: "{", problem: "is not valid json: " },
    { text: "[]", problem: "is not a json object" },
    { text: "42", problem: "is not a json object" },
  ];
  for (const { text, problem } of cases) {
    for (const args of [["install", "--yes"], ["uninstall"]]) {
      const command = args.join(" ");
      const paths = await createPaths();
      await mkdir(paths.configDir, { recursive: true });
      await writeFile(paths.settingsPath, text);
      const result = runRibbon(paths.home, args);
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

test("invalid layout is refused before writing anything", async () => {
  const paths = await createPaths();
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

test("layout that is not json is refused before writing anything", async () => {
  const paths = await createPaths();
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

test("uninstall removes the ribbon status line only", async () => {
  const paths = await createPaths();
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

test("uninstall leaves a foreign status line alone", async () => {
  const paths = await createPaths();
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

test("uninstall leaves a status line without a command alone", async () => {
  const paths = await createPaths();
  await writeJson(paths.settingsPath, { statusLine: { type: "command" } });
  const settingsBefore = await readFile(paths.settingsPath, "utf8");
  const result = runRibbon(paths.home, ["uninstall"]);
  assert.deepEqual(result, {
    status: 0,
    stdout: `statusLine in ${paths.settingsPath} is not ribbon; left unchanged\n`,
    stderr: "",
  });
  assert.equal(await readFile(paths.settingsPath, "utf8"), settingsBefore);
});

test("uninstall without settings reports not installed", async () => {
  const paths = await createPaths();
  const result = runRibbon(paths.home, ["uninstall"]);
  assert.deepEqual(result, {
    status: 0,
    stdout: `ribbon is not installed in ${paths.settingsPath}\n`,
    stderr: "",
  });
  assert.equal(await exists(paths.configDir), false);
});

test("settings are written atomically with no stray temp files", async () => {
  const paths = await createPaths();
  await writeJson(paths.settingsPath, { model: "opus" });
  const inodeBefore = (await stat(paths.settingsPath)).ino;
  const result = runRibbon(paths.home, ["install"]);
  assert.equal(result.status, 0);
  assert.deepEqual((await readdir(paths.configDir)).toSorted(), ["ribbon.json", "settings.json"]);
  assert.notEqual((await stat(paths.settingsPath)).ino, inodeBefore);
});

test("install keeps the settings file mode", async () => {
  const paths = await createPaths();
  await writeJson(paths.settingsPath, { model: "opus" });
  await chmod(paths.settingsPath, 0o600);
  const result = runRibbon(paths.home, ["install"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal((await stat(paths.settingsPath)).mode & 0o777, 0o600);
  assert.deepEqual(await readJson(paths.settingsPath), { model: "opus", statusLine: STATUS_LINE });
});

test("a symlinked settings file stays a symlink and its target is updated", async () => {
  const paths = await createPaths();
  const targetDirectory = join(paths.home, "dotfiles");
  const targetPath = join(targetDirectory, "settings.json");
  await writeJson(targetPath, { model: "opus" });
  await chmod(targetPath, 0o640);
  await mkdir(paths.configDir, { recursive: true });
  await symlink(targetPath, paths.settingsPath);
  const expectedSettingsByCommand = new Map([
    ["install", { model: "opus", statusLine: STATUS_LINE }],
    ["uninstall", { model: "opus" }],
  ]);
  for (const [command, expectedSettings] of expectedSettingsByCommand) {
    const result = runRibbon(paths.home, [command]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal((await lstat(paths.settingsPath)).isSymbolicLink(), true);
    assert.equal(await readlink(paths.settingsPath), targetPath);
    assert.equal((await stat(targetPath)).mode & 0o777, 0o640);
    assert.deepEqual((await readdir(targetDirectory)).toSorted(), ["settings.json"]);
    assert.deepEqual((await readdir(paths.configDir)).toSorted(), ["ribbon.json", "settings.json"]);
    assert.deepEqual(await readJson(targetPath), expectedSettings);
  }
});

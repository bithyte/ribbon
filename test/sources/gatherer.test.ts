import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import type { Layout, Segment } from "../../src/layout/index.ts";
import { PayloadParser, type Payload, type RenderInputs } from "../../src/render/index.ts";
import { RenderSources, type SourceOptions } from "../../src/sources/index.ts";

const NOW = 1_750_000_000;
const EMOTION_MODIFIED_SECONDS = 1_700_000_000;
const EMPTY_PAYLOAD = PayloadParser.parse("{}");
const EXIT_POLL_DEADLINE_MS = 1_000;
const EXIT_POLL_INTERVAL_MS = 10;

function layoutOf(...segments: readonly Segment[]): Layout {
  return { rows: [segments] };
}

async function createDirectory(t: TestContext): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "ribbon-sources-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

async function createGitRepo(t: TestContext): Promise<string> {
  const directory = await createDirectory(t);
  const result = spawnSync("git", ["-c", "init.defaultBranch=main", "init", "-q", directory]);
  assert.equal(result.status, 0);
  return directory;
}

async function gather(
  layout: Layout,
  options: {
    readonly payload?: Payload;
    readonly payloadText?: string;
    readonly configDir?: string;
    readonly sourceOptions?: SourceOptions;
  } = {},
): Promise<RenderInputs> {
  return RenderSources.gather(
    layout,
    options.payload ?? EMPTY_PAYLOAD,
    options.payloadText ?? "{}",
    { configDir: options.configDir ?? "/nonexistent-ribbon-config", nowSeconds: NOW },
    options.sourceOptions,
  );
}

async function gatherRun(command: string, payloadText?: string): Promise<string | undefined> {
  const inputs = await gather(layoutOf({ type: "run", command }), { payloadText });
  return inputs.runOutputsByCommand.get(command);
}

async function writeEmotion(directory: string, name: string, content: string): Promise<void> {
  const path = join(directory, "cache", name);
  await mkdir(join(directory, "cache"), { recursive: true });
  await writeFile(path, content);
  await utimes(path, EMOTION_MODIFIED_SECONDS, EMOTION_MODIFIED_SECONDS);
}

function isProcessAlive(pid: number): boolean {
  const result = spawnSync("ps", ["-o", "stat=", "-p", String(pid)], { encoding: "utf8" });
  const state = result.stdout.trim();
  return state !== "" && !state.startsWith("Z");
}

// The SIGKILL is sent before gather resolves, but the kernel may need a moment to tear down.
async function waitForExit(pid: number): Promise<boolean> {
  const deadline = performance.now() + EXIT_POLL_DEADLINE_MS;
  while (performance.now() < deadline) {
    if (!isProcessAlive(pid)) {
      return true;
    }
    await delay(EXIT_POLL_INTERVAL_MS);
  }
  return !isProcessAlive(pid);
}

test("gathers run output from the first stdout line", async () => {
  const command = "printf 'a\\nb'";
  assert.deepEqual(await gather(layoutOf({ type: "run", command })), {
    payload: EMPTY_PAYLOAD,
    nowSeconds: NOW,
    gitStatus: undefined,
    emotion: undefined,
    email: undefined,
    runOutputsByCommand: new Map([[command, "a"]]),
  });
});

test("run commands receive the payload on stdin", async () => {
  assert.equal(await gatherRun("cat", '{"a":1}'), '{"a":1}');
});

test("run output keeps ansi codes and trims trailing space", async () => {
  assert.equal(await gatherRun("printf '\\033[31mred\\033[0m  '"), "\x1b[31mred\x1b[0m");
});

test("failing or silent run commands gather undefined", async () => {
  const inputs = await gather(
    layoutOf({ type: "run", command: "exit 1" }, { type: "run", command: "true" }),
  );
  assert.deepEqual(
    inputs.runOutputsByCommand,
    new Map([
      ["exit 1", undefined],
      ["true", undefined],
    ]),
  );
});

test("each distinct run command runs once", async (t) => {
  const directory = await createDirectory(t);
  const command = `echo x >> ${join(directory, "count")}; printf ok`;
  const inputs = await gather({
    rows: [[{ type: "run", command }], [{ type: "run", command }]],
  });
  assert.deepEqual(inputs.runOutputsByCommand, new Map([[command, "ok"]]));
  assert.equal(await readFile(join(directory, "count"), "utf8"), "x\n");
});

test("slow run commands time out", async () => {
  const start = performance.now();
  const inputs = await gather(layoutOf({ type: "run", command: "sleep 5" }), {
    sourceOptions: { runTimeoutMs: 100 },
  });
  assert.deepEqual(inputs.runOutputsByCommand, new Map([["sleep 5", undefined]]));
  assert.ok(performance.now() - start < 1_000);
});

test("background children holding stdout are killed at the timeout", async (t) => {
  const directory = await createDirectory(t);
  const pidPath = join(directory, "pid");
  const command = `sleep 5 & echo $! > ${pidPath}; printf hi`;
  const start = performance.now();
  const inputs = await gather(layoutOf({ type: "run", command }), {
    sourceOptions: { runTimeoutMs: 200 },
  });
  assert.ok(performance.now() - start < 1_500);
  assert.deepEqual(inputs.runOutputsByCommand, new Map([[command, undefined]]));
  const pid = Number((await readFile(pidPath, "utf8")).trim());
  assert.ok(Number.isInteger(pid) && pid > 0);
  assert.equal(await waitForExit(pid), true);
});

test("commands that ignore stdin do not crash on a large payload", async () => {
  const inputs = await gather(layoutOf({ type: "run", command: "true" }), {
    payloadText: "x".repeat(1_000_000),
  });
  assert.deepEqual(inputs.runOutputsByCommand, new Map([["true", undefined]]));
});

test("run commands run concurrently", async () => {
  const start = performance.now();
  const inputs = await gather(
    layoutOf(
      { type: "run", command: "sleep 0.3; printf a" },
      { type: "run", command: "sleep 0.3; printf b" },
    ),
    { sourceOptions: { runTimeoutMs: 2_000 } },
  );
  assert.ok(performance.now() - start < 550);
  assert.deepEqual(
    inputs.runOutputsByCommand,
    new Map([
      ["sleep 0.3; printf a", "a"],
      ["sleep 0.3; printf b", "b"],
    ]),
  );
});

test("reads git status only when the layout has a git segment", async (t) => {
  const repo = await createGitRepo(t);
  const payload = PayloadParser.parse(JSON.stringify({ cwd: repo }));
  const withGit = await gather(layoutOf({ type: "git" }), { payload });
  assert.ok(withGit.gitStatus?.includes("# branch.head main"));
  const withoutGit = await gather(layoutOf({ type: "model" }), { payload });
  assert.equal(withoutGit.gitStatus, undefined);
});

test("git status without a cwd is undefined", async () => {
  assert.equal((await gather(layoutOf({ type: "git" }))).gitStatus, undefined);
});

test("git status outside a repo is undefined", async (t) => {
  const directory = await createDirectory(t);
  const payload = PayloadParser.parse(JSON.stringify({ cwd: directory }));
  assert.equal((await gather(layoutOf({ type: "git" }), { payload })).gitStatus, undefined);
});

test("reads the account email", async (t) => {
  const configDir = await createDirectory(t);
  await writeFile(
    join(configDir, ".claude.json"),
    JSON.stringify({ oauthAccount: { emailAddress: "test@example.com" } }),
  );
  assert.equal(
    (await gather(layoutOf({ type: "email" }), { configDir })).email,
    "test@example.com",
  );
  assert.equal((await gather(layoutOf({ type: "model" }), { configDir })).email, undefined);
});

test("missing or malformed account file gives no email", async (t) => {
  const missing = await createDirectory(t);
  assert.equal(
    (await gather(layoutOf({ type: "email" }), { configDir: missing })).email,
    undefined,
  );
  const contents = [
    "nope",
    "null",
    "[]",
    JSON.stringify({}),
    JSON.stringify({ oauthAccount: null }),
    JSON.stringify({ oauthAccount: { emailAddress: "" } }),
    JSON.stringify({ oauthAccount: { emailAddress: 42 } }),
  ];
  for (const content of contents) {
    const configDir = await createDirectory(t);
    await writeFile(join(configDir, ".claude.json"), content);
    const inputs = await gather(layoutOf({ type: "email" }), { configDir });
    assert.equal(inputs.email, undefined, content);
  }
});

test("prefers the session emotion cache", async (t) => {
  const configDir = await createDirectory(t);
  await writeEmotion(configDir, "claude-emotion.json", JSON.stringify({ emotion: "calm" }));
  await writeEmotion(configDir, "claude-emotion-s1.json", JSON.stringify({ emotion: "happy" }));
  const payload = PayloadParser.parse(JSON.stringify({ session_id: "s1" }));
  const inputs = await gather(layoutOf({ type: "emotion" }), { configDir, payload });
  assert.deepEqual(inputs.emotion, { name: "happy", modifiedSeconds: EMOTION_MODIFIED_SECONDS });
  const withoutSegment = await gather(layoutOf({ type: "model" }), { configDir, payload });
  assert.equal(withoutSegment.emotion, undefined);
});

test("falls back to the global emotion cache", async (t) => {
  const configDir = await createDirectory(t);
  await writeEmotion(configDir, "claude-emotion.json", JSON.stringify({ emotion: "calm" }));
  const expected = { name: "calm", modifiedSeconds: EMOTION_MODIFIED_SECONDS };
  const noSession = await gather(layoutOf({ type: "emotion" }), { configDir });
  assert.deepEqual(noSession.emotion, expected);
  const payload = PayloadParser.parse(JSON.stringify({ session_id: "s2" }));
  const missingSession = await gather(layoutOf({ type: "emotion" }), { configDir, payload });
  assert.deepEqual(missingSession.emotion, expected);
});

test("malformed or emotion-less cache gives no emotion", async (t) => {
  const missing = await createDirectory(t);
  const missingInputs = await gather(layoutOf({ type: "emotion" }), { configDir: missing });
  assert.equal(missingInputs.emotion, undefined);
  const contents = [
    "nope",
    "null",
    "[]",
    JSON.stringify({}),
    JSON.stringify({ emotion: "" }),
    JSON.stringify({ emotion: 7 }),
  ];
  for (const content of contents) {
    const configDir = await createDirectory(t);
    await writeEmotion(configDir, "claude-emotion.json", content);
    const inputs = await gather(layoutOf({ type: "emotion" }), { configDir });
    assert.equal(inputs.emotion, undefined, content);
  }
});

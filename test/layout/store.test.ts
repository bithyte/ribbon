import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DEFAULT_LAYOUT, LayoutStore } from "../../src/layout/index.ts";

async function createDirectory(): Promise<string> {
  return mkdtemp(join(tmpdir(), "ribbon-layout-"));
}

test("loads and parses a layout file", async () => {
  const path = join(await createDirectory(), "ribbon.json");
  await writeFile(path, JSON.stringify({ rows: [[{ type: "cost" }]] }));
  assert.deepEqual(await LayoutStore.load(path), {
    kind: "parsed",
    layout: { rows: [[{ type: "cost" }]] },
  });
});

test("missing file loads the default layout", async () => {
  const path = join(await createDirectory(), "ribbon.json");
  assert.deepEqual(await LayoutStore.load(path), { kind: "parsed", layout: DEFAULT_LAYOUT });
});

test("invalid file is reported as data", async () => {
  const path = join(await createDirectory(), "ribbon.json");
  await writeFile(path, "nope");
  const result = await LayoutStore.load(path);
  assert.equal(result.kind, "invalid");
});

test("default layout matches the bash line order", () => {
  assert.deepEqual(DEFAULT_LAYOUT.rows, [
    [{ type: "title" }, { type: "git" }],
    [
      { type: "emotion" },
      { type: "model" },
      { type: "effort" },
      { type: "context" },
      { type: "fiveHour" },
      { type: "sevenDay" },
      { type: "cost" },
    ],
  ]);
});

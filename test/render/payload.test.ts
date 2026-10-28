import assert from "node:assert/strict";
import test from "node:test";
import { PayloadParser, type Payload } from "../../src/render/index.ts";

const EMPTY_PAYLOAD: Payload = {
  model: "Claude",
  effort: undefined,
  cwd: undefined,
  repoName: undefined,
  sessionId: undefined,
  contextUsedPercent: undefined,
  contextTokens: 0,
  fiveHourPercent: undefined,
  fiveHourResetsAt: undefined,
  sevenDayPercent: undefined,
  sevenDayResetsAt: undefined,
  costUsd: undefined,
};

function parse(raw: unknown): Payload {
  return PayloadParser.parse(JSON.stringify(raw));
}

function parseUsedPercentage(value: unknown): number | undefined {
  return parse({ context_window: { used_percentage: value } }).contextUsedPercent;
}

test("parses every field the segments use", () => {
  const payload = parse({
    model: { display_name: "Fable 5" },
    effort: { level: "high" },
    workspace: { current_dir: "/nonexistent/fullproj", repo: { name: "fullrepo" } },
    session_id: "abc-123",
    context_window: { used_percentage: 42, total_input_tokens: 80000, total_output_tokens: 4000 },
    rate_limits: {
      five_hour: { used_percentage: 30, resets_at: 1750009000 },
      seven_day: { used_percentage: 60, resets_at: 1750302400 },
    },
    cost: { total_cost_usd: 1.23 },
  });
  assert.deepEqual(payload, {
    model: "Fable 5",
    effort: "high",
    cwd: "/nonexistent/fullproj",
    repoName: "fullrepo",
    sessionId: "abc-123",
    contextUsedPercent: 42,
    contextTokens: 84000,
    fiveHourPercent: 30,
    fiveHourResetsAt: 1750009000,
    sevenDayPercent: 60,
    sevenDayResetsAt: 1750302400,
    costUsd: 1.23,
  });
});

test("invalid json parses as an empty payload", () => {
  for (const text of ["", "{", "[]", "42", "null", '"text"']) {
    assert.deepEqual(PayloadParser.parse(text), EMPTY_PAYLOAD, text);
  }
});

test("cwd falls back to top-level cwd", () => {
  assert.equal(parse({ cwd: "/a/top" }).cwd, "/a/top");
  assert.equal(parse({ workspace: { current_dir: null }, cwd: "/a/top" }).cwd, "/a/top");
  assert.equal(parse({ workspace: { current_dir: "/a/ws" }, cwd: "/a/top" }).cwd, "/a/ws");
});

test("numeric strings are accepted", () => {
  assert.equal(parseUsedPercentage("42"), 42);
  assert.equal(parseUsedPercentage("49.6"), 49.6);
  assert.equal(parse({ cost: { total_cost_usd: "1.5" } }).costUsd, 1.5);
});

test("non-numeric present values become zero", () => {
  assert.equal(parseUsedPercentage("abc"), 0);
  assert.equal(parseUsedPercentage(true), 0);
  assert.equal(parseUsedPercentage({}), 0);
});

test("null-like values are missing", () => {
  for (const value of [null, false, "", "null"]) {
    assert.equal(parseUsedPercentage(value), undefined, String(value));
  }
  assert.equal(parseUsedPercentage(undefined), undefined);
});

test("null-like strings are missing", () => {
  const payload = parse({
    effort: { level: "null" },
    workspace: { current_dir: "", repo: { name: "null" } },
    session_id: 7,
  });
  assert.deepEqual(payload, EMPTY_PAYLOAD);
});

test("model keeps an empty name and defaults non-strings to Claude", () => {
  assert.equal(parse({ model: { display_name: "" } }).model, "");
  assert.equal(parse({ model: { display_name: 5 } }).model, "Claude");
  assert.equal(parse({ model: "Opus" }).model, "Claude");
});

test("context tokens count non-numbers as zero", () => {
  const payload = parse({
    context_window: { total_input_tokens: "100", total_output_tokens: 7 },
  });
  assert.equal(payload.contextTokens, 7);
});

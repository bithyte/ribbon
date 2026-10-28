import assert from "node:assert/strict";
import test from "node:test";
import type { Segment } from "../../src/layout/index.ts";
import { PayloadParser, Renderer, type RenderInputs } from "../../src/render/index.ts";

const RESET = "\x1b[0m";
const DIM = "\x1b[2m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const ORANGE = "\x1b[38;5;208m";
const RED = "\x1b[31m";

const NOW = 1_750_000_000;
const NO_SOURCES = {
  gitStatus: undefined,
  emotion: undefined,
  email: undefined,
  runOutputsByCommand: new Map(),
};

function createInputs(
  raw: object,
  extra: Partial<Omit<RenderInputs, "payload">> = {},
): RenderInputs {
  return {
    ...NO_SOURCES,
    payload: PayloadParser.parse(JSON.stringify(raw)),
    nowSeconds: NOW,
    ...extra,
  };
}

function renderSegment(segment: Segment, inputs: RenderInputs): string {
  return Renderer.render({ rows: [[segment]] }, inputs);
}

function renderFiveHour(usedPercentage: unknown, resetsAt?: number): string {
  return renderSegment(
    { type: "fiveHour" },
    createInputs({
      rate_limits: { five_hour: { used_percentage: usedPercentage, resets_at: resetsAt } },
    }),
  );
}

function renderSevenDay(usedPercentage: unknown, resetsAt?: number): string {
  return renderSegment(
    { type: "sevenDay" },
    createInputs({
      rate_limits: { seven_day: { used_percentage: usedPercentage, resets_at: resetsAt } },
    }),
  );
}

function formatUsage(label: string, color: string, bar: string): string {
  return `${DIM}${label}${RESET} ${color}${bar}${RESET}\n`;
}

test("five hour under pace is green with a hollow tick", () => {
  assert.equal(renderFiveHour(30, NOW + 9000), `${DIM}2½h${RESET} ${GREEN}███░░▯░░░░${RESET}\n`);
});

test("five hour ahead of pace is red with a solid tick", () => {
  assert.equal(renderFiveHour(70, NOW + 9000), `${DIM}2½h${RESET} ${RED}█████▮█░░░${RESET}\n`);
});

test("five hour on pace within tolerance is yellow", () => {
  assert.equal(renderFiveHour(52, NOW + 9000), formatUsage("2½h", YELLOW, "█████▮░░░░"));
});

test("five hour without reset is a plain severity bar", () => {
  assert.equal(renderFiveHour(30), `${DIM}5h${RESET} ${GREEN}███░░░░░░░${RESET}\n`);
  assert.equal(renderFiveHour(79), formatUsage("5h", YELLOW, "███████░░░"));
  assert.equal(renderFiveHour(80), formatUsage("5h", RED, "████████░░"));
});

test("five hour bar clamps above 100 percent", () => {
  assert.equal(renderFiveHour(150), formatUsage("5h", RED, "██████████"));
});

test("pace tick clamps inside the bar", () => {
  assert.equal(renderFiveHour(0, NOW), formatUsage("<1h", GREEN, "░░░░░░░░░▯"));
  assert.equal(renderFiveHour(0, NOW + 18_000), formatUsage("5h", YELLOW, "▮░░░░░░░░░"));
});

test("countdown rounds up to quarter units", () => {
  assert.equal(renderFiveHour(52, NOW + 1), formatUsage("¼h", GREEN, "█████░░░░▯"));
  assert.equal(renderFiveHour(52, NOW + 2700), formatUsage("¾h", GREEN, "█████░░░▯░"));
  assert.equal(renderFiveHour(52, NOW + 3600), formatUsage("1h", GREEN, "█████░░░▯░"));
  assert.equal(renderFiveHour(52, NOW + 3601), formatUsage("1¼h", GREEN, "█████░░▯░░"));
});

test("countdown shows <1 once the reset has passed", () => {
  assert.equal(renderFiveHour(52, NOW), formatUsage("<1h", GREEN, "█████░░░░▯"));
  assert.equal(renderFiveHour(52, NOW - 50), formatUsage("<1h", GREEN, "█████░░░░▯"));
});

test("seven day over pace expands into an orange bar", () => {
  assert.equal(
    renderSevenDay(60, NOW + 302_400),
    `${DIM}3½d${RESET} ${ORANGE}███████▮░░░░░░${RESET}\n`,
  );
});

test("seven day under pace is a green gauge glyph", () => {
  assert.equal(renderSevenDay(20, NOW + 302_400), `${DIM}3½d${RESET} ${GREEN}▂${RESET}\n`);
});

test("seven day on pace is a yellow gauge glyph", () => {
  assert.equal(renderSevenDay(53, NOW + 302_400), formatUsage("3½d", YELLOW, "▅"));
});

test("seven day without reset never expands", () => {
  assert.equal(renderSevenDay(85), `${DIM}7d${RESET} ${RED}▇${RESET}\n`);
  assert.equal(renderSevenDay(100), formatUsage("7d", RED, "█"));
  assert.equal(renderSevenDay(0), formatUsage("7d", GREEN, "▁"));
});

test("non-numeric percent renders as zero", () => {
  assert.equal(renderFiveHour("abc"), formatUsage("5h", GREEN, "░░░░░░░░░░"));
});

test("missing percent drops the segment", () => {
  assert.equal(
    renderSegment(
      { type: "fiveHour" },
      createInputs({ rate_limits: { five_hour: { resets_at: NOW } } }),
    ),
    "",
  );
});

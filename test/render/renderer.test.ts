import assert from "node:assert/strict";
import test from "node:test";
import type { Segment } from "../../src/layout/index.ts";
import { PayloadParser, Renderer, type RenderInputs } from "../../src/render/index.ts";

const RESET = "\x1b[0m";
const DIM = "\x1b[2m";
const CYAN = "\x1b[36m";
const MAGENTA = "\x1b[35m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const ORANGE = "\x1b[38;5;208m";
const RED = "\x1b[31m";
const BRIGHT_BLUE = "\x1b[94m";
const TEAL = "\x1b[38;5;43m";
const WHITE = "\x1b[37m";
const BOLD_RED = "\x1b[1;31m";
const BOLD_MAGENTA = "\x1b[1;35m";

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

function renderContext(usedPercentage: number, inputTokens: number): string {
  return renderSegment(
    { type: "context" },
    createInputs({
      context_window: { used_percentage: usedPercentage, total_input_tokens: inputTokens },
    }),
  );
}

function renderEmotion(name: string, modifiedSeconds: number = NOW): string {
  return renderSegment(
    { type: "emotion" },
    createInputs({}, { emotion: { name, modifiedSeconds } }),
  );
}

test("joins segments in a row with a dim separator", () => {
  const inputs = createInputs({
    model: { display_name: "Fable 5" },
    cost: { total_cost_usd: 1.23 },
  });
  assert.equal(
    Renderer.render({ rows: [[{ type: "model" }, { type: "cost" }]] }, inputs),
    `${MAGENTA}Fable 5${RESET}${DIM} | ${RESET}${GREEN}$1.23${RESET}\n`,
  );
});

test("renders one line per row", () => {
  const inputs = createInputs({
    model: { display_name: "Fable 5" },
    cost: { total_cost_usd: 1.23 },
  });
  assert.equal(
    Renderer.render({ rows: [[{ type: "model" }], [{ type: "cost" }]] }, inputs),
    `${MAGENTA}Fable 5${RESET}\n${GREEN}$1.23${RESET}\n`,
  );
});

test("skips rows where every segment drops out", () => {
  assert.equal(
    Renderer.render(
      { rows: [[{ type: "effort" }], [{ type: "model" }], [{ type: "cost" }]] },
      createInputs({}),
    ),
    `${CYAN}Claude${RESET}\n`,
  );
});

test("empty layout renders nothing", () => {
  assert.equal(Renderer.render({ rows: [] }, createInputs({})), "");
  assert.equal(Renderer.render({ rows: [[]] }, createInputs({})), "");
});

test("title prefers repo name over cwd basename", () => {
  const inputs = createInputs({ workspace: { current_dir: "/a/proj", repo: { name: "named" } } });
  assert.equal(renderSegment({ type: "title" }, inputs), `${DIM}named${RESET}\n`);
});

test("title falls back to cwd basename", () => {
  const inputs = createInputs({ workspace: { current_dir: "/a/b/proj", repo: { name: "null" } } });
  assert.equal(renderSegment({ type: "title" }, inputs), `${DIM}proj${RESET}\n`);
  assert.equal(
    renderSegment({ type: "title" }, createInputs({ cwd: "plain" })),
    `${DIM}plain${RESET}\n`,
  );
});

test("title drops out without a name", () => {
  assert.equal(renderSegment({ type: "title" }, createInputs({})), "");
  assert.equal(renderSegment({ type: "title" }, createInputs({ cwd: "/a/b/" })), "");
});

test("model color depends on family case-insensitively", () => {
  const cases = [
    ["Opus 4.8", BRIGHT_BLUE],
    ["claude-SONNET", CYAN],
    ["Haiku 4.5", WHITE],
    ["Fable 5", MAGENTA],
    ["Mystery", CYAN],
  ] as const;
  for (const [name, color] of cases) {
    const inputs = createInputs({ model: { display_name: name } });
    assert.equal(renderSegment({ type: "model" }, inputs), `${color}${name}${RESET}\n`);
  }
});

test("model defaults to Claude", () => {
  assert.equal(renderSegment({ type: "model" }, createInputs({})), `${CYAN}Claude${RESET}\n`);
});

test("effort has five colors and a fallback", () => {
  const cases = [
    ["low", GREEN],
    ["medium", YELLOW],
    ["high", TEAL],
    ["xhigh", BOLD_RED],
    ["max", BOLD_MAGENTA],
    ["turbo", CYAN],
  ] as const;
  for (const [level, color] of cases) {
    const inputs = createInputs({ effort: { level } });
    assert.equal(renderSegment({ type: "effort" }, inputs), `${color}${level}${RESET}\n`);
  }
});

test("effort drops out when missing", () => {
  assert.equal(renderSegment({ type: "effort" }, createInputs({})), "");
  assert.equal(renderSegment({ type: "effort" }, createInputs({ effort: { level: "null" } })), "");
});

test("context formats tokens with k and M suffixes", () => {
  const cases = [
    [999, "999"],
    [1000, "1k"],
    [84_000, "84k"],
    [1_000_000, "1M"],
    [2_500_000, "2.5M"],
  ] as const;
  for (const [tokens, text] of cases) {
    assert.equal(renderContext(5, tokens), `${GREEN}${text}${RESET}\n`);
  }
});

test("context adds input and output tokens", () => {
  const inputs = createInputs({
    context_window: { used_percentage: 5, total_input_tokens: 80_000, total_output_tokens: 4000 },
  });
  assert.equal(renderSegment({ type: "context" }, inputs), `${GREEN}84k${RESET}\n`);
});

test("context token ties round half to even", () => {
  const cases = [
    [1250, "1.2k"],
    [1750, "1.8k"],
    [2_250_000, "2.2M"],
  ] as const;
  for (const [tokens, text] of cases) {
    assert.equal(renderContext(5, tokens), `${GREEN}${text}${RESET}\n`);
  }
});

test("context color bands", () => {
  const cases = [
    [19, GREEN],
    [20, YELLOW],
    [39, YELLOW],
    [40, ORANGE],
    [49.6, ORANGE],
    [59, ORANGE],
    [59.5, RED],
    [60, RED],
  ] as const;
  for (const [percent, color] of cases) {
    assert.equal(renderContext(percent, 500), `${color}500${RESET}\n`, String(percent));
  }
});

test("context without used percentage drops out", () => {
  const inputs = createInputs({ context_window: { total_input_tokens: 500 } });
  assert.equal(renderSegment({ type: "context" }, inputs), "");
});

test("context without token counts shows zero", () => {
  const inputs = createInputs({ context_window: { used_percentage: 5 } });
  assert.equal(renderSegment({ type: "context" }, inputs), `${GREEN}0${RESET}\n`);
});

test("cost has two decimals rounding ties to even", () => {
  const cases = [
    [0.05, "$0.05"],
    [0.125, "$0.12"],
    [0.375, "$0.38"],
    [1.23, "$1.23"],
    [0, "$0.00"],
  ] as const;
  for (const [usd, text] of cases) {
    const inputs = createInputs({ cost: { total_cost_usd: usd } });
    assert.equal(renderSegment({ type: "cost" }, inputs), `${GREEN}${text}${RESET}\n`);
  }
});

test("cost drops out when missing", () => {
  assert.equal(renderSegment({ type: "cost" }, createInputs({})), "");
});

test("email renders cyan when present", () => {
  assert.equal(
    renderSegment({ type: "email" }, createInputs({}, { email: "a@b.c" })),
    `${CYAN}a@b.c${RESET}\n`,
  );
  assert.equal(renderSegment({ type: "email" }, createInputs({})), "");
});

test("emotion colors known names", () => {
  assert.equal(renderEmotion("curious"), `${CYAN}curious${RESET}\n`);
  assert.equal(renderEmotion("calm"), `${TEAL}calm${RESET}\n`);
  assert.equal(renderEmotion("concerned"), `${RED}concerned${RESET}\n`);
  assert.equal(renderEmotion("unknown"), `${DIM}unknown${RESET}\n`);
});

test("emotion desperate renders a bold red warning", () => {
  assert.equal(renderEmotion("desperate"), `${BOLD_RED}DESPERATE${RESET}\n`);
});

test("emotion with an unlisted name renders bare", () => {
  assert.equal(renderEmotion("elated"), "elated\n");
});

test("emotion exactly 600 seconds old is still shown", () => {
  assert.equal(renderEmotion("curious", NOW - 600), `${CYAN}curious${RESET}\n`);
  assert.equal(renderEmotion("curious", NOW - 601), "");
});

test("emotion drops out when missing or empty", () => {
  assert.equal(renderSegment({ type: "emotion" }, createInputs({})), "");
  assert.equal(renderEmotion(""), "");
});

test("run segment renders the gathered output", () => {
  const segment = { type: "run", command: "x" } as const;
  const output = "\x1b[31mhi\x1b[0m";
  const render = (outputs: ReadonlyMap<string, string | undefined>): string =>
    renderSegment(segment, createInputs({}, { runOutputsByCommand: outputs }));
  assert.equal(render(new Map([["x", output]])), `${output}\n`);
  assert.equal(render(new Map()), "");
  assert.equal(render(new Map([["x", undefined]])), "");
  assert.equal(render(new Map([["x", ""]])), "");
});

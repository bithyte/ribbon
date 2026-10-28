import assert from "node:assert/strict";
import test from "node:test";
import { LayoutParser } from "../../src/layout/index.ts";

function assertInvalid(value: unknown, message: string): void {
  assert.deepEqual(LayoutParser.parse(JSON.stringify(value)), { kind: "invalid", message });
}

test("parses rows of builtin and run segments", () => {
  const text = JSON.stringify({
    rows: [[{ type: "model" }, { type: "run", command: "printf hi" }]],
  });
  assert.deepEqual(LayoutParser.parse(text), {
    kind: "parsed",
    layout: { rows: [[{ type: "model" }, { type: "run", command: "printf hi" }]] },
  });
});

test("drops unknown keys on segments and top level", () => {
  const text = JSON.stringify({ rows: [[{ type: "cost", color: "red" }]], theme: 1 });
  assert.deepEqual(LayoutParser.parse(text), {
    kind: "parsed",
    layout: { rows: [[{ type: "cost" }]] },
  });
});

test("accepts empty rows array", () => {
  assert.deepEqual(LayoutParser.parse('{"rows":[]}'), { kind: "parsed", layout: { rows: [] } });
});

test("validates already-parsed values", () => {
  assert.deepEqual(LayoutParser.validate({ rows: [[{ type: "git" }]] }), {
    kind: "parsed",
    layout: { rows: [[{ type: "git" }]] },
  });
});

test("reports invalid json", () => {
  const result = LayoutParser.parse("{");
  assert.equal(result.kind, "invalid");
  assert.ok(result.kind === "invalid" && result.message.startsWith("not valid json: "));
});

test("reports missing rows", () => {
  assertInvalid({}, '"rows" must be an array of rows');
});

test("reports a row that is not an array", () => {
  assertInvalid({ rows: [{}] }, "rows[0] must be an array of segments");
});

test("reports a segment without a type", () => {
  assertInvalid({ rows: [[{}]] }, 'rows[0][0] must be an object with a "type"');
});

test("reports an unknown segment type", () => {
  assertInvalid(
    { rows: [[{ type: "model" }, { type: "foo" }]] },
    'rows[0][1] has unknown segment type "foo"',
  );
});

test("reports a run segment without a command", () => {
  const message = 'rows[0][0] is a "run" segment without a "command"';
  assertInvalid({ rows: [[{ type: "run" }]] }, message);
  assertInvalid({ rows: [[{ type: "run", command: "" }]] }, message);
});

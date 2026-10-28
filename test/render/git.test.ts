import assert from "node:assert/strict";
import test from "node:test";
import { PayloadParser, Renderer, type RenderInputs } from "../../src/render/index.ts";

const RESET = "\x1b[0m";
const DIM = "\x1b[2m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";

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
    nowSeconds: 1_750_000_000,
    ...extra,
  };
}

function renderGit(gitStatus: string | undefined): string {
  return Renderer.render({ rows: [[{ type: "git" }]] }, createInputs({}, { gitStatus }));
}

const HEAD = "# branch.oid abc\n# branch.head main\n";
const STAGED_LINE = "1 A. N... 000000 100644 100644 0000000 1111111 staged.txt\n";
const MODIFIED_LINE = "1 .M N... 100644 100644 100644 1111111 1111111 tracked.txt\n";

test("clean repo renders a green check", () => {
  assert.equal(renderGit(HEAD), `${GREEN}main ✓${RESET}\n`);
});

test("fresh repo with no commits renders the branch", () => {
  assert.equal(
    renderGit("# branch.oid (initial)\n# branch.head main\n"),
    `${GREEN}main ✓${RESET}\n`,
  );
});

test("dirty repo counts staged modified and untracked", () => {
  assert.equal(
    renderGit(`${HEAD}${STAGED_LINE}${MODIFIED_LINE}? untracked.txt\n`),
    `${YELLOW}main ✗${RESET} ${GREEN}+1${RESET}${YELLOW}~1${RESET}${DIM}?1${RESET}\n`,
  );
});

test("a file staged and modified counts toward both", () => {
  assert.equal(
    renderGit(`${HEAD}1 MM N... 100644 100644 100644 1111111 2222222 both.txt\n`),
    `${YELLOW}main ✗${RESET} ${GREEN}+1${RESET}${YELLOW}~1${RESET}\n`,
  );
});

test("renames count as staged and conflicts as modified", () => {
  assert.equal(
    renderGit(`${HEAD}2 R. N... 100644 100644 100644 1111111 1111111 R100 new.txt\told.txt\n`),
    `${YELLOW}main ✗${RESET} ${GREEN}+1${RESET}\n`,
  );
  assert.equal(
    renderGit(`${HEAD}u UU N... 100644 100644 100644 100644 1111111 2222222 3333333 c.txt\n`),
    `${YELLOW}main ✗${RESET} ${YELLOW}~1${RESET}\n`,
  );
});

test("detached head shows the short oid", () => {
  assert.equal(
    renderGit("# branch.oid 0123456789abcdef\n# branch.head (detached)\n"),
    `${GREEN}detached@0123456 ✓${RESET}\n`,
  );
});

test("no status drops the segment", () => {
  assert.equal(renderGit(undefined), "");
  assert.equal(renderGit(""), "");
  assert.equal(renderGit("# branch.oid abc\n"), "");
});

import {
  DIM,
  GIT_BRANCH_HEAD_PREFIX,
  GIT_BRANCH_OID_PREFIX,
  GIT_CLEAN_MARK,
  GIT_DETACHED_HEAD,
  GIT_DETACHED_LABEL,
  GIT_DIRTY_MARK,
  GIT_SHORT_OID_LENGTH,
  GIT_UNCHANGED_FLAG,
  GREEN,
  RESET,
  YELLOW,
} from "./constants.ts";

type GitCounts = {
  readonly stagedCount: number;
  readonly modifiedCount: number;
  readonly untrackedCount: number;
};

/** Describes `git status --porcelain=v2 --branch` output as a segment. Never throws. */
export class GitStatus {
  private constructor() {}

  /** Returns `undefined` when the text has no branch head line. */
  public static describe(statusText: string): string | undefined {
    const lines = statusText.split("\n");
    const branch = GitStatus.findBranch(lines);
    if (branch === undefined) {
      return undefined;
    }
    const { stagedCount, modifiedCount, untrackedCount } = GitStatus.count(lines);
    if (stagedCount + modifiedCount + untrackedCount === 0) {
      return `${GREEN}${branch} ${GIT_CLEAN_MARK}${RESET}`;
    }
    const staged = stagedCount > 0 ? `${GREEN}+${stagedCount}${RESET}` : "";
    const modified = modifiedCount > 0 ? `${YELLOW}~${modifiedCount}${RESET}` : "";
    const untracked = untrackedCount > 0 ? `${DIM}?${untrackedCount}${RESET}` : "";
    return `${YELLOW}${branch} ${GIT_DIRTY_MARK}${RESET} ${staged}${modified}${untracked}`;
  }

  private static findBranch(lines: readonly string[]): string | undefined {
    const head = GitStatus.findValue(lines, GIT_BRANCH_HEAD_PREFIX);
    if (head === undefined || head === "") {
      return undefined;
    }
    if (head !== GIT_DETACHED_HEAD) {
      return head;
    }
    const oid = GitStatus.findValue(lines, GIT_BRANCH_OID_PREFIX) ?? "";
    return `${GIT_DETACHED_LABEL}${oid.slice(0, GIT_SHORT_OID_LENGTH)}`;
  }

  private static findValue(lines: readonly string[], prefix: string): string | undefined {
    const line = lines.find((candidate) => candidate.startsWith(prefix));
    return line?.slice(prefix.length);
  }

  private static count(lines: readonly string[]): GitCounts {
    let stagedCount = 0;
    let modifiedCount = 0;
    let untrackedCount = 0;
    for (const line of lines) {
      if (line.startsWith("1 ") || line.startsWith("2 ")) {
        const flags = line.split(" ")[1] ?? "";
        if (flags[0] !== undefined && flags[0] !== GIT_UNCHANGED_FLAG) {
          stagedCount += 1;
        }
        if (flags[1] !== undefined && flags[1] !== GIT_UNCHANGED_FLAG) {
          modifiedCount += 1;
        }
      } else if (line.startsWith("u ")) {
        modifiedCount += 1;
      } else if (line.startsWith("? ")) {
        untrackedCount += 1;
      }
    }
    return { stagedCount, modifiedCount, untrackedCount };
  }
}

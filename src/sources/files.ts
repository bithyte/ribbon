import { execFile } from "node:child_process";
import { open, readFile, type FileHandle } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import type { EmotionCache } from "../render/index.ts";
import {
  ACCOUNT_FILE_NAME,
  CACHE_DIRECTORY_NAME,
  EMOTION_FILE_NAME,
  EMOTION_SESSION_FILE_PREFIX,
  EMOTION_SESSION_FILE_SUFFIX,
  GIT_COMMAND,
  GIT_MAX_BUFFER_BYTES,
  GIT_STATUS_ARGUMENTS,
  MS_PER_SECOND,
  SESSION_ID_PATTERN,
} from "./constants.ts";
import type { PlainObject } from "./types.ts";

const execFileAsync = promisify(execFile);

/** Reads git status, the account email and the emotion cache. Never throws; every failure is `undefined`. */
export class SourceFiles {
  private constructor() {}

  /** Raw `git status --porcelain=v2 --branch` stdout, `undefined` on any error or empty output. Never throws. */
  public static async readGitStatus(cwd: string, timeoutMs: number): Promise<string | undefined> {
    let stdout: string;
    try {
      ({ stdout } = await execFileAsync(GIT_COMMAND, ["-C", cwd, ...GIT_STATUS_ARGUMENTS], {
        timeout: timeoutMs,
        maxBuffer: GIT_MAX_BUFFER_BYTES,
        encoding: "utf8",
      }));
    } catch {
      // Not a repository, git missing, timed out: the segment just hides.
      return undefined;
    }
    return stdout === "" ? undefined : stdout;
  }

  /** `oauthAccount.emailAddress` from `<configDir>/.claude.json` when a non-empty string. Never throws. */
  public static async readEmail(configDir: string): Promise<string | undefined> {
    let text: string;
    try {
      text = await readFile(join(configDir, ACCOUNT_FILE_NAME), "utf8");
    } catch {
      // A missing or unreadable account file means no one is logged in, as far as the line cares.
      return undefined;
    }
    const account = SourceFiles.parseObject(text)?.["oauthAccount"];
    const email = SourceFiles.isPlainObject(account) ? account["emailAddress"] : undefined;
    return typeof email === "string" && email !== "" ? email : undefined;
  }

  /** The session emotion cache when it exists and the id is a plain name, else the global one. Freshness is left to render. Never throws. */
  public static async readEmotion(
    configDir: string,
    sessionId: string | undefined,
  ): Promise<EmotionCache | undefined> {
    const cacheDirectory = join(configDir, CACHE_DIRECTORY_NAME);
    const sessionHandle =
      sessionId === undefined || !SESSION_ID_PATTERN.test(sessionId)
        ? undefined
        : await SourceFiles.findHandle(
            join(
              cacheDirectory,
              `${EMOTION_SESSION_FILE_PREFIX}${sessionId}${EMOTION_SESSION_FILE_SUFFIX}`,
            ),
          );
    const handle =
      sessionHandle ?? (await SourceFiles.findHandle(join(cacheDirectory, EMOTION_FILE_NAME)));
    if (handle === undefined) {
      return undefined;
    }
    let text: string;
    let modifiedMs: number;
    try {
      modifiedMs = (await handle.stat()).mtimeMs;
      text = await handle.readFile("utf8");
    } catch {
      // A cache that vanishes or cannot be read mid-render is just a missing emotion.
      return undefined;
    } finally {
      await handle.close().catch(() => {});
    }
    const name = SourceFiles.parseObject(text)?.["emotion"];
    if (typeof name !== "string" || name === "") {
      return undefined;
    }
    return { name, modifiedSeconds: Math.floor(modifiedMs / MS_PER_SECOND) };
  }

  private static async findHandle(path: string): Promise<FileHandle | undefined> {
    try {
      return await open(path, "r");
    } catch {
      // Missing or unreadable both mean "fall through to the next candidate".
      return undefined;
    }
  }

  private static parseObject(text: string): PlainObject | undefined {
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      // Corrupt caches are written by other tools; treat them as absent.
      return undefined;
    }
    return SourceFiles.isPlainObject(value) ? value : undefined;
  }

  private static isPlainObject(value: unknown): value is PlainObject {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
}

import { copyFile, mkdir, open, rename, rm, type FileHandle } from "node:fs/promises";
import { dirname } from "node:path";
import { BACKUP_SUFFIX, MISSING_FILE } from "./constants.ts";
import type { StoredFile } from "./types.ts";

/** Reads, writes and backs up JSON files. Throws on I/O errors other than a missing file. */
export class JsonFileStore {
  private constructor() {}

  /** The file's text, or `missing` when it doesn't exist; other errors throw. */
  public static async read(path: string): Promise<StoredFile> {
    let handle: FileHandle;
    try {
      handle = await open(path, "r");
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return MISSING_FILE;
      }
      throw error;
    }
    try {
      return { kind: "found", text: await handle.readFile("utf8") };
    } finally {
      await handle.close();
    }
  }

  /** Writes `value` as pretty JSON atomically: parent dirs created, then temp file, sync, rename. */
  public static async write(path: string, value: unknown): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    const temporaryPath = `${path}.${process.pid}.tmp`;
    try {
      await JsonFileStore.writeSynced(temporaryPath, `${JSON.stringify(value, null, 2)}\n`);
      await rename(temporaryPath, path);
    } catch (error) {
      // Best-effort cleanup: the write error is the one worth reporting.
      await rm(temporaryPath, { force: true }).catch(() => {});
      throw error;
    }
  }

  /** Copies `path` to `<path>.bak`, overwriting an older backup. */
  public static async backup(path: string): Promise<void> {
    await copyFile(path, `${path}${BACKUP_SUFFIX}`);
  }

  private static async writeSynced(path: string, text: string): Promise<void> {
    const handle = await open(path, "w");
    try {
      await handle.writeFile(text, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
  }
}

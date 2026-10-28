import {
  copyFile,
  mkdir,
  open,
  realpath,
  rename,
  rm,
  stat,
  type FileHandle,
} from "node:fs/promises";
import { dirname } from "node:path";
import { BACKUP_SUFFIX, FILE_MODE_MASK, MISSING_FILE } from "./constants.ts";
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
      if (JsonFileStore.isMissing(error)) {
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

  /** Writes `value` as pretty JSON atomically: parent dirs created, then temp file, sync, rename. A symlink stays and its target is replaced; an existing file keeps its mode. */
  public static async write(path: string, value: unknown): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    const targetPath = await JsonFileStore.resolveTarget(path);
    const mode = await JsonFileStore.findMode(targetPath);
    // Next to the target, so the rename stays on one filesystem.
    const temporaryPath = `${targetPath}.${process.pid}.tmp`;
    try {
      await JsonFileStore.writeSynced(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, mode);
      await rename(temporaryPath, targetPath);
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

  private static async resolveTarget(path: string): Promise<string> {
    try {
      return await realpath(path);
    } catch (error) {
      if (JsonFileStore.isMissing(error)) {
        return path;
      }
      throw error;
    }
  }

  private static async findMode(path: string): Promise<number | undefined> {
    try {
      return (await stat(path)).mode & FILE_MODE_MASK;
    } catch (error) {
      if (JsonFileStore.isMissing(error)) {
        return undefined;
      }
      throw error;
    }
  }

  private static async writeSynced(
    path: string,
    text: string,
    mode: number | undefined,
  ): Promise<void> {
    const handle = await open(path, "w");
    try {
      // Set explicitly: a mode passed to open would be narrowed by the umask.
      if (mode !== undefined) {
        await handle.chmod(mode);
      }
      await handle.writeFile(text, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
  }

  private static isMissing(error: unknown): boolean {
    return error instanceof Error && "code" in error && error.code === "ENOENT";
  }
}

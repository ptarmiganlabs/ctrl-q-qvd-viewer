import { promises as fs } from "fs";
import { randomUUID } from "crypto";
import { dirname, join } from "path";

/**
 * Write a file so that a failed export leaves an existing file as it was
 *
 * The contents go to a temporary file next to the target, which then replaces the
 * target in one rename. A target reached through a symlink is replaced at its real
 * path, so the link stays, and an existing target keeps its permissions.
 * @param {string} filePath - Destination file path
 * @param {(file: import("fs").promises.FileHandle) => Promise<void>} write - Writes the contents to the open temporary file
 * @returns {Promise<void>}
 */
export async function writeFileAtomically(filePath, write) {
  const target = await fs.realpath(filePath).catch(() => filePath);
  // Not named after the target, so a long file name can't make it too long
  const temp = join(dirname(target), `.qvd-export-${randomUUID()}.tmp`);
  const file = await fs.open(temp, "wx");
  try {
    try {
      await write(file);
      const existing = await fs.stat(target).catch(() => null);
      if (existing) {
        await file.chmod(existing.mode & 0o7777);
      }
      await file.sync();
    } finally {
      await file.close();
    }
    await fs.rename(temp, target);
  } catch (error) {
    await fs.rm(temp, { force: true });
    throw error;
  }
}

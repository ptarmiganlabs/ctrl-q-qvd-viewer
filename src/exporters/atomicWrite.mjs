import { promises as fs } from "fs";
import { randomUUID } from "crypto";
import { dirname, join } from "path";
import { Writable } from "stream";
import { requireChunkRows } from "../memoryGuard.mjs";

/**
 * The file a write replaces, and the temporary file next to it that it writes first
 * A target reached through a symlink is its real path, so that the link stays. The
 * temporary file isn't named after the target, so a long file name can't make it too long.
 * @param {string} filePath - Destination file path
 * @returns {Promise<{target: string, temp: string}>} The paths
 */
async function pathsFor(filePath) {
  const target = await fs.realpath(filePath).catch(() => filePath);
  return { target, temp: join(dirname(target), `.qvd-export-${randomUUID()}.tmp`) };
}

/**
 * Make a written temporary file ready to replace its target: an existing target's
 * permissions, and its contents on disk before the rename
 * @param {import("fs").promises.FileHandle} file - The temporary file, open
 * @param {string} target - The file it replaces
 * @returns {Promise<void>}
 */
async function readyToReplace(file, target) {
  const existing = await fs.stat(target).catch(() => null);
  if (existing) {
    await file.chmod(existing.mode & 0o7777);
  }
  await file.sync();
}

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
  const { target, temp } = await pathsFor(filePath);
  const file = await fs.open(temp, "wx");
  try {
    try {
      await write(file);
      await readyToReplace(file, target);
    } finally {
      await file.close();
    }
    await fs.rename(temp, target);
  } catch (error) {
    await fs.rm(temp, { force: true });
    throw error;
  }
}

/**
 * Write a file by its path so that a failed export leaves an existing file as it was
 *
 * As writeFileAtomically() does, for a writer that opens the file itself, as SQLite
 * does: it is handed the temporary file's path, the file created empty, and has closed
 * everything it opened on it by the time it settles. Only then is the file opened
 * again, to take an existing target's permissions and be synced before the rename, so
 * that it is never open twice at once: closing one of two descriptors would drop the
 * other's POSIX locks. Files the writer keeps next to it as it writes, such as SQLite's
 * journal, are removed whether the write succeeds or fails.
 * @param {string} filePath - Destination file path
 * @param {(tempPath: string) => Promise<void>} write - Writes the contents to the
 *   temporary file at this path, and closes it
 * @param {object} [options]
 * @param {Array<string>} [options.sidecarSuffixes] - What those files' names add to the
 *   temporary file's, such as "-journal"
 * @returns {Promise<void>}
 */
export async function writeFileAtomicallyByPath(filePath, write, { sidecarSuffixes = [] } = {}) {
  const { target, temp } = await pathsFor(filePath);
  // Created here, as writeFileAtomically() creates its file, so that the name is this write's
  await (await fs.open(temp, "wx")).close();
  try {
    await write(temp);
    const file = await fs.open(temp, "r+");
    try {
      await readyToReplace(file, target);
    } finally {
      await file.close();
    }
    await fs.rename(temp, target);
  } catch (error) {
    await fs.rm(temp, { force: true });
    throw error;
  } finally {
    for (const suffix of sidecarSuffixes) {
      await fs.rm(`${temp}${suffix}`, { force: true });
    }
  }
}

/**
 * A stream that writes to an open file, for a writer that takes a stream
 * Not the file's own createWriteStream(), which holds the file open, so that
 * closing it once the stream is done never settles. Each chunk is written before
 * the next is taken.
 * @param {import("fs").promises.FileHandle} file - The open file, such as the one
 *   writeFileAtomically() hands its write
 * @returns {import("stream").Writable} The stream
 */
export function fileWriter(file) {
  return new Writable({
    write(chunk, _encoding, callback) {
      file.writeFile(chunk).then(() => callback(), callback);
    },
  });
}

/**
 * Write rows' text a chunk of rows at a time, each chunk in the file before the next is made
 * @param {import("fs").promises.FileHandle} file - The open file
 * @param {number} count - Rows to write, from the first
 * @param {number} chunkRows - Rows a chunk, as rowsPerChunk() gives it
 * @param {(start: number, end: number) => string} render - The text of rows start to end, end excluded
 * @returns {Promise<void>}
 * @throws {RangeError} For a chunkRows that isn't a whole number of 1 or more
 */
export async function writeChunks(file, count, chunkRows, render) {
  requireChunkRows(chunkRows);
  for (let start = 0; start < count; start += chunkRows) {
    await file.writeFile(render(start, Math.min(start + chunkRows, count)));
  }
}

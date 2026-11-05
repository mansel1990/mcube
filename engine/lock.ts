import fs from "fs";
import os from "os";
import path from "path";

const STALE_MS = 30 * 60 * 1000;
const WAIT_MS = 4 * 60 * 1000;
const INTERVAL_MS = 500;

function lockPath(): string {
  return (
    process.env.MLIVE_LOCK_PATH ||
    (process.platform === "win32" ? path.join(os.tmpdir(), "mlive-engine.lock") : "/tmp/mlive-engine.lock")
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * One engine job at a time. If another job holds the lock, wait and retry for up to 4 minutes.
 * A lock older than 30 minutes is treated as a crashed run.
 */
export async function withLock<T>(
  fn: () => Promise<T>,
  opts?: { waitMs?: number; intervalMs?: number; sleep?: (ms: number) => Promise<void> }
): Promise<T> {
  const waitMs = opts?.waitMs ?? WAIT_MS;
  const intervalMs = opts?.intervalMs ?? INTERVAL_MS;
  const pause = opts?.sleep ?? sleep;
  const file = lockPath();
  const started = Date.now();
  let fd: number | null = null;
  while (fd == null) {
    try {
      const stat = fs.statSync(file);
      if (Date.now() - stat.mtimeMs > STALE_MS) fs.unlinkSync(file);
    } catch {
      /* no lock yet */
    }
    try {
      fd = fs.openSync(file, "wx");
    } catch {
      if (Date.now() - started >= waitMs) throw new Error("another mlive job is already running");
      await pause(intervalMs);
    }
  }
  fs.writeSync(fd, String(process.pid));
  try {
    return await fn();
  } finally {
    fs.closeSync(fd);
    try {
      fs.unlinkSync(file);
    } catch {
      /* already gone */
    }
  }
}

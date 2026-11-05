import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { withLock } from "./lock";

const file = path.join(os.tmpdir(), `mlive-lock-test-${process.pid}.lock`);

afterEach(() => {
  delete process.env.MLIVE_LOCK_PATH;
  try {
    fs.unlinkSync(file);
  } catch {
    /* already gone */
  }
});

describe("engine lock", () => {
  it("retries until the other job releases the lock", async () => {
    process.env.MLIVE_LOCK_PATH = file;
    fs.writeFileSync(file, "busy");
    let waits = 0;
    const result = await withLock(() => Promise.resolve("ran"), {
      waitMs: 1_000,
      intervalMs: 20,
      sleep: async () => {
        waits += 1;
        if (waits === 1) fs.unlinkSync(file);
      },
    });
    expect(result).toBe("ran");
    expect(waits).toBeGreaterThan(0);
    expect(fs.existsSync(file)).toBe(false);
  });

  it("fails once the wait is over", async () => {
    process.env.MLIVE_LOCK_PATH = file;
    fs.writeFileSync(file, "busy");
    await expect(
      withLock(() => Promise.resolve("ran"), {
        waitMs: 30,
        intervalMs: 10,
        sleep: async () => {},
      })
    ).rejects.toThrow(/already running/);
  });
});
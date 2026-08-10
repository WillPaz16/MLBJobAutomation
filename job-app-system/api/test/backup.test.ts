import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { backupDatabase } from "../src/backup.js";

// Every test here operates on a throwaway temp directory passed explicitly to backupDatabase —
// never the real api/data directory. Do not remove the dataDir argument in these calls.
let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "backup-test-"));
  writeFileSync(join(tempDir, "jobs.db"), "fake sqlite content");
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe("backupDatabase", () => {
  it("creates a timestamped copy of the database", () => {
    const backupPath = backupDatabase(tempDir);
    expect(existsSync(backupPath)).toBe(true);
    expect(backupPath).toMatch(/jobs-.*\.db$/);
  });

  it("throws if no database file exists", () => {
    rmSync(join(tempDir, "jobs.db"));
    expect(() => backupDatabase(tempDir)).toThrow(/No database file found/);
  });

  it("prunes backups beyond the retention limit, keeping the most recent", () => {
    const backupDir = join(tempDir, "backups");
    mkdirSync(backupDir, { recursive: true });
    // create 16 fake backups with staggered mtimes, oldest first
    for (let i = 0; i < 16; i++) {
      const path = join(backupDir, `jobs-fake-${i}.db`);
      writeFileSync(path, "x");
      const time = new Date(Date.now() - (16 - i) * 60_000);
      utimesSync(path, time, time);
    }

    backupDatabase(tempDir); // triggers pruning as a side effect, plus adds one more (newest) backup

    const remaining = readdirSync(backupDir);
    expect(remaining.length).toBe(14);
    // the oldest fakes (0, 1, 2) should have been pruned
    expect(remaining).not.toContain("jobs-fake-0.db");
    expect(remaining).not.toContain("jobs-fake-1.db");
  });
});

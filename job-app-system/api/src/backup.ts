import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATA_DIR = join(__dirname, "../data");
const RETENTION = 14;

export function backupDatabase(dataDir: string = DEFAULT_DATA_DIR): string {
  const backupDir = join(dataDir, "backups");
  const dbPath = join(dataDir, "jobs.db");

  if (!existsSync(backupDir)) mkdirSync(backupDir, { recursive: true });
  if (!existsSync(dbPath)) throw new Error(`No database file found at ${dbPath}`);

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = join(backupDir, `jobs-${timestamp}.db`);
  copyFileSync(dbPath, backupPath);

  pruneOldBackups(backupDir);
  return backupPath;
}

function pruneOldBackups(backupDir: string) {
  const files = readdirSync(backupDir)
    .filter((f) => f.endsWith(".db"))
    .map((f) => ({ name: f, path: join(backupDir, f), mtime: statSync(join(backupDir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);

  for (const file of files.slice(RETENTION)) {
    unlinkSync(file.path);
  }
}

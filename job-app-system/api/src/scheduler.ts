import cron from "node-cron";
import { execFile } from "child_process";
import { promisify } from "util";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { backupDatabase } from "./backup.js";
import { generateNotificationSummary, logNotificationFailure } from "./notifications.js";
import { scanDocumentDirs } from "./documentImport.js";

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRAPERS_DIR = join(__dirname, "../../scrapers");
const DB_ABSOLUTE_PATH = join(__dirname, "../data/jobs.db");

export async function runDailyDiscovery() {
  try {
    const backupPath = backupDatabase();
    console.log(`[scheduler] backed up database to ${backupPath}`);
  } catch (err) {
    console.error("[scheduler] backup failed:", err);
    await logNotificationFailure("Database backup", err);
    // Don't abort the rest of the run over a backup failure — discovery is still worth doing.
  }

  try {
    const { stdout } = await execFileAsync("npx", ["tsx", "src/runDiscovery.ts"], {
      cwd: SCRAPERS_DIR,
      maxBuffer: 10 * 1024 * 1024,
      env: {
        ...process.env,
        // The API process's own .env sets DATABASE_URL to a path relative to *its* schema
        // directory; that value leaks into this child process's environment by default and
        // resolves to the wrong file under the scraper's schema directory. Override with an
        // absolute path so it's unambiguous regardless of which .env loaded first.
        DATABASE_URL: `file:${DB_ABSOLUTE_PATH}`,
      },
    });
    console.log("[scheduler] discovery run:\n" + stdout);
  } catch (err) {
    console.error("[scheduler] discovery run failed:", err);
    await logNotificationFailure("Discovery scraper run", err);
    return; // no point summarizing if the scrape itself failed
  }

  try {
    const log = await generateNotificationSummary();
    console.log("[scheduler] notification summary:", log.summary);
  } catch (err) {
    console.error("[scheduler] notification summary failed:", err);
    await logNotificationFailure("Notification summary", err);
  }

  try {
    const { inserted, skipped } = await scanDocumentDirs();
    console.log(`[scheduler] document scan: ${inserted.length} new, ${skipped} already registered`);
  } catch (err) {
    console.error("[scheduler] document scan failed:", err);
    await logNotificationFailure("Document scan", err);
  }
}

export function startScheduler(cronExpression = "0 8 * * *") {
  cron.schedule(cronExpression, () => {
    runDailyDiscovery().catch((err) => console.error("[scheduler] unexpected error:", err));
  });
  console.log(`[scheduler] daily discovery scheduled: "${cronExpression}"`);
}

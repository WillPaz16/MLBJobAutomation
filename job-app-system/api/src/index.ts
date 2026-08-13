import express from "express";
import cors from "cors";
import { ZodError } from "zod";
import { postingsRouter } from "./routes/postings.js";
import { applicationsRouter } from "./routes/applications.js";
import { documentsRouter } from "./routes/documents.js";
import { analyticsRouter } from "./routes/analytics.js";
import { notificationsRouter } from "./routes/notifications.js";
import { resumeBulletsRouter } from "./routes/resumeBullets.js";
import { tonePresetsRouter } from "./routes/tonePresets.js";
import { orgProfilesRouter } from "./routes/orgProfiles.js";
import { profileRouter } from "./routes/profile.js";
import { savedSearchesRouter } from "./routes/savedSearches.js";
import { HttpError, asyncHandler } from "./asyncHandler.js";
import { runDailyDiscovery, startScheduler } from "./scheduler.js";

export function createApp() {
  const app = express();
  // Origin-allowlisted, NOT wildcard. This used to be a bare `cors()`, which answers
  // `Access-Control-Allow-Origin: *` to every caller. That was harmless while the DB only held
  // public job postings, but ApplicantIdentity stores real PII (date of birth, home address, EEO
  // self-identification) — with a wildcard, any page in any open browser tab could
  // `fetch("http://localhost:4000/api/identity")` and read it with no user gesture at all.
  //
  // Requests with NO Origin header are allowed: that's curl, the tailor-application skill, and the
  // scheduler's in-process calls — none of which are the browser-attack shape. A request that
  // carries an Origin we don't recognize is exactly that shape, and gets no ACAO header back.
  //
  // The UI never actually needs this: Vite proxies /api same-origin in dev (see ui/vite.config.ts),
  // so the allowlist exists for correctness rather than to make the app work.
  const ALLOWED_ORIGINS = new Set(["http://localhost:5173", "http://127.0.0.1:5173"]);
  app.use(
    cors({
      origin: (origin, cb) => cb(null, !origin || ALLOWED_ORIGINS.has(origin)),
      exposedHeaders: ["X-Total-Count", "X-Fit-Cohort-Size"],
    })
  );
  app.use(express.json());

  app.use("/api/postings", postingsRouter);
  app.use("/api/applications", applicationsRouter);
  app.use("/api/documents", documentsRouter);
  app.use("/api/analytics", analyticsRouter);
  app.use("/api/notifications", notificationsRouter);
  app.use("/api/resume-bullets", resumeBulletsRouter);
  app.use("/api/tone-presets", tonePresetsRouter);
  app.use("/api/org-profiles", orgProfilesRouter);
  app.use("/api/profile", profileRouter);
  app.use("/api/saved-searches", savedSearchesRouter);

  app.get("/api/health", (_req, res) => res.json({ ok: true }));

  // Manual trigger for the scheduled discovery job — useful for testing and for running it
  // on demand without waiting for the daily schedule.
  app.post(
    "/api/scheduler/run-now",
    asyncHandler(async (_req, res) => {
      await runDailyDiscovery();
      res.json({ ok: true });
    })
  );

  app.use((req, res) => {
    res.status(404).json({ error: `No route for ${req.method} ${req.path}` });
  });

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof ZodError) {
      return res.status(400).json({ error: "Validation failed", details: err.issues });
    }
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}

if (process.env.NODE_ENV !== "test") {
  const app = createApp();
  const port = process.env.PORT ?? 4000;
  app.listen(port, () => console.log(`API listening on :${port}`));

  startScheduler();
}

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
import { HttpError, asyncHandler } from "./asyncHandler.js";
import { runDailyDiscovery, startScheduler } from "./scheduler.js";

export function createApp() {
  const app = express();
  // exposedHeaders: the dev UI reaches this via Vite's same-origin proxy (no CORS involved there),
  // but a browser fetch from a genuinely cross-origin caller can't read custom response headers
  // like X-Total-Count without this — cheap to set correctly now rather than only working by
  // accident of the current dev setup.
  app.use(cors({ exposedHeaders: ["X-Total-Count"] }));
  app.use(express.json());

  app.use("/api/postings", postingsRouter);
  app.use("/api/applications", applicationsRouter);
  app.use("/api/documents", documentsRouter);
  app.use("/api/analytics", analyticsRouter);
  app.use("/api/notifications", notificationsRouter);
  app.use("/api/resume-bullets", resumeBulletsRouter);
  app.use("/api/tone-presets", tonePresetsRouter);
  app.use("/api/org-profiles", orgProfilesRouter);

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

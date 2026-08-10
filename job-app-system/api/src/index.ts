import express from "express";
import cors from "cors";
import { ZodError } from "zod";
import { postingsRouter } from "./routes/postings.js";
import { applicationsRouter } from "./routes/applications.js";
import { documentsRouter } from "./routes/documents.js";
import { analyticsRouter } from "./routes/analytics.js";
import { notificationsRouter } from "./routes/notifications.js";
import { HttpError } from "./asyncHandler.js";

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.use("/api/postings", postingsRouter);
  app.use("/api/applications", applicationsRouter);
  app.use("/api/documents", documentsRouter);
  app.use("/api/analytics", analyticsRouter);
  app.use("/api/notifications", notificationsRouter);

  app.get("/api/health", (_req, res) => res.json({ ok: true }));

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
}

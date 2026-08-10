import express from "express";
import cors from "cors";
import { postingsRouter } from "./routes/postings.js";
import { applicationsRouter } from "./routes/applications.js";
import { documentsRouter } from "./routes/documents.js";
import { analyticsRouter } from "./routes/analytics.js";
import { notificationsRouter } from "./routes/notifications.js";

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api/postings", postingsRouter);
app.use("/api/applications", applicationsRouter);
app.use("/api/documents", documentsRouter);
app.use("/api/analytics", analyticsRouter);
app.use("/api/notifications", notificationsRouter);

app.get("/api/health", (_req, res) => res.json({ ok: true }));

const port = process.env.PORT ?? 4000;
app.listen(port, () => console.log(`API listening on :${port}`));

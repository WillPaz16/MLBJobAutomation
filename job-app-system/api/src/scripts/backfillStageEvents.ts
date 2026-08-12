// One-off backfill: seed ApplicationStageEvent history for Applications that predate the model.
// Idempotent — an application with >=1 existing event is skipped entirely, so this is always safe
// to re-run. For each such application:
//   1. a seed event {fromStage: null, toStage: "FOUND", createdAt: app.createdAt, source: "backfill"}
//   2. if its current stage isn't "FOUND", a second event
//      {fromStage: "FOUND", toStage: app.stage, createdAt: app.updatedAt, source: "backfill"}
// Run with: npx tsx src/scripts/backfillStageEvents.ts (from api/)
import { prisma } from "../db.js";

async function main() {
  const applications = await prisma.application.findMany({
    include: { _count: { select: { stageEvents: true } } },
  });

  let processed = 0;
  let eventsCreated = 0;

  for (const app of applications) {
    if (app._count.stageEvents > 0) continue;

    await prisma.applicationStageEvent.create({
      data: {
        applicationId: app.id,
        fromStage: null,
        toStage: "FOUND",
        createdAt: app.createdAt,
        source: "backfill",
      },
    });
    eventsCreated++;

    if (app.stage !== "FOUND") {
      await prisma.applicationStageEvent.create({
        data: {
          applicationId: app.id,
          fromStage: "FOUND",
          toStage: app.stage,
          createdAt: app.updatedAt,
          source: "backfill",
        },
      });
      eventsCreated++;
    }

    processed++;
  }

  console.log(`Backfill complete: ${processed} application(s) processed, ${eventsCreated} event(s) created.`);
  console.log(`(${applications.length - processed} application(s) already had events and were skipped.)`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

import { prisma } from "../db.js";

// Starter tone presets — generic voice/structure guidance, safe to seed as defaults.
// Edit the `guidance` text directly (via the API or this script) once you've seen how a
// drafted letter reads and want to tune it.
const TONE_PRESETS = [
  {
    name: "Formal - MLB Front Office",
    guidance:
      "Direct and credential-forward. Open with the specific role and org by name. Lead with " +
      "the most relevant technical/analytical experience first, cite concrete tools/methods " +
      "(not just \"data analysis\" — name the actual stats/models/languages used). Keep to " +
      "~350-400 words. Close by naming one specific thing about the org's approach that drew " +
      "you to this role, not a generic \"I'm passionate about baseball\" line.",
    isDefault: true,
  },
  {
    name: "Direct - Data Science / Startup",
    guidance:
      "More conversational than the MLB tone, but still lead with concrete impact (a metric, a " +
      "shipped result) in the first two sentences. Skip formal salutation flourishes. Keep it " +
      "tight — 250-300 words. It's fine to show personality/voice here in a way the MLB tone " +
      "avoids.",
    isDefault: false,
  },
];

async function main() {
  for (const tone of TONE_PRESETS) {
    await prisma.tonePreset.upsert({
      where: { name: tone.name },
      update: {},
      create: tone,
    });
  }

  const bulletCount = await prisma.resumeBullet.count();

  console.log(`Tone presets ready: ${TONE_PRESETS.length} (upserted, existing ones left untouched).`);
  console.log(`Resume bullets currently in the database: ${bulletCount}.`);
  if (bulletCount === 0) {
    console.log(
      "No resume bullets seeded — that content needs to come from you (see the plan's " +
        "action items). Add them via: POST /api/resume-bullets " +
        '{ "category": "...", "text": "...", "tags": "..." }'
    );
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});

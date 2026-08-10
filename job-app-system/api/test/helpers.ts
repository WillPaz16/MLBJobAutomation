import { prisma } from "../src/db.js";

export async function createSource(name = `test-source-${Math.random()}`, type = "greenhouse") {
  return prisma.source.create({ data: { name, type } });
}

export async function createPosting(overrides: Partial<Parameters<typeof prisma.posting.create>[0]["data"]> = {}) {
  const source = overrides.sourceId ? undefined : await createSource();
  return prisma.posting.create({
    data: {
      sourceId: source?.id ?? (overrides.sourceId as string),
      externalId: overrides.externalId ?? `ext-${Math.random()}`,
      title: overrides.title ?? "Data Scientist, Baseball Analytics",
      organization: overrides.organization ?? "Chicago Cubs",
      location: overrides.location ?? "Chicago, IL",
      category: overrides.category ?? "BASEBALL_ANALYTICS",
      url: overrides.url ?? "https://example.com/job/1",
      ...overrides,
    },
  });
}

export async function createDocument(overrides: Partial<Parameters<typeof prisma.document.create>[0]["data"]> = {}) {
  return prisma.document.create({
    data: {
      kind: overrides.kind ?? "resume",
      label: overrides.label ?? "Test Resume",
      filePath: overrides.filePath ?? "/tmp/resume.pdf",
      ...overrides,
    },
  });
}

export async function createApplication(postingId: string, overrides: Record<string, unknown> = {}) {
  return prisma.application.create({
    data: { postingId, stage: "FOUND", ...overrides },
  });
}

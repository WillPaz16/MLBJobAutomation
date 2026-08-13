import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/index.js";
import { createApplication, createPosting } from "./helpers.js";

const app = createApp();

describe("AnswerSnippet CRUD", () => {
  it("creates, lists, updates, and deletes a snippet", async () => {
    const create = await request(app).post("/api/answers/snippets").send({
      category: "general",
      question: "Why do you want to work here?",
      template: "I'm excited about {{org}} because of {{orgNotes}}.",
    });
    expect(create.status).toBe(201);
    const id = create.body.id;

    const list = await request(app).get("/api/answers/snippets");
    expect(list.status).toBe(200);
    expect(list.body.some((s: { id: string }) => s.id === id)).toBe(true);

    const update = await request(app)
      .patch(`/api/answers/snippets/${id}`)
      .send({ template: "Updated template about {{role}}." });
    expect(update.status).toBe(200);
    expect(update.body.template).toBe("Updated template about {{role}}.");

    const del = await request(app).delete(`/api/answers/snippets/${id}`);
    expect(del.status).toBe(204);
  });
});

describe("AnswerOverride precedence + templating in prep-context/apply-pack", () => {
  it("resolves {{org}}/{{role}}/{{orgNotes}} and reports unknown placeholders as unresolved", async () => {
    const posting = await createPosting({ organization: "Chicago Cubs", title: "Data Analyst" });
    const application = await createApplication(posting.id);

    await request(app)
      .post("/api/answers/snippets")
      .send({
        category: "general",
        question: "Why this team?",
        template: "I want to join {{org}} as a {{role}} because {{orgNotes}} and also {{madeUpPlaceholder}}.",
      });

    const res = await request(app).get(`/api/applications/${application.id}/prep-context`);
    expect(res.status).toBe(200);
    const answer = res.body.resolvedAnswers.find((a: { text: string }) =>
      a.text.includes("Chicago Cubs")
    );
    expect(answer).toBeTruthy();
    expect(answer.text).toContain("Chicago Cubs");
    expect(answer.text).toContain("Data Analyst");
    expect(answer.text).toContain("{{madeUpPlaceholder}}");
    expect(answer.unresolved).toContain("madeUpPlaceholder");
    // orgNotes has no OrgProfile yet, so it's also unresolved and left verbatim
    expect(answer.text).toContain("{{orgNotes}}");
    expect(answer.unresolved).toContain("orgNotes");
  });

  it("an application-specific override takes precedence over its snippet's own template", async () => {
    const posting = await createPosting({ organization: "Boston Red Sox", title: "Analyst" });
    const application = await createApplication(posting.id);

    const snippet = await request(app).post("/api/answers/snippets").send({
      category: "general",
      question: "Why this team?",
      template: "Generic answer about {{org}}.",
    });

    await request(app).post("/api/answers/overrides").send({
      applicationId: application.id,
      questionKey: snippet.body.id,
      answer: "A totally custom answer just for this one application at {{org}}.",
      snippetId: snippet.body.id,
    });

    const res = await request(app).get(`/api/applications/${application.id}/prep-context`);
    expect(res.status).toBe(200);
    const resolved = res.body.resolvedAnswers.find(
      (a: { snippetId: string }) => a.snippetId === snippet.body.id
    );
    expect(resolved.source).toBe("override");
    expect(resolved.text).toContain("A totally custom answer");
    expect(resolved.text).not.toContain("Generic answer");
  });
});

describe("prep-context vs apply-pack sensitivity", () => {
  it("prep-context contains no identity PII fields", async () => {
    const posting = await createPosting();
    const application = await createApplication(posting.id);

    await request(app).put("/api/identity").send({
      legalFirstName: "Will",
      dateOfBirth: "1999-03-14",
      addressStreet: "123 Main St",
      genderIdentityCode: "F",
    });

    const res = await request(app).get(`/api/applications/${application.id}/prep-context`);
    expect(res.status).toBe(200);
    const json = JSON.stringify(res.body);
    expect(json).not.toContain("1999-03-14");
    expect(json).not.toContain("123 Main St");
    expect(res.body.identity).toBeUndefined();
    expect(json.toLowerCase()).not.toContain("dateofbirth");
    expect(json.toLowerCase()).not.toContain("genderidentitycode");
  });

  it("apply-pack DOES return identity fields", async () => {
    const posting = await createPosting();
    const application = await createApplication(posting.id);

    await request(app).put("/api/identity").send({
      legalFirstName: "Will",
      dateOfBirth: "1999-03-14",
    });

    const res = await request(app).get(`/api/applications/${application.id}/apply-pack`);
    expect(res.status).toBe(200);
    expect(res.body.identity.legalFirstName).toBe("Will");
    expect(res.body.identity.dateOfBirth).toBe("1999-03-14");
    expect(res.body.application.id).toBe(application.id);
  });
});

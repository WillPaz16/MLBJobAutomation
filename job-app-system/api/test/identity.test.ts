import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/index.js";

const app = createApp();

describe("ApplicantIdentity singleton", () => {
  it("upserts on PUT and stays a single row across create-then-update", async () => {
    const first = await request(app)
      .put("/api/identity")
      .send({ legalFirstName: "Will", email: "will@example.com" });
    expect(first.status).toBe(200);
    expect(first.body.id).toBe("identity");
    expect(first.body.legalFirstName).toBe("Will");

    const second = await request(app)
      .put("/api/identity")
      .send({ legalFirstName: "William" });
    expect(second.status).toBe(200);
    expect(second.body.legalFirstName).toBe("William");
    // Email from the first PUT should persist since it's an upsert `update`, not a full replace
    // that would null out fields omitted from the second body... actually Prisma `update` only
    // touches keys present in `data`, so email should be untouched here.
    expect(second.body.email).toBe("will@example.com");

    const get = await request(app).get("/api/identity");
    expect(get.status).toBe(200);
    expect(get.body.id).toBe("identity");
    expect(get.body.legalFirstName).toBe("William");
  });

  it("round-trips dateOfBirth as a byte-identical string, unshifted by timezone", async () => {
    const put = await request(app).put("/api/identity").send({ dateOfBirth: "1999-03-14" });
    expect(put.status).toBe(200);
    expect(put.body.dateOfBirth).toBe("1999-03-14");

    const get = await request(app).get("/api/identity");
    expect(get.body.dateOfBirth).toBe("1999-03-14");
  });

  it("treats requiresSponsorship/authorizedToWorkUs null as distinct from false", async () => {
    const put = await request(app)
      .put("/api/identity")
      .send({ requiresSponsorship: null, authorizedToWorkUs: false });
    expect(put.status).toBe(200);
    expect(put.body.requiresSponsorship).toBeNull();
    expect(put.body.authorizedToWorkUs).toBe(false);
  });

  it("stores EEO fields as code + label pairs", async () => {
    const put = await request(app).put("/api/identity").send({
      genderIdentityCode: "F",
      genderIdentityLabel: "Female",
      disabilityStatusCode: "YES",
      disabilityStatusLabel: "Yes, I have a disability (or previously had one)",
    });
    expect(put.status).toBe(200);
    expect(put.body.genderIdentityCode).toBe("F");
    expect(put.body.genderIdentityLabel).toBe("Female");
    expect(put.body.disabilityStatusLabel).toBe(
      "Yes, I have a disability (or previously had one)"
    );
  });

  it("rejects a malformed dateOfBirth", async () => {
    const res = await request(app).put("/api/identity").send({ dateOfBirth: "not-a-date" });
    expect(res.status).toBe(400);
  });
});

describe("EducationEntry", () => {
  it("creates entries and enforces isPrimary exclusivity", async () => {
    const first = await request(app)
      .post("/api/identity/education")
      .send({ school: "State University", degree: "B.S.", isPrimary: true });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post("/api/identity/education")
      .send({ school: "Grad University", degree: "M.S.", isPrimary: true });
    expect(second.status).toBe(201);

    const list = await request(app).get("/api/identity/education");
    expect(list.status).toBe(200);
    const primaries = list.body.filter((e: { isPrimary: boolean }) => e.isPrimary);
    expect(primaries).toHaveLength(1);
    expect(primaries[0].school).toBe("Grad University");
  });

  it("round-trips education dates as plain strings", async () => {
    const res = await request(app).post("/api/identity/education").send({
      school: "State University",
      startDate: "2015-08",
      endDate: "2019-05-14",
    });
    expect(res.status).toBe(201);
    expect(res.body.startDate).toBe("2015-08");
    expect(res.body.endDate).toBe("2019-05-14");
  });

  it("can move isPrimary via PATCH and unsets the sibling", async () => {
    const a = await request(app)
      .post("/api/identity/education")
      .send({ school: "A", isPrimary: true });
    const b = await request(app).post("/api/identity/education").send({ school: "B" });

    const patched = await request(app)
      .patch(`/api/identity/education/${b.body.id}`)
      .send({ isPrimary: true });
    expect(patched.status).toBe(200);
    expect(patched.body.isPrimary).toBe(true);

    const list = await request(app).get("/api/identity/education");
    const aEntry = list.body.find((e: { id: string }) => e.id === a.body.id);
    expect(aEntry.isPrimary).toBe(false);
  });

  it("deletes an entry", async () => {
    const created = await request(app).post("/api/identity/education").send({ school: "Temp" });
    const del = await request(app).delete(`/api/identity/education/${created.body.id}`);
    expect(del.status).toBe(204);
    const get = await request(app).get("/api/identity/education");
    expect(get.body.find((e: { id: string }) => e.id === created.body.id)).toBeUndefined();
  });
});

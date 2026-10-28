import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { createBusinessSchema, updateBusinessSchema } from "../src/types/business";
import { normalizeDomain } from "../src/lib/domain-normalizer";
import { parseAndValidateCsv, validateImportRows, MAX_CSV_SIZE_BYTES } from "../src/lib/csv-parser";
import { publicBusinessError } from "../src/lib/business-error";
import fixture from "./fixtures/business-prisma.cjs";

async function main() {
  // No test may fall through to a real Prisma/Neon connection.
  (globalThis as unknown as { prisma: unknown }).prisma = fixture.client;
  process.env.DATABASE_URL = "postgresql://qa:qa@127.0.0.1:1/never_connect";
  const nodeModule = await import("node:module");
  const hooks = (nodeModule as unknown as { registerHooks: (hooks: { resolve: (specifier: string, context: unknown, next: (specifier: string, context: unknown) => unknown) => unknown }) => { deregister: () => void } }).registerHooks({
    resolve(specifier, context, next) {
      if (specifier === "next/cache") return { url: pathToFileURL(resolve("scripts/fixtures/next-cache.cjs")).href, shortCircuit: true };
      return next(specifier, context);
    },
  });
  const service = await import("../src/lib/services/business-service");
  const dashboard = await import("../src/lib/services/dashboard-service");
  const actions = await import("../src/app/actions/business");
  const api = await import("../src/app/api/businesses/route");
  const { NextRequest } = await import("next/server");
  const env = process.env as Record<string, string | undefined>;
  let passed = 0;
  let failed = 0;
  const test = async (name: string, run: () => unknown) => {
    fixture.reset(); env.NODE_ENV = "development";
    delete env.NEXT_PHASE; delete env.npm_lifecycle_event;
    try { await run(); passed++; console.log(`PASS ${name}`); }
    catch (error) { failed++; console.error(`FAIL ${name}: ${error instanceof Error ? error.message : "unknown"}`); }
  };
  const input = { name: "QA Test", websiteUrl: "https://www.qa.example/Path", industry: "Quán cà phê", city: "Huế", dataSource: "Manual QA" };
  const csvRow = { ...input, rowNumber: 2, normalizedDomain: "untrusted.example", dataSource: "spoofed" };
  const writes = () => fixture.state.calls.filter((call) => ["create", "update", "createManyAndReturn"].includes(call.method)).length;
  const req = (method: string, body?: unknown, query = "", headers: Record<string, string> = {}) => new NextRequest(`http://127.0.0.1:3101/api/businesses${query}`, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }), headers: { "content-type": "application/json", ...headers } });

  for (const mode of ["production", "test", undefined]) await test(`deny ${mode ?? 'unset'} even with build environment`, () => {
    if (mode) env.NODE_ENV = mode; else delete env.NODE_ENV;
    env.NEXT_PHASE = "phase-production-build"; env.npm_lifecycle_event = "build";
    assert.throws(service.enforceDevOnly, { statusCode: 403 }); assert.equal(fixture.state.calls.length, 0);
  });
  await test("development gate allows", () => service.enforceDevOnly());
  await test("all direct actions reject production before any Prisma call", async () => {
    env.NODE_ENV = "production"; env.npm_lifecycle_event = "build";
    for (const result of [await actions.createBusinessAction(input), await actions.updateBusinessAction({ id: "qa-1", name: "Changed" }), await actions.importCsvAction([csvRow]), await actions.validateCsvAction("")]) assert.equal(result.code, 403);
    await assert.rejects(actions.fetchBusinessesAction(), { statusCode: 403 });
    await assert.rejects(actions.fetchBusinessByIdAction("qa-1"), { statusCode: 403 });
    assert.equal(fixture.state.calls.length, 0);
  });
  await test("production API GET and POST deny even build flags", async () => {
    env.NODE_ENV = "production"; env.NEXT_PHASE = "phase-production-build";
    assert.equal((await api.GET(req("GET"))).status, 403);
    assert.equal((await api.POST(req("POST", input))).status, 403); assert.equal(writes(), 0);
  });
  for (const website of ["not a url", "javascript:alert(1)", "ftp://example.com", "https://user:password@example.com", "https://bad..example", "https://-bad.example", "https://example.com:99999", "localhost", "https://example.com\\@evil.example"]) await test(`reject malformed website ${website.split(':')[0]}`, () => {
    assert.equal(normalizeDomain(website), ""); assert.equal(createBusinessSchema.safeParse({ ...input, websiteUrl: website }).success, false);
  });
  await test("canonical domain retains path case and collapses trailing dot", () => {
    const parsed = createBusinessSchema.parse({ ...input, websiteUrl: "HTTPS://WWW.QA.EXAMPLE./Path" });
    assert.equal(normalizeDomain(parsed.websiteUrl), "qa.example"); assert.equal(parsed.websiteUrl, "https://www.qa.example/Path");
  });
  await test("create normalizes and serializes", async () => { const row = await service.createBusiness(input); assert.equal(row.normalizedDomain, "qa.example"); assert.equal(typeof row.createdAt, "string"); assert.equal(row.opportunityScore, null); });
  await test("create rejects duplicate without second write", async () => { await service.createBusiness(input); await assert.rejects(service.createBusiness({ ...input, websiteUrl: "qa.example/Other" }), { statusCode: 409 }); assert.equal(writes(), 1); });
  await test("invalid create action validates server-side", async () => { const result = await actions.createBusinessAction({ ...input, name: "" }); assert.equal(result.code, 400); assert.equal(writes(), 0); });
  await test("successful create action uses mock storage", async () => { const result = await actions.createBusinessAction(input); assert.equal(result.success, true); assert.equal(writes(), 1); });
  await test("update preserves omitted city and source", async () => { const row = await service.createBusiness(input); const updated = await service.updateBusiness({ id: row.id, name: "Changed" }); assert.equal(updated.city, "Huế"); assert.equal(updated.dataSource, "Manual QA"); });
  await test("partial schema has no hidden create defaults", () => { assert.deepEqual(updateBusinessSchema.parse({ id: "qa-1", name: "New" }), { id: "qa-1", name: "New" }); });
  await test("update domain and empty email", async () => { const row = await service.createBusiness(input); const updated = await service.updateBusiness({ id: row.id, websiteUrl: "updated.example", email: "" }); assert.equal(updated.normalizedDomain, "updated.example"); assert.equal(updated.websiteUrl, "https://updated.example/"); });
  await test("missing update rejected", async () => { await assert.rejects(service.updateBusiness({ id: "missing", name: "New" }), { statusCode: 404 }); assert.equal(writes(), 0); });
  await test("update duplicate cannot overwrite", async () => { const first = await service.createBusiness(input); await service.createBusiness({ ...input, websiteUrl: "other.example" }); await assert.rejects(service.updateBusiness({ id: first.id, websiteUrl: "other.example" }), { statusCode: 409 }); assert.equal(fixture.state.rows[0].normalizedDomain, "qa.example"); });
  await test("concurrent create unique conflict returns 409 through action", async () => { fixture.state.races.add("qa.example"); assert.equal((await actions.createBusinessAction(input)).code, 409); assert.equal(fixture.state.rows.length, 0); });
  await test("concurrent update conflict returns 409 through action", async () => { const row = await service.createBusiness(input); fixture.state.races.add("other.example"); assert.equal((await actions.updateBusinessAction({ id: row.id, websiteUrl: "other.example" })).code, 409); assert.equal(fixture.state.rows[0].normalizedDomain, "qa.example"); });
  await test("search and all filters combine without a cycle", async () => { fixture.seed(); const result = await service.getBusinesses({ search: "qa-1", area: "Đà Nẵng", sector: "Quán cà phê", status: "NEW_DISCOVERED" }); assert.equal(result.total, 3); assert.equal(result.items.length, 3); JSON.stringify(fixture.state.calls); });
  await test("server pagination has stable ordering", async () => { fixture.seed(); const first = await service.getBusinesses({ page: 1, limit: 10 }); const second = await service.getBusinesses({ page: 2, limit: 10 }); assert.equal(first.total, 14); assert.equal(second.items.length, 4); assert.ok(second.items.every((row) => !first.items.some((other) => other.id === row.id))); assert.equal(second.totalPages, 2); });
  await test("empty search is distinct from a query failure", async () => { const result = await service.getBusinesses({ search: "absent" }); assert.equal(result.total, 0); fixture.state.failure = true; await assert.rejects(service.getBusinesses(), { statusCode: 503 }); });
  await test("QUALIFIED does not claim customer interest", async () => { const row = await service.createBusiness(input); await service.updateBusiness({ id: row.id, leadStatus: "QUALIFIED" }); assert.equal((await service.getBusinesses()).stats.inDiscussionCount, 0); });
  for (const query of [{ page: NaN }, { page: 1.5 }, { page: -1 }, { limit: 1000 }, { status: "UNKNOWN" }, { search: "x".repeat(201) }]) await test("reject invalid query before Prisma", async () => { await assert.rejects(service.getBusinesses(query)); assert.equal(fixture.state.calls.length, 0); });
  await test("CSV multiline/escaped quotes/CRLF/BOM", () => { const result = parseAndValidateCsv('\uFEFFname,website,notes\r\n"QA, ""Coffee""",qa.example,"line one\r\nline two"'); assert.equal(result.validCount, 1); assert.equal(result.invalidCount, 0); assert.equal(result.validRows[0].notes, "line one\nline two"); });
  for (const content of ['name,website\n"QA,qa.example', 'name,website\nQA"bad,qa.example', 'name,website\n"QA"bad,qa.example', 'name,website,url\nQA,qa.example,other.example']) await test("CSV rejects malformed structure", () => assert.equal(parseAndValidateCsv(content).validCount, 0));
  await test("CSV errors count rows not individual fields", () => { const result = parseAndValidateCsv('name,website,email\nA,not a url,bad'); assert.equal(result.invalidCount, 1); assert.ok(result.errors.length >= 3); });
  await test("CSV invalid row does not poison following valid duplicate", () => { const result = parseAndValidateCsv('name,website\nA,qa.example\nValid,qa.example'); assert.equal(result.validCount, 1); assert.equal(result.validRows[0].rowNumber, 3); });
  await test("CSV physical line numbers preserved", () => { const result = parseAndValidateCsv('name,website\n\nValid,qa.example\nDup,www.qa.example'); assert.equal(result.errors[0].rowNumber, 4); assert.match(result.errors[0].message, /dòng 3/); });
  await test("CSV byte cap", () => assert.equal(parseAndValidateCsv("x".repeat(MAX_CSV_SIZE_BYTES + 1)).validCount, 0));
  await test("CSV row cap and confirmation row cap", () => { const content = "name,website\n" + Array.from({ length: 201 }, (_, i) => `QA ${i},qa${i}.example`).join("\n"); assert.equal(parseAndValidateCsv(content).validCount, 0); assert.throws(() => validateImportRows(Array.from({ length: 201 }, () => csvRow))); });
  await test("confirmation rejects oversized serialized data", () => { assert.throws(() => validateImportRows([{ ...csvRow, ignored: "x".repeat(MAX_CSV_SIZE_BYTES) }]), { statusCode: 413 }); });
  await test("confirmation rejects forged invalid rows without writes", async () => { const result = await actions.importCsvAction([{ ...csvRow, name: "", websiteUrl: "javascript:alert(1)" }]); assert.equal(result.code, 400); assert.equal(writes(), 0); });
  await test("confirmation derives domain and source, ignoring forged values", async () => { const result = await service.importBusinessesBatch([csvRow]); assert.equal(result.importedCount, 1); assert.equal(fixture.state.rows[0].normalizedDomain, "qa.example"); assert.equal(fixture.state.rows[0].dataSource, "CSV_IMPORT"); });
  await test("import skips existing and within-batch duplicates", async () => { await service.createBusiness(input); const result = await service.importBusinessesBatch([csvRow, { ...csvRow, rowNumber: 3, websiteUrl: "new.example" }, { ...csvRow, rowNumber: 4, websiteUrl: "www.new.example" }]); assert.equal(result.importedCount, 1); assert.equal(result.skippedCount, 2); assert.equal(fixture.state.rows[0].name, input.name); });
  await test("import concurrent duplicate is skipped atomically", async () => { fixture.state.races.add("qa.example"); const result = await actions.importCsvAction([csvRow, { ...csvRow, rowNumber: 3, websiteUrl: "new.example" }]); assert.equal(result.success, true); assert.equal(result.importedCount, 1); assert.equal(result.skippedCount, 1); assert.equal(fixture.state.calls.filter((call) => call.method === "createManyAndReturn").length, 1); });
  await test("preview checks mock DB duplicates but never writes", async () => { await service.createBusiness(input); fixture.state.calls = []; const result = await actions.validateCsvAction('name,website\nQA,qa.example'); assert.equal(result.result?.validCount, 0); assert.equal(result.result?.invalidCount, 1); assert.equal(writes(), 0); });
  await test("driver failures do not leak details via API/actions", async () => { fixture.state.failure = true; const response = await api.GET(req("GET")); assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /sensitive-driver-detail/); const result = await actions.createBusinessAction(input); assert.equal(result.code, 503); assert.doesNotMatch(result.error!, /sensitive-driver-detail/); });
  await test("API valid create uses mock and invalid JSON is rejected", async () => { assert.equal((await api.POST(req("POST", input))).status, 201); const bad = new NextRequest("http://127.0.0.1:3101/api/businesses", { method: "POST", body: "{", headers: { "content-type": "application/json" } }); assert.equal((await api.POST(bad)).status, 400); });
  await test("API cross-origin and text bodies rejected", async () => { assert.equal((await api.POST(req("POST", input, "", { origin: "https://untrusted.example" }))).status, 403); assert.equal((await api.POST(req("POST", input, "", { "content-type": "text/plain" }))).status, 415); assert.equal(writes(), 0); });
  await test("API limits actual body bytes", async () => { assert.equal((await api.POST(req("POST", { notes: "x".repeat(65537) }))).status, 413); assert.equal(writes(), 0); });
  await test("API invalid query status and fractional page return 400", async () => { assert.equal((await api.GET(req("GET", undefined, "?page=1.5"))).status, 400); assert.equal((await api.GET(req("GET", undefined, "?status=UNKNOWN"))).status, 400); });
  await test("DB uniqueness exists in unchanged schema and migration", () => { assert.match(readFileSync("prisma/schema.prisma", "utf8"), /normalizedDomain\s+String\s+@unique/); assert.match(readFileSync("prisma/migrations/20261027000000_init/migration.sql", "utf8"), /CREATE UNIQUE INDEX "businesses_normalizedDomain_key"/); });
  await test("unknown errors are generic", () => assert.equal(publicBusinessError(new Error("secret connection detail")).status, 503));
  await test("dashboard reads Business counts and leaves unimplemented metrics unknown", async () => {
    fixture.seed();
    const data = await dashboard.getDashboardData();
    assert.equal(data.total, 14); assert.equal(data.items.length, 4);
    assert.equal(data.prepared, null); assert.equal(data.replies, null); assert.equal(writes(), 0);
  });
  await test("dashboard denies production before querying", async () => {
    env.NODE_ENV = "production";
    await assert.rejects(dashboard.getDashboardData(), { statusCode: 403 });
    assert.equal(fixture.state.calls.length, 0);
  });
  await test("dashboard storage failure cannot become zero metrics", async () => {
    fixture.state.failure = true; await assert.rejects(dashboard.getDashboardData());
  });
  hooks.deregister();
  console.log(`Regression tests (MOCK PRISMA, NO NEON): ${passed} passed; ${failed} failed.`);
  process.exitCode = failed ? 1 : 0;
}
main().catch((error) => { console.error("Regression harness failed before completion; no PASS claim.", error); process.exitCode = 1; });


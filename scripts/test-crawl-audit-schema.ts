import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const schema = fs.readFileSync(path.join(process.cwd(), "prisma/schema.prisma"), "utf8");
const migrationPath = path.join(process.cwd(), "prisma/migrations/20261029000000_crawl_audit_persistence/migration.sql");
const sql = fs.readFileSync(migrationPath, "utf8");

function model(name: string): string {
  const match = schema.match(new RegExp("model " + name + " \\{([\\s\\S]*?)\\n\\}"));
  assert.ok(match, "schema includes " + name);
  return match[1];
}

function enumBlock(name: string): string {
  const match = schema.match(new RegExp("enum " + name + " \\{([\\s\\S]*?)\\n\\}"));
  assert.ok(match, "schema includes " + name);
  return match[1];
}

assert.deepEqual(
  enumBlock("FindingStatus").trim().split(/\s+/),
  ["PENDING", "CONFIRMED", "REJECTED"],
  "legacy verification enum remains unchanged",
);

const expectedEnums = [
  ["CrawlAuditRunStatus", ["PENDING", "RUNNING", "COMPLETED", "PARTIAL", "FAILED", "CANCELLED", "BLOCKED"]],
  ["CrawlUrlStatus", ["SCANNED", "FAILED"]],
  ["CrawlFindingResultStatus", ["PASS", "FAIL", "REVIEW_REQUIRED", "UNKNOWN"]],
] as const;
for (const [name, values] of expectedEnums) {
  assert.deepEqual(enumBlock(name).trim().split(/\s+/), values, name + " has the independent crawl states");
}

const run = model("CrawlAuditRun");
const url = model("CrawlScannedUrl");
const finding = model("CrawlAuditFinding");
const occurrence = model("CrawlFindingOccurrence");
const verification = model("CrawlFindingVerification");

assert.match(schema, /crawlAuditRuns\s+CrawlAuditRun\[\]/, "Business owns audit runs");
assert.match(schema, /crawlFindingVerifications\s+CrawlFindingVerification\[\]/, "User is the verification actor");
assert.match(run, /business\s+Business\s+@relation\(fields:\s*\[businessId\],\s*references:\s*\[id\],\s*onDelete:\s*Restrict\)/);
assert.match(run, /@@unique\(\[businessId,\s*idempotencyKey\]\)/);
assert.match(run, /@@index\(\[businessId,\s*startedAt\(sort:\s*Desc\)\]\)/);
assert.match(run, /@@index\(\[status,\s*startedAt\]\)/);
for (const field of ["requestedUrlLimit", "depthLimit", "concurrencyLimit", "discoveredCount", "eligibleCount", "queuedCount", "attemptedCount", "succeededCount", "failedCount", "skippedRobotsCount", "skippedDepthCount", "skippedCandidateLimitCount", "skippedScopeCount", "remainingCount", "limitReached", "discoveryTruncated", "downloadedBytes", "stopReasonCode", "scannerVersion", "rulesetVersion", "urlFingerprintKeyVersion", "comparisonKeyVersion"]) {
  assert.match(run, new RegExp("\\b" + field + "\\b"), "run snapshots " + field);
}

assert.match(url, /urlFingerprint\s+String\s+@db\.VarChar\(64\)/);
assert.match(url, /sanitizedUrl\s+String\s+@db\.VarChar\(2048\)/);
assert.match(url, /@@unique\(\[runId,\s*id\]\)/, "URL is a composite same-run FK target");
assert.match(url, /@@unique\(\[runId,\s*urlFingerprint\]\)/, "URL attempts are idempotent within a run");
assert.match(finding, /comparisonKey\s+String\s+@db\.VarChar\(160\)/);
assert.match(finding, /findingKey\s+String\s+@db\.VarChar\(200\)/);
assert.match(finding, /@@unique\(\[runId,\s*id\]\)/, "finding is a composite same-run FK target");
assert.match(finding, /@@unique\(\[runId,\s*findingKey\]\)/, "grouping key is unique within a run");
assert.match(finding, /resultStatus\s+CrawlFindingResultStatus/);
assert.doesNotMatch(finding, /\bverifiedAt\b|\bverifiedByUserId\b/, "scanner result rows do not carry mutable legacy verification state");

assert.match(occurrence, /finding\s+CrawlAuditFinding\s+@relation\(fields:\s*\[runId,\s*findingId\],\s*references:\s*\[runId,\s*id\],\s*onDelete:\s*Restrict\)/);
assert.match(occurrence, /scannedUrl\s+CrawlScannedUrl\s+@relation\(fields:\s*\[runId,\s*scannedUrlId\],\s*references:\s*\[runId,\s*id\],\s*onDelete:\s*Restrict\)/);
assert.match(occurrence, /@@unique\(\[runId,\s*findingId,\s*scannedUrlId\]\)/);
assert.match(occurrence, /evidence\s+String\s+@db\.VarChar\(8000\)/);

assert.match(verification, /status\s+FindingStatus/);
assert.match(verification, /actorUserId\s+String\s*$/m, "verification requires an authenticated User ID");
assert.match(verification, /actorUser\s+User\s+@relation\(fields:\s*\[actorUserId\],\s*references:\s*\[id\],\s*onDelete:\s*Restrict\)/);
assert.match(verification, /finding\s+CrawlAuditFinding\s+@relation\(fields:\s*\[runId,\s*findingId\],\s*references:\s*\[runId,\s*id\],\s*onDelete:\s*Restrict\)/);
assert.doesNotMatch([run, url, finding, occurrence, verification].join("\n"), /\b(rawHtml|rawHeaders|cookies|authorizationHeader|responseHeaders)\b/i, "new models exclude raw pages and secret-bearing headers");

const expectedTables = ["crawl_audit_runs", "crawl_scanned_urls", "crawl_audit_findings", "crawl_finding_occurrences", "crawl_finding_verifications"];
const createdTables = [...sql.matchAll(/CREATE TABLE "([^"]+)"/g)].map((match) => match[1]);
assert.deepEqual(createdTables, expectedTables, "draft creates exactly the five crawl tables");
const createdEnums = [...sql.matchAll(/CREATE TYPE "([^"]+)"/g)].map((match) => match[1]);
assert.deepEqual(createdEnums, ["CrawlAuditRunStatus", "CrawlUrlStatus", "CrawlFindingResultStatus"], "draft adds only crawl-specific enums");
for (const name of expectedTables) {
  assert.match(sql, new RegExp('CREATE TABLE "' + name + '"'), "migration creates " + name);
}
assert.match(sql, /FOREIGN KEY \("runId", "findingId"\) REFERENCES "crawl_audit_findings"\("runId", "id"\)/);
assert.match(sql, /FOREIGN KEY \("runId", "scannedUrlId"\) REFERENCES "crawl_scanned_urls"\("runId", "id"\)/);
assert.match(sql, /FOREIGN KEY \("actorUserId"\) REFERENCES "users"\("id"\) ON DELETE RESTRICT/);
assert.match(sql, /requested_url_limit_check/);
assert.match(sql, /crawl_audit_runs_lifecycle_check/);
assert.match(sql, /crawl_scanned_urls_fingerprint_check/);
assert.doesNotMatch(sql, /ON DELETE CASCADE/i, "the draft has no cascade-delete path through audit history");

const statements = sql
  .replace(/^--.*$/gm, "")
  .split(";")
  .map((statement) => statement.trim())
  .filter(Boolean);
for (const statement of statements) {
  assert.match(
    statement,
    /^(CREATE TYPE "CrawlAuditRunStatus"|CREATE TYPE "CrawlUrlStatus"|CREATE TYPE "CrawlFindingResultStatus"|CREATE TABLE "crawl_[^"]+"|CREATE (?:UNIQUE )?INDEX "crawl_[^"]+"|ALTER TABLE "crawl_[^"]+"\s+ADD CONSTRAINT\b)/i,
    "migration contains only additive crawl DDL: " + statement.slice(0, 100),
  );
}
assert.doesNotMatch(sql.replace(/^--.*$/gm, ""), /^\s*(DROP|TRUNCATE|DELETE|UPDATE|INSERT|CREATE\s+TRIGGER)\b/im, "draft contains no destructive/DML/retention statement");
assert.doesNotMatch(sql, /pg_cron|retention|auto.?purge/i, "no automatic retention purge is enabled");

console.log("PASS crawl audit schema models, independent result/verification state, bounded evidence, and same-run composite relations");
console.log("PASS offline migration is additive-only, preserves legacy audit objects, and has no cascade or retention deletion");

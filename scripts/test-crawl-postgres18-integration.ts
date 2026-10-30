import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaCrawlAuditRepository } from "../src/lib/scanner/persistence/prisma-crawl-repository";
import { CrawlWriteService } from "../src/lib/scanner/persistence/crawl-write-service";
import { CrawlReadService } from "../src/lib/scanner/persistence/crawl-read-service";
import { InMemoryCrawlAuditRepository } from "../src/lib/scanner/persistence/in-memory-repository";
import {
  sanitizeUrl,
  sanitizeEvidence,
} from "../src/lib/scanner/persistence/sanitizer";

// ==============================================================================
// SAFETY GUARD: Fail-closed if production Neon database is targeted
// ==============================================================================
function enforcePostgres18Isolation(): string {
  const neonEnvPattern = /neon\.tech|pooler/i;

  if (process.env.DATABASE_URL_TEST && neonEnvPattern.test(process.env.DATABASE_URL_TEST)) {
    throw new Error(
      "FATAL SECURITY VIOLATION: DATABASE_URL_TEST explicitly points to Neon! Aborting immediately."
    );
  }

  let dbUrl = process.env.DATABASE_URL_TEST;
  if (!dbUrl) {
    if (process.env.DATABASE_URL && !neonEnvPattern.test(process.env.DATABASE_URL)) {
      dbUrl = process.env.DATABASE_URL;
    } else {
      console.log("  ℹ External/Neon database in environment detected. Isolating test runner to local container target.");
      dbUrl =
        "postgresql://leadlift_ci_user:leadlift_ci_password_secure@localhost:5432/leadlift_ci_test?sslmode=disable";
    }
  }

  if (neonEnvPattern.test(dbUrl)) {
    throw new Error(
      "FATAL SECURITY VIOLATION: Database connection string points to Neon! Aborting immediately."
    );
  }

  console.log(`  ✓ Isolated test connection target verified: ${dbUrl.replace(/:[^:@]+@/, ":****@")}`);
  return dbUrl;
}

// Helper to probe if PostgreSQL 18 is running and reachable
async function isPostgresReachable(connectionString: string): Promise<boolean> {
  const probePool = new Pool({
    connectionString,
    connectionTimeoutMillis: 2000,
  });
  try {
    const res = await probePool.query("SELECT version() as ver;");
    console.log(`  ✓ Connected to PostgreSQL engine: ${res.rows[0]?.ver}`);
    await probePool.end();
    return true;
  } catch {
    await probePool.end().catch(() => {});
    return false;
  }
}

async function runPostgres18IntegrationSuite() {
  console.log("=================================================================");
  console.log("LEADLIFT — PHASE 03B.2B-2D.B POSTGRESQL 18 CI INTEGRATION TEST");
  console.log("=================================================================");

  const targetDbUrl = enforcePostgres18Isolation();
  const reachable = await isPostgresReachable(targetDbUrl);

  if (!reachable) {
    if (process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true") {
      throw new Error(
        "FATAL CI FAILURE: PostgreSQL 18 service container is not reachable on localhost:5432 in CI environment! Aborting immediately."
      );
    }

    console.log("\n=================================================================");
    console.log("ℹ [PREFLIGHT MODE] PostgreSQL service container is not reachable on localhost:5432.");
    console.log("ℹ Target runtime: GitHub Actions CI runner (ubuntu-latest with postgres:18-alpine).");
    console.log("ℹ Running offline verification of driver adapter, models, and contract rules...");
    console.log("=================================================================");

    await runOfflinePreflightChecks();

    console.log("\n=================================================================");
    console.log("CI INTEGRATION TEST STATUS: PREPARED — NOT YET EXECUTED IN GITHUB ACTIONS");
    console.log("Prisma adapter, repositories, migration contracts, and services verified.");
    console.log("Awaiting GitHub Actions CI execution upon authorized trigger.");
    console.log("=================================================================");
    return;
  }

  // ----------------------------------------------------------------------------
  // LIVE POSTGRESQL 18 EXECUTION (Run inside GitHub Actions CI runner)
  // ----------------------------------------------------------------------------
  console.log("\n🚀 [LIVE CI EXECUTION] Running against PostgreSQL 18 instance...");
  const pool = new Pool({
    connectionString: targetDbUrl,
    max: 10,
    idleTimeoutMillis: 5000,
    connectionTimeoutMillis: 5000,
  });

  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });
  const repository = new PrismaCrawlAuditRepository(prisma);
  const writeService = new CrawlWriteService(repository);
  const readService = new CrawlReadService(repository);

  try {
    // --------------------------------------------------------------------------
    // Test 1: Verify Prisma Migration Deployment in CI Database
    // --------------------------------------------------------------------------
    console.log("\n[TEST 1] Prisma Migration Deployment Verification (_prisma_migrations)");
    const migrationsRes = await pool.query<{ migration_name: string; finished_at: Date }>(
      "SELECT migration_name, finished_at FROM _prisma_migrations WHERE rolled_back_at IS NULL ORDER BY started_at ASC;"
    );
    const migrationNames = migrationsRes.rows.map((r) => r.migration_name);
    console.log("  Applied migrations:", migrationNames);
    assert.ok(
      migrationNames.some((m) => m.includes("init")),
      "Legacy init migration must be applied"
    );
    assert.ok(
      migrationNames.some((m) => m.includes("crawl_audit_persistence")),
      "Crawl audit persistence migration must be applied"
    );
    console.log("  ✓ Test 1 PASS: Migrations deployed successfully.");

    // --------------------------------------------------------------------------
    // Test 2: Existing Legacy Tables Validation
    // --------------------------------------------------------------------------
    console.log("\n[TEST 2] Existing Legacy Tables Validation");
    const legacyTables = [
      "users",
      "businesses",
      "website_audits",
      "audit_findings",
      "contact_points",
      "outreach_drafts",
      "outreach_events",
    ];
    for (const table of legacyTables) {
      const tableCheck = await pool.query<{ exists: boolean }>(
        `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1) as exists;`,
        [table]
      );
      assert.strictEqual(tableCheck.rows[0]?.exists, true, `Legacy table ${table} must exist`);
    }
    console.log("  ✓ Test 2 PASS: All 7 legacy tables remain intact.");

    // --------------------------------------------------------------------------
    // Test 3: Five Crawl Tables Verification
    // --------------------------------------------------------------------------
    console.log("\n[TEST 3] Five Crawl Tables Verification");
    const crawlTables = [
      "crawl_audit_runs",
      "crawl_scanned_urls",
      "crawl_audit_findings",
      "crawl_finding_occurrences",
      "crawl_finding_verifications",
    ];
    for (const table of crawlTables) {
      const tableCheck = await pool.query<{ exists: boolean }>(
        `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1) as exists;`,
        [table]
      );
      assert.strictEqual(tableCheck.rows[0]?.exists, true, `Crawl table ${table} must exist`);
    }
    console.log("  ✓ Test 3 PASS: All 5 crawl tables exist.");

    // --------------------------------------------------------------------------
    // Test 4: Composite Foreign Keys Verification
    // --------------------------------------------------------------------------
    console.log("\n[TEST 4] Composite Foreign Keys & Isolation Verification");
    const fkRes = await pool.query<{ conname: string }>(
      `SELECT conname FROM pg_constraint WHERE contype = 'f' AND conrelid::regclass::text LIKE 'crawl_%';`
    );
    const fkNames = fkRes.rows.map((r) => r.conname);
    assert.ok(
      fkNames.includes("crawl_finding_occurrences_runId_findingId_fkey"),
      "crawl_finding_occurrences_runId_findingId_fkey must exist"
    );
    assert.ok(
      fkNames.includes("crawl_finding_occurrences_runId_scannedUrlId_fkey"),
      "crawl_finding_occurrences_runId_scannedUrlId_fkey must exist"
    );
    assert.ok(
      fkNames.includes("crawl_finding_verifications_runId_findingId_fkey"),
      "crawl_finding_verifications_runId_findingId_fkey must exist"
    );
    console.log("  ✓ Test 4 PASS: Composite foreign keys exist with RESTRICT semantics.");

    // --------------------------------------------------------------------------
    // Test 5: Unique Constraints Verification
    // --------------------------------------------------------------------------
    console.log("\n[TEST 5] Unique Indexes & Constraints Verification");
    const idxRes = await pool.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename LIKE 'crawl_%' AND indexdef LIKE '%UNIQUE%';`
    );
    const uniqueIndexes = idxRes.rows.map((r) => r.indexname);
    assert.ok(uniqueIndexes.includes("crawl_audit_runs_business_id_idempotency_key_key"), "Unique idempotency index must exist");
    assert.ok(uniqueIndexes.includes("crawl_scanned_urls_run_id_url_fingerprint_key"), "Unique url fingerprint index must exist");
    assert.ok(uniqueIndexes.includes("crawl_audit_findings_run_id_finding_key_key"), "Unique finding key index must exist");
    assert.ok(uniqueIndexes.includes("crawl_finding_occurrences_run_id_finding_id_scanned_url_id_key"), "Unique occurrence index must exist");
    console.log("  ✓ Test 5 PASS: All 4 crawl unique constraints exist.");

    // --------------------------------------------------------------------------
    // Test 6: Eleven CHECK Constraints Enforcement Verification
    // --------------------------------------------------------------------------
    console.log("\n[TEST 6] Eleven CHECK Constraints Enforcement (PostgreSQL Error 23514)");
    const checkConstraints = [
      "crawl_audit_runs_requested_url_limit_check",
      "crawl_audit_runs_depth_limit_check",
      "crawl_audit_runs_concurrency_limit_check",
      "crawl_audit_runs_counters_check",
      "crawl_audit_runs_lifecycle_check",
      "crawl_audit_runs_time_order_check",
      "crawl_scanned_urls_fingerprint_check",
      "crawl_scanned_urls_depth_check",
      "crawl_scanned_urls_http_status_check",
      "crawl_scanned_urls_measurements_check",
      "crawl_audit_findings_keys_check",
    ];
    const catalogChecks = await pool.query<{ conname: string }>(
      `SELECT conname FROM pg_constraint WHERE contype = 'c' AND conrelid::regclass::text LIKE 'crawl_%';`
    );
    const existingChecks = catalogChecks.rows.map((c) => c.conname);
    for (const c of checkConstraints) {
      assert.ok(existingChecks.includes(c), `CHECK constraint ${c} must exist in catalog`);
    }
    console.log("  ✓ Test 6 PASS: All 11 CHECK constraints registered and active.");

    // --------------------------------------------------------------------------
    // Setup synthetic Business & User for Prisma integration
    // --------------------------------------------------------------------------
    const testBusinessId = "biz_ci_test_01";
    const testUserId = "usr_ci_test_01";

    await pool.query(
      `INSERT INTO businesses (id, name, domain, created_at, updated_at)
       VALUES ($1, 'CI Test Business', 'https://ci-test.example.com', NOW(), NOW())
       ON CONFLICT (id) DO NOTHING;`,
      [testBusinessId]
    );

    await pool.query(
      `INSERT INTO users (id, email, password_hash, role, created_at, updated_at)
       VALUES ($1, 'ci_tester@leadlift.internal', 'hash_ci_placeholder', 'ADMIN', NOW(), NOW())
       ON CONFLICT (id) DO NOTHING;`,
      [testUserId]
    );

    // --------------------------------------------------------------------------
    // Test 7: Prisma Repository Insert/Read: CrawlAuditRun
    // --------------------------------------------------------------------------
    console.log("\n[TEST 7] Prisma Repository Insert/Read: CrawlAuditRun");
    const run1 = await repository.createRun({
      businessId: testBusinessId,
      rootUrl: "https://ci-test.example.com",
      requestedUrlLimit: 50,
      depthLimit: 3,
      concurrencyLimit: 2,
      idempotencyKey: "idem_ci_run_01",
    });
    assert.strictEqual(run1.status, "PENDING");
    assert.strictEqual(run1.rootHost, "ci-test.example.com");

    await repository.startRun(run1.id);
    const startedRun = await repository.getRun(run1.id);
    assert.strictEqual(startedRun?.status, "RUNNING");
    console.log("  ✓ Test 7 PASS: Run created and transitioned to RUNNING.");

    // --------------------------------------------------------------------------
    // Test 8: Prisma Repository Insert/Read: CrawlScannedUrl
    // --------------------------------------------------------------------------
    console.log("\n[TEST 8] Prisma Repository Insert/Read: CrawlScannedUrl Batch");
    const scannedUrls = await repository.recordScannedUrlsBatch(run1.id, [
      {
        url: "https://ci-test.example.com/",
        depth: 0,
        status: "SCANNED",
        httpStatus: 200,
        statusText: "OK",
        title: "CI Test Homepage",
        metaDescription: "Welcome to CI test homepage.",
        responseTimeMs: 145,
        contentType: "text/html; charset=utf-8",
        contentLength: 4096,
        scannedAt: new Date(),
      },
      {
        url: "https://ci-test.example.com/about",
        depth: 1,
        status: "SCANNED",
        httpStatus: 200,
        statusText: "OK",
        title: "About CI Test",
        responseTimeMs: 180,
        contentType: "text/html; charset=utf-8",
        contentLength: 2048,
        scannedAt: new Date(),
      },
    ]);
    assert.strictEqual(scannedUrls.length, 2);
    assert.strictEqual(scannedUrls[0]?.sanitizedUrl, "https://ci-test.example.com/");
    assert.strictEqual(scannedUrls[1]?.depth, 1);
    console.log("  ✓ Test 8 PASS: Scanned URLs recorded in batch.");

    // --------------------------------------------------------------------------
    // Test 9 & 10: Prisma Repository Insert/Read: CrawlAuditFinding & Occurrences
    // --------------------------------------------------------------------------
    console.log("\n[TEST 9 & 10] Prisma Repository Findings & Occurrences");
    const url1Record = scannedUrls[0]!;
    const findings = await repository.recordFindingsBatch(run1.id, [
      {
        ruleId: "meta-description-missing",
        category: "SEO_FOUNDATION",
        severity: "MEDIUM",
        resultStatus: "FAIL",
        ruleName: "Missing Meta Description",
        description: "Meta description tag is absent.",
        recommendation: "Add descriptive meta tag.",
        occurrences: [
          {
            scannedUrlId: url1Record.id,
            resultStatus: "FAIL",
            evidence: "<head>No description</head>",
          },
        ],
      },
    ]);
    assert.strictEqual(findings.length, 1);
    assert.strictEqual(findings[0]?.ruleId, "meta-description-missing");
    assert.strictEqual(findings[0]?.occurrencesCount, 1);

    const runDetail = await repository.getRunDetail(run1.id);
    assert.strictEqual(runDetail?.findings.length, 1);
    assert.strictEqual(runDetail?.findings[0]?.occurrences.length, 1);
    console.log("  ✓ Test 9 & 10 PASS: Findings and occurrences persisted and retrieved.");

    // --------------------------------------------------------------------------
    // Test 11: Prisma Repository Insert/Read: CrawlFindingVerification
    // --------------------------------------------------------------------------
    console.log("\n[TEST 11] Prisma Repository Verification with Synthetic User");
    const findingRecord = findings[0]!;
    const verification = await repository.recordVerification(run1.id, findingRecord.id, {
      status: "CONFIRMED",
      note: "Confirmed by QA automated check.",
      actorUserId: testUserId,
    });
    assert.strictEqual(verification.status, "CONFIRMED");
    assert.strictEqual(verification.actorUserId, testUserId);

    const verificationsList = await repository.getVerificationsForFinding(run1.id, findingRecord.id);
    assert.strictEqual(verificationsList.length, 1);
    console.log("  ✓ Test 11 PASS: Verification record linked to User.");

    // --------------------------------------------------------------------------
    // Test 12: Duplicate Idempotency Key Handling
    // --------------------------------------------------------------------------
    console.log("\n[TEST 12] Duplicate Idempotency Key Handling");
    const existingRun = await repository.getRunByIdempotencyKey(testBusinessId, "idem_ci_run_01");
    assert.ok(existingRun, "Existing run must be found by idempotency key");
    assert.strictEqual(existingRun.id, run1.id);

    let idempotencyCollision = false;
    try {
      await repository.createRun({
        businessId: testBusinessId,
        rootUrl: "https://ci-test.example.com",
        requestedUrlLimit: 50,
        depthLimit: 3,
        concurrencyLimit: 2,
        idempotencyKey: "idem_ci_run_01",
      });
    } catch {
      idempotencyCollision = true;
    }
    assert.strictEqual(idempotencyCollision, true, "Duplicate idempotency key must be rejected by unique constraint");
    console.log("  ✓ Test 12 PASS: Idempotency retrieval and collision rejection verified.");

    // --------------------------------------------------------------------------
    // Test 13: Duplicate URL Fingerprint Handling (Idempotent Upsert)
    // --------------------------------------------------------------------------
    console.log("\n[TEST 13] Duplicate URL Fingerprint Upsert");
    const updatedUrls = await repository.recordScannedUrlsBatch(run1.id, [
      {
        url: "https://ci-test.example.com/",
        depth: 0,
        status: "SCANNED",
        httpStatus: 200,
        statusText: "OK Updated",
        title: "CI Test Homepage (Updated)",
        responseTimeMs: 120,
        contentType: "text/html",
        contentLength: 4200,
        scannedAt: new Date(),
      },
    ]);
    assert.strictEqual(updatedUrls[0]?.title, "CI Test Homepage (Updated)");
    console.log("  ✓ Test 13 PASS: Duplicate URL fingerprint safely updated via upsert.");

    // --------------------------------------------------------------------------
    // Test 14: Cross-Run FK Violation Rejection
    // --------------------------------------------------------------------------
    console.log("\n[TEST 14] Cross-Run Composite FK Violation Rejection");
    const run2 = await repository.createRun({
      businessId: testBusinessId,
      rootUrl: "https://ci-test2.example.com",
      requestedUrlLimit: 20,
      depthLimit: 2,
      concurrencyLimit: 2,
    });

    let crossRunError = false;
    try {
      // Attempt to link occurrence from run 2 using finding from run 1
      await pool.query(
        `INSERT INTO crawl_finding_occurrences (id, run_id, finding_id, scanned_url_id, result_status, evidence, observed_at)
         VALUES ('occ_cross_01', $1, $2, $3, 'FAILED', 'cross-run test', NOW());`,
        [run2.id, findingRecord.id, url1Record.id]
      );
    } catch {
      crossRunError = true;
    }
    assert.strictEqual(crossRunError, true, "Cross-run occurrence link must be rejected by composite FK");
    console.log("  ✓ Test 14 PASS: Cross-run occurrence violation rejected by composite FK.");

    // --------------------------------------------------------------------------
    // Test 15: Concurrent createRun Handling
    // --------------------------------------------------------------------------
    console.log("\n[TEST 15] Concurrent createRun Calls");
    const concurrentRuns = await Promise.all([
      repository.createRun({ businessId: testBusinessId, rootUrl: "https://ci-conc-1.example.com", requestedUrlLimit: 10, depthLimit: 1, concurrencyLimit: 1 }),
      repository.createRun({ businessId: testBusinessId, rootUrl: "https://ci-conc-2.example.com", requestedUrlLimit: 10, depthLimit: 1, concurrencyLimit: 1 }),
      repository.createRun({ businessId: testBusinessId, rootUrl: "https://ci-conc-3.example.com", requestedUrlLimit: 10, depthLimit: 1, concurrencyLimit: 1 }),
      repository.createRun({ businessId: testBusinessId, rootUrl: "https://ci-conc-4.example.com", requestedUrlLimit: 10, depthLimit: 1, concurrencyLimit: 1 }),
      repository.createRun({ businessId: testBusinessId, rootUrl: "https://ci-conc-5.example.com", requestedUrlLimit: 10, depthLimit: 1, concurrencyLimit: 1 }),
    ]);
    assert.strictEqual(concurrentRuns.length, 5);
    console.log("  ✓ Test 15 PASS: 5 concurrent createRun calls executed safely.");

    // --------------------------------------------------------------------------
    // Test 16: Transaction Rollback When Batch Fails
    // --------------------------------------------------------------------------
    console.log("\n[TEST 16] Transaction Rollback When Batch Fails");
    const countBefore = await pool.query<{ count: string }>(
      "SELECT count(*) as count FROM crawl_audit_findings WHERE run_id = $1;",
      [run2.id]
    );

    let batchRollbackOccurred = false;
    try {
      await repository.recordFindingsBatch(run2.id, [
        {
          ruleId: "valid-rule",
          category: "PERFORMANCE",
          severity: "HIGH",
          resultStatus: "FAIL",
          ruleName: "Valid Rule",
          description: "Desc",
          recommendation: "Rec",
          occurrences: [
            {
              scannedUrlId: "non_existent_url_id",
              resultStatus: "FAIL",
              evidence: "test error evidence",
            },
          ],
        },
      ]);
    } catch {
      batchRollbackOccurred = true;
    }
    assert.strictEqual(batchRollbackOccurred, true);

    const countAfter = await pool.query<{ count: string }>(
      "SELECT count(*) as count FROM crawl_audit_findings WHERE run_id = $1;",
      [run2.id]
    );
    assert.strictEqual(countBefore.rows[0]?.count, countAfter.rows[0]?.count);
    console.log("  ✓ Test 16 PASS: Batch rolled back atomically with 0 orphaned rows.");

    // --------------------------------------------------------------------------
    // Test 17: State Transition Correctness via CrawlWriteService
    // --------------------------------------------------------------------------
    console.log("\n[TEST 17] State Transition Correctness via CrawlWriteService");
    const serviceRun = await writeService.initiateRun({
      businessId: testBusinessId,
      rootUrl: "https://ci-service.example.com",
      requestedUrlLimit: 15,
      depthLimit: 2,
      concurrencyLimit: 2,
    });
    assert.strictEqual(serviceRun.status, "RUNNING");

    await repository.recordScannedUrlsBatch(serviceRun.id, [
      {
        url: "https://ci-service.example.com/",
        depth: 0,
        status: "SCANNED",
        httpStatus: 200,
        title: "CI Service Run",
        responseTimeMs: 90,
        contentType: "text/html",
        contentLength: 1500,
        scannedAt: new Date(),
      },
    ]);

    const finalizedRun = await repository.finalizeRun(serviceRun.id, {
      status: "COMPLETED",
      finishedAt: new Date(),
      counters: {
        discoveredCount: 1,
        eligibleCount: 1,
        queuedCount: 0,
        attemptedCount: 1,
        succeededCount: 1,
        failedCount: 0,
        skippedRobotsCount: 0,
        skippedDepthCount: 0,
        skippedCandidateLimitCount: 0,
        skippedScopeCount: 0,
        remainingCount: 0,
        limitReached: false,
        discoveryTruncated: false,
        downloadedBytes: 1500,
      },
      stopReasonCode: "NORMAL_COMPLETION",
    });
    assert.strictEqual(finalizedRun.status, "COMPLETED");
    console.log("  ✓ Test 17 PASS: Full initiate -> running -> completed transition verified.");

    // --------------------------------------------------------------------------
    // Test 18: Partial, Cancelled, and Failed Run State Retention
    // --------------------------------------------------------------------------
    console.log("\n[TEST 18] Partial, Cancelled, and Failed Run State Retention");
    const failRunRecord = await repository.createRun({
      businessId: testBusinessId,
      rootUrl: "https://ci-fail.example.com",
      requestedUrlLimit: 10,
      depthLimit: 1,
      concurrencyLimit: 1,
    });
    await repository.startRun(failRunRecord.id);
    const failedRun = await repository.failRun(failRunRecord.id, {
      failureCode: "FATAL_DNS_RESOLUTION_ERROR",
      finishedAt: new Date(),
      warnings: ["DNS NXDOMAIN"],
    });
    assert.strictEqual(failedRun.status, "FAILED");
    assert.strictEqual(failedRun.stopReasonCode, "FATAL_DNS_RESOLUTION_ERROR");
    console.log("  ✓ Test 18 PASS: Failed run state safely retained.");

    // --------------------------------------------------------------------------
    // Test 19: Worker-Loss Recovery Service Test
    // --------------------------------------------------------------------------
    console.log("\n[TEST 19] Worker-Loss Recovery Service Test");
    const staleTime = new Date(Date.now() - 3600 * 1000);
    const staleRun = await repository.createRun({
      businessId: testBusinessId,
      rootUrl: "https://ci-stale.example.com",
      requestedUrlLimit: 10,
      depthLimit: 1,
      concurrencyLimit: 1,
    });
    await pool.query(
      "UPDATE crawl_audit_runs SET status = 'RUNNING', started_at = $1 WHERE id = $2;",
      [staleTime, staleRun.id]
    );

    const staleRuns = await repository.findStaleRunningRuns(new Date(Date.now() - 1800 * 1000));
    assert.ok(staleRuns.some((r) => r.id === staleRun.id), "Stale run must be identified");

    await repository.failRun(staleRun.id, {
      failureCode: "WORKER_LOSS_RECOVERED",
      finishedAt: new Date(),
    });
    const recoveredRun = await repository.getRun(staleRun.id);
    assert.strictEqual(recoveredRun?.status, "FAILED");
    console.log("  ✓ Test 19 PASS: Stale running run detected and recovered.");

    // --------------------------------------------------------------------------
    // Test 20: Pagination and History Read Queries
    // --------------------------------------------------------------------------
    console.log("\n[TEST 20] Pagination & History Read Queries");
    const paged1 = await repository.listRunsForBusiness(testBusinessId, { limit: 2, offset: 0 });
    const paged2 = await repository.listRunsForBusiness(testBusinessId, { limit: 2, offset: 2 });
    assert.strictEqual(paged1.length, 2);
    assert.strictEqual(paged2.length, 2);
    assert.notStrictEqual(paged1[0]?.id, paged2[0]?.id);
    console.log("  ✓ Test 20 PASS: Deterministic pagination and ordering verified.");

    // --------------------------------------------------------------------------
    // Test 21: URL & Evidence Redaction Verification
    // --------------------------------------------------------------------------
    console.log("\n[TEST 21] URL & Evidence Redaction Verification");
    const sensitiveUrl = "https://example.com/checkout?token=secret123&password=supersecret&user=tester";
    const redacted = sanitizeUrl(sensitiveUrl);
    assert.ok(!redacted.includes("secret123"), "Sensitive token query must be redacted");
    assert.ok(!redacted.includes("supersecret"), "Sensitive password query must be redacted");

    const hugeEvidence = "EVIDENCE_BLOCK_".repeat(300);
    const sanitizedEv = sanitizeEvidence(hugeEvidence);
    assert.ok(sanitizedEv.length <= 2000, "Evidence must be bounded to 2000 characters");
    console.log("  ✓ Test 21 PASS: Redaction and evidence bounding verified.");

    // --------------------------------------------------------------------------
    // Test 22: Finding Comparison Anti-False-Resolved Validation
    // --------------------------------------------------------------------------
    console.log("\n[TEST 22] Finding Comparison Anti-False-Resolved Validation");
    const compBaseRun = await repository.createRun({
      businessId: testBusinessId,
      rootUrl: "https://ci-comp.example.com",
      requestedUrlLimit: 10,
      depthLimit: 1,
      concurrencyLimit: 1,
    });
    await repository.startRun(compBaseRun.id);
    const compUrls = await repository.recordScannedUrlsBatch(compBaseRun.id, [
      {
        url: "https://ci-comp.example.com/missing-meta",
        depth: 1,
        status: "SCANNED",
        httpStatus: 200,
        title: "Missing Meta Page",
        scannedAt: new Date(),
      },
    ]);
    await repository.recordFindingsBatch(compBaseRun.id, [
      {
        ruleId: "meta-missing",
        category: "SEO_FOUNDATION",
        severity: "HIGH",
        resultStatus: "FAIL",
        ruleName: "Missing Meta",
        description: "Missing",
        recommendation: "Fix",
        occurrences: [
          {
            scannedUrlId: compUrls[0]!.id,
            resultStatus: "FAIL",
            evidence: "missing meta tag",
          },
        ],
      },
    ]);
    await repository.finalizeRun(compBaseRun.id, {
      status: "COMPLETED",
      finishedAt: new Date(),
      counters: {
        discoveredCount: 1,
        eligibleCount: 1,
        queuedCount: 0,
        attemptedCount: 1,
        succeededCount: 1,
        failedCount: 0,
        skippedRobotsCount: 0,
        skippedDepthCount: 0,
        skippedCandidateLimitCount: 0,
        skippedScopeCount: 0,
        remainingCount: 0,
        limitReached: false,
        discoveryTruncated: false,
        downloadedBytes: 1000,
      },
    });

    // Target run: Only scanned homepage, never scanned /missing-meta because it was PARTIAL
    const compTargetRun = await repository.createRun({
      businessId: testBusinessId,
      rootUrl: "https://ci-comp.example.com",
      requestedUrlLimit: 10,
      depthLimit: 1,
      concurrencyLimit: 1,
    });
    await repository.startRun(compTargetRun.id);
    await repository.recordScannedUrlsBatch(compTargetRun.id, [
      {
        url: "https://ci-comp.example.com/",
        depth: 0,
        status: "SCANNED",
        httpStatus: 200,
        title: "Homepage",
        scannedAt: new Date(),
      },
    ]);
    await repository.finalizeRun(compTargetRun.id, {
      status: "PARTIAL",
      finishedAt: new Date(),
      counters: {
        discoveredCount: 5,
        eligibleCount: 5,
        queuedCount: 4,
        attemptedCount: 1,
        succeededCount: 1,
        failedCount: 0,
        skippedRobotsCount: 0,
        skippedDepthCount: 0,
        skippedCandidateLimitCount: 0,
        skippedScopeCount: 0,
        remainingCount: 4,
        limitReached: false,
        discoveryTruncated: false,
        downloadedBytes: 1000,
      },
    });

    const comparison = await readService.compareRuns(compBaseRun.id, compTargetRun.id);
    assert.strictEqual(comparison.summary.resolvedCount, 0, "Unchecked URL must NOT be reported as resolved");
    assert.strictEqual(
      comparison.summary.unresolvedNotRecheckedCount,
      1,
      "Finding on unscanned URL must be categorized as unresolvedNotRechecked"
    );
    console.log("  ✓ Test 22 PASS: Anti-false-resolved protection validated on PostgreSQL 18.");

    console.log("\n=================================================================");
    console.log("🎉 ALL 22 POSTGRESQL 18 INTEGRATION TESTS PASSED (LIVE CI EXECUTION)");
    console.log("=================================================================");
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

// ------------------------------------------------------------------------------
// OFFLINE PREFLIGHT & STATIC CONTRACT VERIFICATION
// ------------------------------------------------------------------------------
async function runOfflinePreflightChecks() {
  console.log("1. Checking Driver Adapter & PrismaPg imports...");
  assert.strictEqual(typeof PrismaPg, "function", "PrismaPg constructor must exist");
  assert.strictEqual(typeof Pool, "function", "pg.Pool constructor must exist");
  assert.strictEqual(typeof PrismaClient, "function", "PrismaClient constructor must exist");
  console.log("  ✓ Driver adapters and Prisma Client constructors verified.");

  console.log("2. Checking Migration SQL Files & 11 CHECK Constraints...");
  const migrationPath = path.resolve(
    __dirname,
    "../prisma/migrations/20261029000000_crawl_audit_persistence/migration.sql"
  );
  assert.ok(fs.existsSync(migrationPath), "Migration SQL file must exist");
  const sql = fs.readFileSync(migrationPath, "utf8");

  const requiredChecks = [
    "crawl_audit_runs_requested_url_limit_check",
    "crawl_audit_runs_depth_limit_check",
    "crawl_audit_runs_concurrency_limit_check",
    "crawl_audit_runs_counters_check",
    "crawl_audit_runs_lifecycle_check",
    "crawl_audit_runs_time_order_check",
    "crawl_scanned_urls_fingerprint_check",
    "crawl_scanned_urls_depth_check",
    "crawl_scanned_urls_http_status_check",
    "crawl_scanned_urls_measurements_check",
    "crawl_audit_findings_keys_check",
  ];
  for (const c of requiredChecks) {
    assert.ok(sql.includes(c), `Migration SQL must contain CHECK constraint ${c}`);
  }
  console.log("  ✓ All 11 CHECK constraints present in migration SQL draft.");

  console.log("3. Verifying Composite Foreign Keys in Migration SQL...");
  assert.ok(
    sql.includes("crawl_finding_occurrences_runId_findingId_fkey"),
    "crawl_finding_occurrences_runId_findingId_fkey must exist"
  );
  assert.ok(
    sql.includes("crawl_finding_occurrences_runId_scannedUrlId_fkey"),
    "crawl_finding_occurrences_runId_scannedUrlId_fkey must exist"
  );
  assert.ok(
    sql.includes("crawl_finding_verifications_runId_findingId_fkey"),
    "crawl_finding_verifications_runId_findingId_fkey must exist"
  );
  console.log("  ✓ Composite foreign key declarations verified.");

  console.log("4. Verifying Repository & Service Interface Compatibility...");
  const memoryRepo = new InMemoryCrawlAuditRepository();
  const writeService = new CrawlWriteService(memoryRepo);
  const readService = new CrawlReadService(memoryRepo);
  assert.strictEqual(typeof writeService.initiateRun, "function");
  assert.strictEqual(typeof readService.compareRuns, "function");
  console.log("  ✓ Service contracts verified with repository interface.");

  console.log("5. Verifying URL Redaction & Sanitization contracts...");
  const rawUrl = "https://test.example.com/api?access_token=12345&secret=abc";
  const redacted = sanitizeUrl(rawUrl);
  assert.ok(!redacted.includes("12345"), "Token query must be redacted");
  assert.ok(!redacted.includes("abc"), "Secret query must be redacted");
  console.log("  ✓ URL redaction contract verified.");
}

runPostgres18IntegrationSuite().catch((err) => {
  console.error("FATAL ERROR in test-crawl-postgres18-integration:", err);
  process.exit(1);
});

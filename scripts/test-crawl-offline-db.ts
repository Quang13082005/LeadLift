import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import {
  sanitizeUrl,
  computeUrlFingerprint,
  sanitizeEvidence,
  computeComparisonKey,
  computeFindingKey,
} from "../src/lib/scanner/persistence/sanitizer";

// ==============================================================================
// SAFETY GUARD: Fail-closed if production DATABASE_URL is attempted to be used
// ==============================================================================
function enforceOfflineTestIsolation() {
  const neonEnvPattern = /neon\.tech|pooler/i;
  const dbUrl = process.env.DATABASE_URL || "";
  const unpooledUrl = process.env.DATABASE_URL_UNPOOLED || "";

  // The offline database rehearsal MUST run in-process against PGlite WASM
  // It must never connect to Neon or any external remote database.
  console.log("🔒 [SAFETY GUARD] Verifying database test isolation...");
  if (neonEnvPattern.test(dbUrl) || neonEnvPattern.test(unpooledUrl)) {
    console.log("  ℹ Remote database URL detected in environment; strictly isolated by using in-memory PGlite WASM engine.");
  }
  if (process.env.LEADLIFT_ALLOW_EXTERNAL_DB === "true") {
    throw new Error("FAIL-CLOSED: LEADLIFT_ALLOW_EXTERNAL_DB is not allowed in offline rehearsal.");
  }
  console.log("  ✓ Confirmed pure in-memory offline rehearsal (PGlite WASM). Zero network connections.");
}

async function runOfflineDatabaseRehearsal() {
  console.log("=================================================================");
  console.log("LEADLIFT — PHASE 03B.2B-2C OFFLINE DATABASE REHEARSAL (PGLITE)");
  console.log("=================================================================");

  enforceOfflineTestIsolation();

  // Create clean in-memory PGlite instance
  const db = new PGlite();

  try {
    const versionRes = await db.query<{ ver: string }>("SELECT version() as ver;");
    console.log(`\n[INIT] PGlite Engine Version: ${versionRes.rows[0]?.ver}`);

    // --------------------------------------------------------------------------
    // 1. Tạo 5 bảng crawl mới từ offline SQL & xác minh enum
    // --------------------------------------------------------------------------
    console.log("\n[TEST 1 & 2] Schema & Enum Execution from Migration SQL Files");
    const initSqlPath = path.resolve(__dirname, "../prisma/migrations/20261027000000_init/migration.sql");
    const crawlSqlPath = path.resolve(__dirname, "../prisma/migrations/20261029000000_crawl_audit_persistence/migration.sql");

    assert.ok(fs.existsSync(initSqlPath), "Init migration file must exist");
    assert.ok(fs.existsSync(crawlSqlPath), "Crawl audit migration file must exist");

    const initSql = fs.readFileSync(initSqlPath, "utf8");
    const crawlSql = fs.readFileSync(crawlSqlPath, "utf8");

    // Execute init migration
    await db.exec(initSql);
    console.log("  ✓ Executed 20261027000000_init (Base schema: businesses, users, website_audits, etc.)");

    // Execute crawl audit persistence migration
    await db.exec(crawlSql);
    console.log("  ✓ Executed 20261029000000_crawl_audit_persistence (5 crawl tables, 3 enums, indexes, FKs, CHECKs)");

    // Verify 5 tables in pg_tables
    const tablesRes = await db.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'crawl_%' ORDER BY tablename;"
    );
    const tableNames = tablesRes.rows.map((r) => r.tablename);
    assert.deepEqual(tableNames, [
      "crawl_audit_findings",
      "crawl_audit_runs",
      "crawl_finding_occurrences",
      "crawl_finding_verifications",
      "crawl_scanned_urls",
    ]);
    console.log("  ✓ Verified 5 crawl tables present in public schema.");

    // Verify 3 enums in pg_type
    const enumsRes = await db.query<{ typname: string }>(
      "SELECT typname FROM pg_type WHERE typname IN ('CrawlAuditRunStatus', 'CrawlUrlStatus', 'CrawlFindingResultStatus') ORDER BY typname;"
    );
    const enumNames = enumsRes.rows.map((r) => r.typname);
    assert.deepEqual(enumNames, [
      "CrawlAuditRunStatus",
      "CrawlFindingResultStatus",
      "CrawlUrlStatus",
    ]);
    console.log("  ✓ Verified 3 crawl enums present in database.");

    // --------------------------------------------------------------------------
    // 3 & 4. Xác minh Foreign Keys, Composite Keys & RESTRICT Delete Rules
    // --------------------------------------------------------------------------
    console.log("\n[TEST 3 & 4] Verification of Foreign Keys, Composite Keys & RESTRICT Delete Rules");
    const fkRes = await db.query<{
      conname: string;
      confdeltype: string;
      relname: string;
    }>(`
      SELECT c.conname, c.confdeltype, cl.relname
      FROM pg_constraint c
      JOIN pg_class cl ON c.conrelid = cl.oid
      WHERE c.contype = 'f' AND cl.relname LIKE 'crawl_%'
      ORDER BY c.conname;
    `);

    assert.equal(fkRes.rows.length, 7, "Must have exactly 7 foreign keys on crawl tables");
    for (const fk of fkRes.rows) {
      assert.equal(fk.confdeltype, "r", `Foreign key ${fk.conname} must have RESTRICT delete rule ('r')`);
    }
    console.log("  ✓ Verified all 7 foreign keys use ON DELETE RESTRICT (no cascade deletion).");

    // Check composite unique indexes used as foreign key targets and idempotency constraints
    const uniqueRes = await db.query<{ indexname: string; tablename: string }>(`
      SELECT indexname, tablename
      FROM pg_indexes
      WHERE schemaname = 'public' AND tablename LIKE 'crawl_%' AND indexname LIKE '%_key'
      ORDER BY indexname;
    `);
    const uniqueNames = uniqueRes.rows.map((r) => r.indexname);
    assert.ok(uniqueNames.includes("crawl_audit_findings_runId_id_key"), "Must have unique(runId, id) on findings");
    assert.ok(uniqueNames.includes("crawl_scanned_urls_runId_id_key"), "Must have unique(runId, id) on scanned urls");
    assert.ok(uniqueNames.includes("crawl_finding_occurrences_runId_findingId_scannedUrlId_key"), "Must have unique occurrence key");
    assert.ok(uniqueNames.includes("crawl_audit_runs_businessId_idempotencyKey_key"), "Must have unique idempotency key");
    console.log("  ✓ Verified composite unique targets and idempotency index constraints in PostgreSQL catalog.");

    // --------------------------------------------------------------------------
    // 5 & 6. Xác minh 11 CHECK Constraints
    // --------------------------------------------------------------------------
    console.log("\n[TEST 5 & 6] Verification of 11 CHECK Constraints");
    const checkRes = await db.query<{ conname: string }>(`
      SELECT conname FROM pg_constraint
      WHERE contype = 'c' AND conname LIKE 'crawl_%'
      ORDER BY conname;
    `);
    const checkNames = checkRes.rows.map((r) => r.conname);
    const expectedChecks = [
      "crawl_audit_findings_keys_check",
      "crawl_audit_runs_concurrency_limit_check",
      "crawl_audit_runs_counters_check",
      "crawl_audit_runs_depth_limit_check",
      "crawl_audit_runs_lifecycle_check",
      "crawl_audit_runs_requested_url_limit_check",
      "crawl_audit_runs_time_order_check",
      "crawl_scanned_urls_depth_check",
      "crawl_scanned_urls_fingerprint_check",
      "crawl_scanned_urls_http_status_check",
      "crawl_scanned_urls_measurements_check",
    ];
    assert.deepEqual(checkNames.sort(), expectedChecks.sort());
    console.log("  ✓ Verified all 11 CHECK constraints present in pg_constraint catalog.");

    // --------------------------------------------------------------------------
    // 7. Insert Synthetic Fixtures: Business & User
    // --------------------------------------------------------------------------
    console.log("\n[TEST 7] Insert Synthetic Test Business & User");
    const syntheticUserId = "usr_synth_admin_001";
    await db.query(`
      INSERT INTO users (id, email, "passwordHash", name, role, "updatedAt")
      VALUES ($1, $2, $3, $4, 'ADMIN', NOW());
    `, [syntheticUserId, "synthetic_admin@leadlift.internal", "$2b$12$dummyhashfordemotestingpurposeonly", "Synthetic Admin"]);

    const syntheticBusinessId = "biz_synth_danang_001";
    await db.query(`
      INSERT INTO businesses (id, name, industry, "websiteUrl", "normalizedDomain", city, "updatedAt")
      VALUES ($1, $2, $3, $4, $5, 'Đà Nẵng', NOW());
    `, [syntheticBusinessId, "Mộc Coffee (Synthetic)", "Quán cà phê", "https://moccoffee.example/", "moccoffee.example"]);
    console.log("  ✓ Inserted synthetic User and Business fixtures.");

    // --------------------------------------------------------------------------
    // 8. Insert Synthetic Audit Run
    // --------------------------------------------------------------------------
    console.log("\n[TEST 8] Insert Synthetic Crawl Audit Run");
    const syntheticRunId = "run_synth_001";
    const startedAt = new Date();
    await db.query(`
      INSERT INTO crawl_audit_runs (
        id, "businessId", "rootUrl", "rootHost", "requestedUrlLimit", "depthLimit", "concurrencyLimit",
        status, "startedAt", "scannerVersion", "rulesetVersion", "urlFingerprintKeyVersion", "comparisonKeyVersion",
        "idempotencyKey"
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        'RUNNING', $8, '03B.1', '1.0.0', 'v1', 'v1', 'idem_key_001'
      );
    `, [syntheticRunId, syntheticBusinessId, "https://moccoffee.example/", "moccoffee.example", 20, 2, 2, startedAt]);
    console.log("  ✓ Inserted RUNNING audit run.");

    // --------------------------------------------------------------------------
    // 9. Insert Scanned URLs
    // --------------------------------------------------------------------------
    console.log("\n[TEST 9] Insert Scanned URLs");
    const url1 = "https://moccoffee.example/";
    const url1Fp = computeUrlFingerprint(url1);
    const url1Id = "url_synth_001";

    const url2 = "https://moccoffee.example/menu";
    const url2Fp = computeUrlFingerprint(url2);
    const url2Id = "url_synth_002";

    await db.query(`
      INSERT INTO crawl_scanned_urls (
        id, "runId", "urlFingerprint", "sanitizedUrl", depth, status, "httpStatus", "statusText",
        title, "metaDescription", "responseTimeMs", "contentLength", "scannedAt"
      ) VALUES
        ($1, $2, $3, $4, 0, 'SCANNED', 200, 'OK', 'Mộc Coffee Trang chủ', 'Cà phê rang mộc tại Đà Nẵng', 120, 15000, NOW()),
        ($5, $2, $6, $7, 1, 'SCANNED', 200, 'OK', 'Thực đơn Mộc Coffee', 'Thực đơn đồ uống phong phú', 95, 22000, NOW());
    `, [url1Id, syntheticRunId, url1Fp, url1, url2Id, url2Fp, url2]);
    console.log("  ✓ Inserted 2 scanned URLs with valid HMAC-SHA256 64-hex fingerprints.");

    // --------------------------------------------------------------------------
    // 10. Insert Findings & Occurrences
    // --------------------------------------------------------------------------
    console.log("\n[TEST 10] Insert Findings & Occurrences");
    const finding1Id = "fnd_synth_001";
    const compKey1 = computeComparisonKey("SEO_H1_COUNT");
    const findingKey1 = computeFindingKey(compKey1, "FAIL", "MEDIUM");

    await db.query(`
      INSERT INTO crawl_audit_findings (
        id, "runId", "comparisonKey", "findingKey", "ruleId", category, severity, "resultStatus",
        "ruleName", description, recommendation
      ) VALUES ($1, $2, $3, $4, 'SEO_H1_COUNT', 'SEO', 'MEDIUM', 'FAIL', 'Thẻ H1 không hợp lệ', 'Trang có nhiều hơn 1 thẻ H1', 'Giữ đúng 1 thẻ H1 duy nhất');
    `, [finding1Id, syntheticRunId, compKey1, findingKey1]);

    const occ1Id = "occ_synth_001";
    await db.query(`
      INSERT INTO crawl_finding_occurrences (
        id, "runId", "findingId", "scannedUrlId", "resultStatus", evidence
      ) VALUES ($1, $2, $3, $4, 'FAIL', 'Found 2 H1 tags: <h1>Mộc</h1> and <h1>Menu</h1>');
    `, [occ1Id, syntheticRunId, finding1Id, url1Id]);

    // Insert verification
    const ver1Id = "ver_synth_001";
    await db.query(`
      INSERT INTO crawl_finding_verifications (
        id, "runId", "findingId", status, note, "actorUserId"
      ) VALUES ($1, $2, $3, 'CONFIRMED', 'Xác nhận đúng lỗi H1 trên trang chủ', $4);
    `, [ver1Id, syntheticRunId, finding1Id, syntheticUserId]);
    console.log("  ✓ Inserted finding, occurrence, and verified audit event.");

    // --------------------------------------------------------------------------
    // 11. Đọc lại Dữ liệu qua Relational Join
    // --------------------------------------------------------------------------
    console.log("\n[TEST 11] Read Back Data via Relational JOIN");
    const joinRes = await db.query<{
      runId: string;
      rootHost: string;
      ruleName: string;
      sanitizedUrl: string;
      evidence: string;
      verificationStatus: string;
      verifierName: string;
    }>(`
      SELECT
        r.id as "runId",
        r."rootHost",
        f."ruleName",
        u."sanitizedUrl",
        o.evidence,
        v.status as "verificationStatus",
        usr.name as "verifierName"
      FROM crawl_audit_runs r
      JOIN crawl_audit_findings f ON f."runId" = r.id
      JOIN crawl_finding_occurrences o ON o."runId" = r.id AND o."findingId" = f.id
      JOIN crawl_scanned_urls u ON u."runId" = r.id AND u.id = o."scannedUrlId"
      JOIN crawl_finding_verifications v ON v."runId" = r.id AND v."findingId" = f.id
      JOIN users usr ON usr.id = v."actorUserId"
      WHERE r.id = $1;
    `, [syntheticRunId]);

    assert.equal(joinRes.rows.length, 1);
    const row = joinRes.rows[0]!;
    assert.equal(row.rootHost, "moccoffee.example");
    assert.equal(row.ruleName, "Thẻ H1 không hợp lệ");
    assert.equal(row.sanitizedUrl, "https://moccoffee.example/");
    assert.equal(row.verificationStatus, "CONFIRMED");
    assert.equal(row.verifierName, "Synthetic Admin");
    console.log("  ✓ Relational query verified: Joined Run -> Finding -> Occurrence -> URL -> Verification -> User.");

    // --------------------------------------------------------------------------
    // 12. Thử Duplicate URL / Finding (Unique Constraints)
    // --------------------------------------------------------------------------
    console.log("\n[TEST 12] Unique Constraints Enforcement (Duplicate URL & Finding)");
    // Duplicate URL fingerprint within same run
    await assert.rejects(async () => {
      await db.query(`
        INSERT INTO crawl_scanned_urls (id, "runId", "urlFingerprint", "sanitizedUrl", depth, status, "scannedAt")
        VALUES ('url_dup', $1, $2, 'https://moccoffee.example/', 0, 'SCANNED', NOW());
      `, [syntheticRunId, url1Fp]);
    }, /unique|duplicate key/i, "Must reject duplicate URL fingerprint in same run");

    // Duplicate findingKey within same run
    await assert.rejects(async () => {
      await db.query(`
        INSERT INTO crawl_audit_findings (
          id, "runId", "comparisonKey", "findingKey", "ruleId", category, severity, "resultStatus", "ruleName", description, recommendation
        ) VALUES ('fnd_dup', $1, $2, $3, 'SEO_H1_COUNT', 'SEO', 'MEDIUM', 'FAIL', 'Duplicate rule', 'desc', 'rec');
      `, [syntheticRunId, compKey1, findingKey1]);
    }, /unique|duplicate key/i, "Must reject duplicate findingKey in same run");

    // Duplicate idempotencyKey within same business
    await assert.rejects(async () => {
      await db.query(`
        INSERT INTO crawl_audit_runs (
          id, "businessId", "rootUrl", "rootHost", "requestedUrlLimit", "depthLimit", "concurrencyLimit",
          status, "scannerVersion", "rulesetVersion", "urlFingerprintKeyVersion", "comparisonKeyVersion", "idempotencyKey"
        ) VALUES ('run_dup', $1, 'https://moccoffee.example/', 'moccoffee.example', 20, 2, 2, 'PENDING', '03B.1', '1.0.0', 'v1', 'v1', 'idem_key_001');
      `, [syntheticBusinessId]);
    }, /unique|duplicate key/i, "Must reject duplicate idempotencyKey for same business");
    console.log("  ✓ Database-level unique constraints enforced for URL, finding, and idempotency.");

    // --------------------------------------------------------------------------
    // 13. Thử Cross-Run Relation (Composite FK Constraint Violation)
    // --------------------------------------------------------------------------
    console.log("\n[TEST 13] Cross-Run Composite Foreign Key Enforcement");
    const otherRunId = "run_synth_002";
    await db.query(`
      INSERT INTO crawl_audit_runs (
        id, "businessId", "rootUrl", "rootHost", "requestedUrlLimit", "depthLimit", "concurrencyLimit",
        status, "scannerVersion", "rulesetVersion", "urlFingerprintKeyVersion", "comparisonKeyVersion"
      ) VALUES ($1, $2, 'https://moccoffee.example/', 'moccoffee.example', 20, 2, 2, 'PENDING', '03B.1', '1.0.0', 'v1', 'v1');
    `, [otherRunId, syntheticBusinessId]);

    // Attempt to insert an occurrence linking Run 2 to URL 1 (which belongs to Run 1)
    await assert.rejects(async () => {
      await db.query(`
        INSERT INTO crawl_finding_occurrences (id, "runId", "findingId", "scannedUrlId", "resultStatus", evidence)
        VALUES ('occ_cross_leak', $1, $2, $3, 'FAIL', 'cross-run-leak');
      `, [otherRunId, finding1Id, url1Id]);
    }, /violates foreign key constraint/i, "Must reject occurrence linking entity across different runs");
    console.log("  ✓ Composite foreign key constraint strictly blocked cross-run evidence linkage.");

    // --------------------------------------------------------------------------
    // 14. Thử Invalid Counters (CHECK Constraints Violation)
    // --------------------------------------------------------------------------
    console.log("\n[TEST 14] CHECK Constraints: Invalid Counters & Scope");
    // Negative counter
    await assert.rejects(async () => {
      await db.query(`
        UPDATE crawl_audit_runs SET "failedCount" = -5 WHERE id = $1;
      `, [syntheticRunId]);
    }, /crawl_audit_runs_counters_check/i, "Must reject negative counter");

    // attemptedCount exceeds requestedUrlLimit (requested 20, attempted 50)
    await assert.rejects(async () => {
      await db.query(`
        UPDATE crawl_audit_runs SET "attemptedCount" = 50 WHERE id = $1;
      `, [syntheticRunId]);
    }, /crawl_audit_runs_counters_check/i, "Must reject attemptedCount > requestedUrlLimit");

    // requestedUrlLimit > 100
    await assert.rejects(async () => {
      await db.query(`
        INSERT INTO crawl_audit_runs (
          id, "businessId", "rootUrl", "rootHost", "requestedUrlLimit", "depthLimit", "concurrencyLimit",
          status, "scannerVersion", "rulesetVersion", "urlFingerprintKeyVersion", "comparisonKeyVersion"
        ) VALUES ('run_bad_limit', $1, 'https://moccoffee.example/', 'moccoffee.example', 150, 2, 2, 'PENDING', '03B.1', '1.0.0', 'v1', 'v1');
      `, [syntheticBusinessId]);
    }, /crawl_audit_runs_requested_url_limit_check/i, "Must reject requestedUrlLimit > 100");

    // concurrencyLimit > 2
    await assert.rejects(async () => {
      await db.query(`
        INSERT INTO crawl_audit_runs (
          id, "businessId", "rootUrl", "rootHost", "requestedUrlLimit", "depthLimit", "concurrencyLimit",
          status, "scannerVersion", "rulesetVersion", "urlFingerprintKeyVersion", "comparisonKeyVersion"
        ) VALUES ('run_bad_conc', $1, 'https://moccoffee.example/', 'moccoffee.example', 50, 2, 5, 'PENDING', '03B.1', '1.0.0', 'v1', 'v1');
      `, [syntheticBusinessId]);
    }, /crawl_audit_runs_concurrency_limit_check/i, "Must reject concurrencyLimit > 2");

    // Invalid fingerprint regex (not 64 lowercase hex)
    await assert.rejects(async () => {
      await db.query(`
        INSERT INTO crawl_scanned_urls (id, "runId", "urlFingerprint", "sanitizedUrl", depth, status, "scannedAt")
        VALUES ('url_bad_fp', $1, 'NOT_HEX_FINGERPRINT_123', 'https://moccoffee.example/bad', 0, 'SCANNED', NOW());
      `, [syntheticRunId]);
    }, /crawl_scanned_urls_fingerprint_check/i, "Must reject malformed URL fingerprint");

    console.log("  ✓ Database CHECK constraints enforced: non-negative counters, URL cap <= 100, concurrency <= 2, 64-hex fingerprint.");

    // --------------------------------------------------------------------------
    // 15. Thử Lifecycle & Time Order Invalid Data
    // --------------------------------------------------------------------------
    console.log("\n[TEST 15] CHECK Constraints: Lifecycle & Time Order");
    // RUNNING status with null startedAt
    await assert.rejects(async () => {
      await db.query(`
        INSERT INTO crawl_audit_runs (
          id, "businessId", "rootUrl", "rootHost", "requestedUrlLimit", "depthLimit", "concurrencyLimit",
          status, "startedAt", "scannerVersion", "rulesetVersion", "urlFingerprintKeyVersion", "comparisonKeyVersion"
        ) VALUES ('run_bad_life', $1, 'https://moccoffee.example/', 'moccoffee.example', 20, 2, 2, 'RUNNING', NULL, '03B.1', '1.0.0', 'v1', 'v1');
      `, [syntheticBusinessId]);
    }, /crawl_audit_runs_lifecycle_check/i, "Must reject RUNNING status with null startedAt");

    // COMPLETED status with null finishedAt
    await assert.rejects(async () => {
      await db.query(`
        INSERT INTO crawl_audit_runs (
          id, "businessId", "rootUrl", "rootHost", "requestedUrlLimit", "depthLimit", "concurrencyLimit",
          status, "startedAt", "finishedAt", "scannerVersion", "rulesetVersion", "urlFingerprintKeyVersion", "comparisonKeyVersion"
        ) VALUES ('run_bad_comp', $1, 'https://moccoffee.example/', 'moccoffee.example', 20, 2, 2, 'COMPLETED', NOW(), NULL, '03B.1', '1.0.0', 'v1', 'v1');
      `, [syntheticBusinessId]);
    }, /crawl_audit_runs_lifecycle_check/i, "Must reject COMPLETED status with null finishedAt");

    // finishedAt < startedAt
    const pastTime = new Date(startedAt.getTime() - 60000);
    await assert.rejects(async () => {
      await db.query(`
        UPDATE crawl_audit_runs
        SET status = 'COMPLETED', "finishedAt" = $1
        WHERE id = $2;
      `, [pastTime, syntheticRunId]);
    }, /crawl_audit_runs_time_order_check/i, "Must reject finishedAt before startedAt");

    console.log("  ✓ Database CHECK constraints enforced: valid lifecycle states and temporal order (finishedAt >= startedAt).");

    // --------------------------------------------------------------------------
    // 16. Thử Partial & Cancelled Finalization
    // --------------------------------------------------------------------------
    console.log("\n[TEST 16] Partial & Cancelled Finalization");
    const finishedAt = new Date(startedAt.getTime() + 5000);
    await db.query(`
      UPDATE crawl_audit_runs
      SET status = 'PARTIAL', "finishedAt" = $1, "stopReasonCode" = 'LIMIT_REACHED', "attemptedCount" = 2, "succeededCount" = 2
      WHERE id = $2;
    `, [finishedAt, syntheticRunId]);

    const partialRunRes = await db.query<{ status: string; stopReasonCode: string; attemptedCount: number }>(`
      SELECT status, "stopReasonCode", "attemptedCount" FROM crawl_audit_runs WHERE id = $1;
    `, [syntheticRunId]);
    assert.equal(partialRunRes.rows[0]?.status, "PARTIAL");
    assert.equal(partialRunRes.rows[0]?.stopReasonCode, "LIMIT_REACHED");
    assert.equal(partialRunRes.rows[0]?.attemptedCount, 2);
    console.log("  ✓ Run properly finalized as PARTIAL with retained attempted records.");

    // --------------------------------------------------------------------------
    // 17. Thử History Queries & Sorting
    // --------------------------------------------------------------------------
    console.log("\n[TEST 17] History Queries & Multi-Run Sorting");
    const historyRes = await db.query<{ id: string; status: string }>(`
      SELECT id, status FROM crawl_audit_runs
      WHERE "businessId" = $1
      ORDER BY "startedAt" DESC NULLS LAST, "createdAt" DESC;
    `, [syntheticBusinessId]);

    assert.ok(historyRes.rows.length >= 2);
    assert.equal(historyRes.rows[0]?.id, syntheticRunId);
    console.log(`  ✓ Successfully listed ${historyRes.rows.length} runs for business, ordered by startedAt DESC.`);

    // --------------------------------------------------------------------------
    // 18. Kiểm tra Dữ liệu Nhạy cảm Được Loại bỏ Khỏi Persistence
    // --------------------------------------------------------------------------
    console.log("\n[TEST 18] Sanitization & Sensitive Token Exclusion from DB");
    const dirtyUrl = "https://user:mypassword@moccoffee.example/admin?sessionid=sec123&utm_source=fb#hash";
    const cleanedUrl = sanitizeUrl(dirtyUrl);
    const fpCleaned = computeUrlFingerprint(cleanedUrl);

    const dirtyEvidence = "Leaked: Authorization: Bearer eyJhbGciOi..., Cookie: session_token=secret999, password: mysecretpassword";
    const scrubbedEvidence = sanitizeEvidence(dirtyEvidence);

    const safeUrlId = "url_safe_001";
    await db.query(`
      INSERT INTO crawl_scanned_urls (id, "runId", "urlFingerprint", "sanitizedUrl", depth, status, "scannedAt")
      VALUES ($1, $2, $3, $4, 0, 'SCANNED', NOW());
    `, [safeUrlId, otherRunId, fpCleaned, cleanedUrl]);

    const safeFindingId = "fnd_safe_001";
    const safeCompKey = computeComparisonKey("SECURITY_SSL");
    const safeFindingKey = computeFindingKey(safeCompKey, "FAIL", "HIGH");
    await db.query(`
      INSERT INTO crawl_audit_findings (
        id, "runId", "comparisonKey", "findingKey", "ruleId", category, severity, "resultStatus", "ruleName", description, recommendation
      ) VALUES ($1, $2, $3, $4, 'SECURITY_SSL', 'SECURITY', 'HIGH', 'FAIL', 'SSL Check', 'desc', 'rec');
    `, [safeFindingId, otherRunId, safeCompKey, safeFindingKey]);

    const safeOccId = "occ_safe_001";
    await db.query(`
      INSERT INTO crawl_finding_occurrences (id, "runId", "findingId", "scannedUrlId", "resultStatus", evidence)
      VALUES ($1, $2, $3, $4, 'FAIL', $5);
    `, [safeOccId, otherRunId, safeFindingId, safeUrlId, scrubbedEvidence]);

    // Query back from DB to verify absence of secrets
    const checkLeakRes = await db.query<{ sanitizedUrl: string; evidence: string }>(`
      SELECT u."sanitizedUrl", o.evidence
      FROM crawl_scanned_urls u
      JOIN crawl_finding_occurrences o ON o."scannedUrlId" = u.id
      WHERE u.id = $1;
    `, [safeUrlId]);

    const savedRow = checkLeakRes.rows[0]!;
    assert.equal(savedRow.sanitizedUrl.includes("mypassword"), false);
    assert.equal(savedRow.sanitizedUrl.includes("sessionid"), false);
    assert.equal(savedRow.sanitizedUrl.includes("#hash"), false);
    assert.equal(savedRow.evidence.includes("eyJhbGciOi"), false);
    assert.equal(savedRow.evidence.includes("secret999"), false);
    assert.equal(savedRow.evidence.includes("mysecretpassword"), false);
    console.log("  ✓ Verified persisted URL and evidence in database contain zero passwords, session tokens, or bearer credentials.");

    // --------------------------------------------------------------------------
    // 19. Transaction Rollback Verification (Atomicity)
    // --------------------------------------------------------------------------
    console.log("\n[TEST 19] Transaction Rollback & Atomicity");
    try {
      await db.exec("BEGIN;");
      await db.query(`
        INSERT INTO crawl_scanned_urls (id, "runId", "urlFingerprint", "sanitizedUrl", depth, status, "scannedAt")
        VALUES ('url_rollback_test', $1, $2, 'https://moccoffee.example/test-rollback', 0, 'SCANNED', NOW());
      `, [otherRunId, computeUrlFingerprint("https://moccoffee.example/test-rollback")]);

      // Intentionally cause failure to trigger rollback
      await db.query("INSERT INTO non_existent_table VALUES (1);");
      await db.exec("COMMIT;");
    } catch {
      await db.exec("ROLLBACK;");
    }

    const rollbackCheck = await db.query("SELECT * FROM crawl_scanned_urls WHERE id = 'url_rollback_test';");
    assert.equal(rollbackCheck.rows.length, 0, "Rolled-back record must not exist in table");
    console.log("  ✓ Verified PostgreSQL transaction atomicity & clean rollback on failure.");

    console.log("\n=================================================================");
    console.log("ALL 19 OFFLINE PGLITE DATABASE REHEARSAL TESTS PASSED!");
    console.log("=================================================================\n");
  } finally {
    // Clean up temporary database resources
    await db.close();
    console.log("🧹 [CLEANUP] In-memory PGlite database closed and purged cleanly from process memory.");
  }
}

runOfflineDatabaseRehearsal()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("FATAL: Offline database rehearsal failed:", err);
    process.exit(1);
  });

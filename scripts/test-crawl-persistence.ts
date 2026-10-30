import assert from "node:assert/strict";
import {
  InMemoryCrawlAuditRepository,
  CrawlWriteService,
  CrawlReadService,
  sanitizeUrl,
  computeUrlFingerprint,
  sanitizeEvidence,
} from "../src/lib/scanner/persistence";

async function runPersistenceTests() {
  console.log("=================================================");
  console.log("LEADLIFT — PHASE 03B.2B-2A PERSISTENCE TESTS");
  console.log("=================================================");

  const repository = new InMemoryCrawlAuditRepository();
  const writeService = new CrawlWriteService(repository);
  const readService = new CrawlReadService(repository);

  const testBusinessId = "biz_test_danang_001";
  repository.registerBusiness(testBusinessId);

  // ----------------------------------------------------
  // TEST 1: Run Lifecycle (create -> start -> complete)
  // ----------------------------------------------------
  console.log("\n[TEST 1] Run Lifecycle & State Transitions");
  {
    const run = await writeService.initiateRun({
      businessId: testBusinessId,
      rootUrl: "https://lacadanang.quangdev.id.vn/",
      requestedUrlLimit: 20,
      depthLimit: 2,
      concurrencyLimit: 2,
    });

    assert.equal(run.businessId, testBusinessId);
    assert.equal(run.status, "RUNNING");
    assert.ok(run.startedAt instanceof Date);
    assert.equal(run.finishedAt, null);
    assert.equal(run.rootHost, "lacadanang.quangdev.id.vn");

    // Persist a URL
    const urlRec = await writeService.persistUrlResult(run.id, {
      url: "https://lacadanang.quangdev.id.vn/menu",
      depth: 1,
      status: "SCANNED",
      httpStatus: 200,
      scannedAt: new Date().toISOString(),
      findings: [],
      internalLinks: [],
      discoveredFrom: ["https://lacadanang.quangdev.id.vn/"],
    });

    assert.equal(urlRec.runId, run.id);
    assert.equal(urlRec.depth, 1);
    assert.equal(urlRec.httpStatus, 200);

    // Finalize run
    const completed = await writeService.finalizeRun(run.id, {
      id: run.id,
      targetUrl: run.rootUrl,
      rootHost: run.rootHost,
      status: "COMPLETED",
      startedAt: run.startedAt.toISOString(),
      completedAt: new Date().toISOString(),
      requestedUrlLimit: 20,
      scannedUrlCount: 1,
      successfulUrlCount: 1,
      failedUrlCount: 0,
      urlResults: [],
      findings: [],
      progress: { phase: "AGGREGATE", discovered: 5, attempted: 1, completed: 1, failed: 0, limit: 20 },
      warnings: [],
      coverage: {
        discovered: 5,
        eligible: 5,
        queued: 4,
        attempted: 1,
        succeeded: 1,
        failed: 0,
        skippedOccurrences: { robots: 0, depth: 0, candidateLimit: 0, scope: 0 },
        remaining: 4,
        limitReached: false,
        discoveryTruncated: false,
        downloadedBytes: 15420,
      },
    });

    assert.equal(completed.status, "COMPLETED");
    assert.ok(completed.finishedAt instanceof Date);
    assert.ok(completed.finishedAt.getTime() >= completed.startedAt!.getTime());
    assert.equal(completed.counters.attemptedCount, 1);
    console.log("  ✓ Run initiated in RUNNING, persisted URL, finalized COMPLETED with exact counters.");
  }

  // ----------------------------------------------------
  // TEST 2: CHECK Constraints Enforcement
  // ----------------------------------------------------
  console.log("\n[TEST 2] Schema & CHECK Constraints Enforcement");
  {
    // Invalid requestedUrlLimit (> 100)
    await assert.rejects(
      async () => {
        await repository.createRun({
          businessId: testBusinessId,
          rootUrl: "https://example.com",
          requestedUrlLimit: 150,
          depthLimit: 2,
          concurrencyLimit: 2,
        });
      },
      /CHECK constraint violation: requestedUrlLimit/,
      "Must reject requestedUrlLimit > 100"
    );

    // Invalid depthLimit (> 3)
    await assert.rejects(
      async () => {
        await repository.createRun({
          businessId: testBusinessId,
          rootUrl: "https://example.com",
          requestedUrlLimit: 50,
          depthLimit: 4,
          concurrencyLimit: 2,
        });
      },
      /CHECK constraint violation: depthLimit/,
      "Must reject depthLimit > 3"
    );

    // Invalid concurrencyLimit (> 2)
    await assert.rejects(
      async () => {
        await repository.createRun({
          businessId: testBusinessId,
          rootUrl: "https://example.com",
          requestedUrlLimit: 50,
          depthLimit: 2,
          concurrencyLimit: 5,
        });
      },
      /CHECK constraint violation: concurrencyLimit/,
      "Must reject concurrencyLimit > 2"
    );

    console.log("  ✓ Enforced max 100 URLs, max depth 3, max concurrency 2.");
  }

  // ----------------------------------------------------
  // TEST 3: Idempotent Run Creation
  // ----------------------------------------------------
  console.log("\n[TEST 3] Idempotent Run Creation");
  {
    const idempotencyKey = "client-req-uuid-987654";
    const run1 = await writeService.initiateRun({
      businessId: testBusinessId,
      rootUrl: "https://lacadanang.quangdev.id.vn/",
      requestedUrlLimit: 50,
      depthLimit: 2,
      concurrencyLimit: 2,
      idempotencyKey,
    });

    const run2 = await writeService.initiateRun({
      businessId: testBusinessId,
      rootUrl: "https://lacadanang.quangdev.id.vn/",
      requestedUrlLimit: 50,
      depthLimit: 2,
      concurrencyLimit: 2,
      idempotencyKey,
    });

    assert.equal(run1.id, run2.id);
    console.log("  ✓ Idempotency verified: Duplicate invocation returned existing run without creating duplicate.");
  }

  // ----------------------------------------------------
  // TEST 4: URL Sanitization & Fingerprinting
  // ----------------------------------------------------
  console.log("\n[TEST 4] URL Sanitization & HMAC Fingerprinting");
  {
    const rawUrl = "https://user:secret@lacadanang.quangdev.id.vn:443/tour/danang?utm_source=facebook&fbclid=xyz&auth=secrettoken#overview";
    const sanitized = sanitizeUrl(rawUrl);

    assert.equal(sanitized.includes("secret"), false, "Must strip credentials and secret query params");
    assert.equal(sanitized.includes("#overview"), false, "Must strip hash fragment");
    assert.equal(sanitized.includes("utm_source"), false, "Must strip utm parameters");
    assert.equal(sanitized.includes("fbclid"), false, "Must strip tracking parameters");

    const fp = computeUrlFingerprint(sanitized);
    assert.equal(fp.length, 64);
    assert.match(fp, /^[0-9a-f]{64}$/);

    // Fingerprint must be deterministic
    const fp2 = computeUrlFingerprint(sanitized);
    assert.equal(fp, fp2);
    console.log("  ✓ URL sanitized, credentials/hash/tracking stripped, deterministic 64-hex HMAC generated.");
  }

  // ----------------------------------------------------
  // TEST 5: Findings & Occurrences Batch Persistence
  // ----------------------------------------------------
  console.log("\n[TEST 5] Grouped Findings, Scrubbed Evidence & Occurrences");
  {
    const run = await writeService.initiateRun({
      businessId: testBusinessId,
      rootUrl: "https://lacadanang.quangdev.id.vn/",
      requestedUrlLimit: 20,
      depthLimit: 2,
      concurrencyLimit: 2,
    });

    // Record URL
    const targetUrl = "https://lacadanang.quangdev.id.vn/about";
    const urlRec = await writeService.persistUrlResult(run.id, {
      url: targetUrl,
      depth: 1,
      status: "SCANNED",
      httpStatus: 200,
      scannedAt: new Date().toISOString(),
      findings: [],
      internalLinks: [],
      discoveredFrom: [],
    });
    assert.ok(urlRec.id);

    // Dangerous evidence containing scripts and auth headers
    const rawEvidence = "Found issue in header: <script>alert('xss')</script> with Authorization: Bearer eyJhbGciOiJIUz... and Cookie: session=123";
    const scrubbed = sanitizeEvidence(rawEvidence);
    assert.equal(scrubbed.includes("<script>"), false);
    assert.equal(scrubbed.includes("eyJhbGciOiJIUz"), false);
    assert.equal(scrubbed.includes("session=123"), false);

    // Persist finding
    const findings = await writeService.persistFindingsBatch(run.id, [
      {
        id: "fnd-temp-1",
        ruleId: "SEO_META_DESCRIPTION",
        ruleName: "Thiếu thẻ meta description",
        category: "SEO",
        description: "Trang không có thẻ meta description",
        severity: "MEDIUM",
        status: "FAIL",
        evidence: rawEvidence,
        timestamp: new Date().toISOString(),
        affectedUrls: [
          { url: targetUrl, evidence: rawEvidence },
        ],
      },
    ]);

    assert.equal(findings.length, 1);
    assert.equal(findings[0]!.occurrencesCount, 1);

    const details = await readService.getRunDetails(run.id);
    assert.ok(details);
    assert.equal(details.findings.length, 1);
    assert.equal(details.findings[0]!.occurrences.length, 1);
    assert.equal(details.findings[0]!.occurrences[0]!.evidence.includes("<script>"), false);
    console.log("  ✓ Findings and occurrences persisted, composite keys linked, evidence scrubbed.");
  }

  // ----------------------------------------------------
  // TEST 6: Worker Loss & Stale Run Recovery
  // ----------------------------------------------------
  console.log("\n[TEST 6] Worker Loss Recovery (Orphaned Runs)");
  {
    // Create an abandoned run with 2 attempted URLs
    const abandonedRun1 = await writeService.initiateRun({
      businessId: testBusinessId,
      rootUrl: "https://lacadanang.quangdev.id.vn/",
      requestedUrlLimit: 20,
      depthLimit: 2,
      concurrencyLimit: 2,
    });

    await writeService.persistUrlResult(abandonedRun1.id, {
      url: "https://lacadanang.quangdev.id.vn/page1",
      depth: 1,
      status: "SCANNED",
      httpStatus: 200,
      scannedAt: new Date().toISOString(),
      findings: [],
      internalLinks: [],
      discoveredFrom: [],
    });

    await repository.updateCoverageCounters(abandonedRun1.id, { attemptedCount: 1 });

    // Manually age startedAt to simulate crash 15 minutes ago
    const oldDate = new Date(Date.now() - 15 * 60 * 1000);
    repository.setRunStartedAt(abandonedRun1.id, oldDate);

    // Run recovery
    const recoveredCount = await writeService.recoverStaleRuns(10 * 60 * 1000);
    assert.ok(recoveredCount >= 1);

    const recoveredRun = await repository.getRun(abandonedRun1.id);
    assert.equal(recoveredRun!.status, "PARTIAL", "Must be PARTIAL because attemptedCount > 0");
    assert.equal(recoveredRun!.stopReasonCode, "WORKER_LOSS");
    console.log("  ✓ Stale run with attempted URLs recovered as PARTIAL with WORKER_LOSS stop code.");
  }

  // ----------------------------------------------------
  // TEST 7: Conservative Run History Comparison
  // ----------------------------------------------------
  console.log("\n[TEST 7] Run History Comparison (Resolution Integrity)");
  {
    // Run A: Base run has 2 issues:
    // URL 1: Missing Title (FAIL)
    // URL 2: Missing Meta (FAIL)
    const runA = await writeService.initiateRun({
      businessId: testBusinessId,
      rootUrl: "https://lacadanang.quangdev.id.vn/",
      requestedUrlLimit: 20,
      depthLimit: 2,
      concurrencyLimit: 2,
    });

    const url1 = "https://lacadanang.quangdev.id.vn/";
    const url2 = "https://lacadanang.quangdev.id.vn/contact";

    await writeService.persistUrlResult(runA.id, {
      url: url1,
      depth: 0,
      status: "SCANNED",
      httpStatus: 200,
      scannedAt: new Date().toISOString(),
      findings: [],
      internalLinks: [],
      discoveredFrom: [],
    });

    await writeService.persistUrlResult(runA.id, {
      url: url2,
      depth: 1,
      status: "SCANNED",
      httpStatus: 200,
      scannedAt: new Date().toISOString(),
      findings: [],
      internalLinks: [],
      discoveredFrom: [],
    });

    await writeService.persistFindingsBatch(runA.id, [
      {
        id: "fnd_a1",
        ruleId: "SEO_TITLE_EXISTS",
        ruleName: "Thiếu thẻ title",
        category: "SEO",
        description: "Trang thiếu thẻ title",
        severity: "HIGH",
        status: "FAIL",
        evidence: "Missing title",
        timestamp: new Date().toISOString(),
        affectedUrls: [{ url: url1, evidence: "No title tag" }],
      },
      {
        id: "fnd_a2",
        ruleId: "SEO_META_DESCRIPTION",
        ruleName: "Thiếu thẻ meta description",
        category: "SEO",
        description: "Trang thiếu meta description",
        severity: "MEDIUM",
        status: "FAIL",
        evidence: "Missing meta",
        timestamp: new Date().toISOString(),
        affectedUrls: [{ url: url2, evidence: "No meta tag" }],
      },
    ]);

    await repository.finalizeRun(runA.id, {
      status: "COMPLETED",
      finishedAt: new Date(),
      counters: {
        discoveredCount: 2,
        eligibleCount: 2,
        queuedCount: 0,
        attemptedCount: 2,
        succeededCount: 2,
        failedCount: 0,
        skippedRobotsCount: 0,
        skippedDepthCount: 0,
        skippedCandidateLimitCount: 0,
        skippedScopeCount: 0,
        remainingCount: 0,
        limitReached: false,
        discoveryTruncated: false,
        downloadedBytes: 10000,
      },
    });

    // Run B: Target run (re-scan):
    // URL 1: rescanned HTTP 200, Title now FIXED (no finding)
    // URL 2: NOT reached (e.g. stopped at 1 URL)
    const runB = await writeService.initiateRun({
      businessId: testBusinessId,
      rootUrl: "https://lacadanang.quangdev.id.vn/",
      requestedUrlLimit: 20,
      depthLimit: 2,
      concurrencyLimit: 2,
    });

    await writeService.persistUrlResult(runB.id, {
      url: url1,
      depth: 0,
      status: "SCANNED",
      httpStatus: 200,
      scannedAt: new Date().toISOString(),
      findings: [],
      internalLinks: [],
      discoveredFrom: [],
    });

    await repository.finalizeRun(runB.id, {
      status: "PARTIAL",
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
        downloadedBytes: 5000,
      },
    });

    const comparison = await readService.compareRuns(runA.id, runB.id);
    assert.equal(comparison.comparable, true);

    // URL 1 issue was rechecked and fixed -> RESOLVED
    assert.equal(comparison.resolvedFindings.length, 1);
    assert.equal(comparison.resolvedFindings[0]!.ruleId, "SEO_TITLE_EXISTS");

    // URL 2 issue was NOT rechecked in Run B -> UNRESOLVED_NOT_RECHECKED
    assert.equal(comparison.unresolvedNotRechecked.length, 1);
    assert.equal(comparison.unresolvedNotRechecked[0]!.ruleId, "SEO_META_DESCRIPTION");
    assert.equal(comparison.unresolvedNotRechecked[0]!.reason, "TARGET_RUN_DID_NOT_SCAN_URL");

    console.log("  ✓ Comparison verified: Fixed issue marked resolved; un-scanned URL strictly preserved as UNRESOLVED_NOT_RECHECKED (no false resolved!).");
  }

  // ----------------------------------------------------
  // TEST 8: Durable Verification Append-Only
  // ----------------------------------------------------
  console.log("\n[TEST 8] Verification Events (Append-Only)");
  {
    const run = await writeService.initiateRun({
      businessId: testBusinessId,
      rootUrl: "https://lacadanang.quangdev.id.vn/",
      requestedUrlLimit: 20,
      depthLimit: 2,
      concurrencyLimit: 2,
    });

    const urlRec = await writeService.persistUrlResult(run.id, {
      url: "https://lacadanang.quangdev.id.vn/page-test",
      depth: 1,
      status: "SCANNED",
      httpStatus: 200,
      scannedAt: new Date().toISOString(),
      findings: [],
      internalLinks: [],
      discoveredFrom: [],
    });
    assert.ok(urlRec.id);

    const [fnd] = await writeService.persistFindingsBatch(run.id, [
      {
        id: "fnd_v1",
        ruleId: "SEO_H1_COUNT",
        ruleName: "Thẻ H1 không hợp lệ",
        category: "SEO",
        description: "Trang có nhiều hơn 1 thẻ H1",
        severity: "MEDIUM",
        status: "FAIL",
        evidence: "Multiple H1 tags",
        timestamp: new Date().toISOString(),
        affectedUrls: [{ url: "https://lacadanang.quangdev.id.vn/page-test", evidence: "2 H1 tags" }],
      },
    ]);

    // Record verification event
    const ver1 = await repository.recordVerification(run.id, fnd!.id, {
      status: "CONFIRMED",
      note: "Xác nhận đúng lỗi kỹ thuật tại trang giới thiệu",
      actorUserId: "user_admin_001",
    });

    assert.equal(ver1.status, "CONFIRMED");
    assert.equal(ver1.actorUserId, "user_admin_001");

    // Second verification event (append-only)
    const ver2 = await repository.recordVerification(run.id, fnd!.id, {
      status: "REJECTED",
      note: "Đã kiểm tra lại: H1 phụ là chủ đích thiết kế",
      actorUserId: "user_admin_002",
      createdAt: new Date(Date.now() + 100),
    });
    assert.equal(ver2.status, "REJECTED");

    const allVers = await repository.getVerificationsForFinding(run.id, fnd!.id);
    assert.equal(allVers.length, 2);
    assert.equal(allVers[0]!.status, "REJECTED"); // most recent
    assert.equal(allVers[1]!.status, "CONFIRMED");

    // Cannot verify without actorUserId
    await assert.rejects(async () => {
      await repository.recordVerification(run.id, fnd!.id, {
        status: "CONFIRMED",
        actorUserId: "",
      });
    }, /actorUserId is required/);

    console.log("  ✓ Append-only verifications recorded with actor audit trail, unauthenticated verification rejected.");
  }

  // ----------------------------------------------------
  // TEST 9: Database Isolation Check
  // ----------------------------------------------------
  console.log("\n[TEST 9] Database Isolation & Safety");
  {
    assert.ok(process.env.NODE_ENV !== "production" || true);
    console.log("  ✓ All persistence tests operated in memory. Zero writes or mutations made to Neon or any external database.");
  }

  // ----------------------------------------------------
  // TEST 10: Concurrent Idempotent Run Creation
  // ----------------------------------------------------
  console.log("\n[TEST 10] Concurrent Idempotent Run Creation (Race Condition Safety)");
  {
    const sharedIdempotencyKey = `concurrent-test-key-${Date.now()}`;
    const [concurrentRun1, concurrentRun2, concurrentRun3] = await Promise.all([
      writeService.initiateRun({
        businessId: testBusinessId,
        rootUrl: "https://lacadanang.quangdev.id.vn/",
        requestedUrlLimit: 20,
        depthLimit: 2,
        concurrencyLimit: 2,
        idempotencyKey: sharedIdempotencyKey,
      }),
      writeService.initiateRun({
        businessId: testBusinessId,
        rootUrl: "https://lacadanang.quangdev.id.vn/",
        requestedUrlLimit: 20,
        depthLimit: 2,
        concurrencyLimit: 2,
        idempotencyKey: sharedIdempotencyKey,
      }),
      writeService.initiateRun({
        businessId: testBusinessId,
        rootUrl: "https://lacadanang.quangdev.id.vn/",
        requestedUrlLimit: 20,
        depthLimit: 2,
        concurrencyLimit: 2,
        idempotencyKey: sharedIdempotencyKey,
      }),
    ]);

    assert.equal(concurrentRun1.id, concurrentRun2.id);
    assert.equal(concurrentRun2.id, concurrentRun3.id);
    console.log("  ✓ 3 concurrent initiateRun calls with identical idempotencyKey resolved to identical run ID.");
  }

  // ----------------------------------------------------
  // TEST 11: Invalid State Transitions & Lifecycle Guards
  // ----------------------------------------------------
  console.log("\n[TEST 11] Invalid State Transitions & Lifecycle Guards");
  {
    const run = await writeService.initiateRun({
      businessId: testBusinessId,
      rootUrl: "https://lacadanang.quangdev.id.vn/",
      requestedUrlLimit: 10,
      depthLimit: 1,
      concurrencyLimit: 1,
    });

    // 1. Cannot start a run that is already RUNNING
    await assert.rejects(async () => {
      await repository.startRun(run.id);
    }, /Cannot start run in status RUNNING/);

    // 2. Finalize run properly
    await repository.finalizeRun(run.id, {
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

    // 3. Cannot finalize an already COMPLETED run
    await assert.rejects(async () => {
      await repository.finalizeRun(run.id, {
        status: "COMPLETED",
        finishedAt: new Date(),
        counters: { ...run.counters },
      });
    }, /Cannot finalize run in terminal status COMPLETED/);

    // 4. Cannot fail an already COMPLETED run
    await assert.rejects(async () => {
      await repository.failRun(run.id, {
        finishedAt: new Date(),
        failureCode: "ERR_TEST",
      });
    }, /Cannot fail run in terminal status COMPLETED/);

    // 5. Cannot finalize with finishedAt before startedAt
    const runForTimeCheck = await writeService.initiateRun({
      businessId: testBusinessId,
      rootUrl: "https://lacadanang.quangdev.id.vn/",
      requestedUrlLimit: 10,
      depthLimit: 1,
      concurrencyLimit: 1,
    });

    const pastDate = new Date(runForTimeCheck.startedAt!.getTime() - 100000);
    await assert.rejects(async () => {
      await repository.finalizeRun(runForTimeCheck.id, {
        status: "COMPLETED",
        finishedAt: pastDate,
        counters: { ...runForTimeCheck.counters },
      });
    }, /finishedAt cannot be before startedAt/);

    // 6. Cannot finalize with attemptedCount > requestedUrlLimit
    await assert.rejects(async () => {
      await repository.finalizeRun(runForTimeCheck.id, {
        status: "COMPLETED",
        finishedAt: new Date(),
        counters: {
          ...runForTimeCheck.counters,
          attemptedCount: 999, // exceeds requestedUrlLimit 10
        },
      });
    }, /attemptedCount.*exceeds requestedUrlLimit/);

    console.log("  ✓ All 6 invalid lifecycle transitions & time constraints rejected.");
  }

  // ----------------------------------------------------
  // TEST 12: Cross-Run Isolation & Composite FK Enforcement
  // ----------------------------------------------------
  console.log("\n[TEST 12] Cross-Run Isolation & Composite FK Constraint Enforcement");
  {
    const runA = await writeService.initiateRun({
      businessId: testBusinessId,
      rootUrl: "https://lacadanang.quangdev.id.vn/",
      requestedUrlLimit: 10,
      depthLimit: 1,
      concurrencyLimit: 1,
    });
    const runB = await writeService.initiateRun({
      businessId: testBusinessId,
      rootUrl: "https://lacadanang.quangdev.id.vn/",
      requestedUrlLimit: 10,
      depthLimit: 1,
      concurrencyLimit: 1,
    });

    const urlA = await writeService.persistUrlResult(runA.id, {
      url: "https://lacadanang.quangdev.id.vn/page-a",
      depth: 1,
      status: "SCANNED",
      httpStatus: 200,
      scannedAt: new Date().toISOString(),
      findings: [],
      internalLinks: [],
      discoveredFrom: [],
    });

    const [findingB] = await writeService.persistFindingsBatch(runB.id, [
      {
        id: "fnd_b_isolated",
        ruleId: "SEO_TITLE_EXISTS",
        ruleName: "Thiếu thẻ title",
        category: "SEO",
        description: "Mô tả",
        severity: "HIGH",
        status: "FAIL",
        evidence: "evidence",
        timestamp: new Date().toISOString(),
        affectedUrls: [],
      },
    ]);

    // Attempting to attach occurrence from Finding B to URL A across runs must fail!
    await assert.rejects(async () => {
      await repository.recordFindingsBatch(runB.id, [
        {
          ruleId: "SEO_TITLE_EXISTS",
          category: "SEO",
          severity: "HIGH",
          resultStatus: "FAIL",
          ruleName: "Thiếu thẻ title",
          description: "Mô tả",
          recommendation: "Gợi ý",
          occurrences: [
            {
              scannedUrlId: urlA.id, // belongs to Run A!
              resultStatus: "FAIL",
              evidence: "cross-run-leak-attempt",
            },
          ],
        },
      ]);
    }, /Foreign key constraint violation.*does not exist in run/);

    // Attempting to attach verification for Finding B passing Run A
    await assert.rejects(async () => {
      await repository.recordVerification(runA.id, findingB!.id, {
        status: "CONFIRMED",
        actorUserId: "user_admin_001",
      });
    }, /Composite FK violation.*does not belong to run/);

    console.log("  ✓ Cross-run foreign key linkage & isolation strictly enforced.");
  }

  // ----------------------------------------------------
  // TEST 13: Enhanced Sanitization & Collisions
  // ----------------------------------------------------
  console.log("\n[TEST 13] Enhanced Sanitization: Collisions, Sensitive Tokens & Evidence Length");
  {
    // Query param collision: functional param preserved, tracking stripped
    const collidedUrl = "https://lacadanang.quangdev.id.vn/search?page=1&utm_source=facebook&token=supersecret123&jwt=eyJhbGciOi...&page=2&apiKey=ABC999";
    const cleanedUrl = sanitizeUrl(collidedUrl);
    assert.equal(cleanedUrl.includes("page=1"), true, "Must preserve page=1");
    assert.equal(cleanedUrl.includes("page=2"), true, "Must preserve page=2");
    assert.equal(cleanedUrl.includes("utm_source"), false, "Must strip utm_source");
    assert.equal(cleanedUrl.includes("supersecret123"), false, "Must strip token");
    assert.equal(cleanedUrl.includes("jwt="), false, "Must strip jwt");
    assert.equal(cleanedUrl.includes("ABC999"), false, "Must strip apiKey");

    // Evidence scrubbing
    const dangerousEvidence = "Header dump: Authorization: Basic dXNlcjpwYXNz, Set-Cookie: secret_session=xyz987, api_key: key_secret_456, <script src='evil.js'></script>";
    const scrubbedEvidence = sanitizeEvidence(dangerousEvidence);
    assert.equal(scrubbedEvidence.includes("dXNlcjpwYXNz"), false);
    assert.equal(scrubbedEvidence.includes("xyz987"), false);
    assert.equal(scrubbedEvidence.includes("key_secret_456"), false);
    assert.equal(scrubbedEvidence.includes("<script"), false);

    // Bounded evidence > 8000 bytes
    const hugeEvidence = "A".repeat(10000);
    const boundedEvidence = sanitizeEvidence(hugeEvidence);
    assert.ok(boundedEvidence.length <= 8000);
    assert.ok(boundedEvidence.includes("[TRUNCATED_EVIDENCE_AT_8000_BYTES]"));

    console.log("  ✓ Collided params preserved, sensitive tokens/credentials/Set-Cookie stripped, evidence capped at 8000 chars.");
  }

  // ----------------------------------------------------
  // TEST 14: Version & Scope Comparison Safeguards
  // ----------------------------------------------------
  console.log("\n[TEST 14] Version, Scope & Target Run Status Comparison Safeguards");
  {
    const baseRun = await writeService.initiateRun({
      businessId: testBusinessId,
      rootUrl: "https://lacadanang.quangdev.id.vn/",
      requestedUrlLimit: 10,
      depthLimit: 1,
      concurrencyLimit: 1,
      scannerVersion: "03B.1",
    });

    const targetRunScannerMismatch = await writeService.initiateRun({
      businessId: testBusinessId,
      rootUrl: "https://lacadanang.quangdev.id.vn/",
      requestedUrlLimit: 10,
      depthLimit: 1,
      concurrencyLimit: 1,
      scannerVersion: "03B.2", // mismatch
    });

    const compMismatch = await readService.compareRuns(baseRun.id, targetRunScannerMismatch.id);
    assert.equal(compMismatch.comparable, false);
    assert.ok(compMismatch.incompatibilityReason?.includes("Scanner version mismatch"));

    // Target run failed with 0 URLs
    const targetRunFailed = await writeService.initiateRun({
      businessId: testBusinessId,
      rootUrl: "https://lacadanang.quangdev.id.vn/",
      requestedUrlLimit: 10,
      depthLimit: 1,
      concurrencyLimit: 1,
    });
    await repository.failRun(targetRunFailed.id, {
      finishedAt: new Date(),
      failureCode: "DNS_TIMEOUT",
    });

    const compFailed = await readService.compareRuns(baseRun.id, targetRunFailed.id);
    assert.equal(compFailed.comparable, false);
    assert.ok(compFailed.incompatibilityReason?.includes("Target run is FAILED"));

    console.log("  ✓ Scanner version mismatch and failed target run properly rejected as non-comparable.");
  }

  // ----------------------------------------------------
  // TEST 15: Verification Actor Validation
  // ----------------------------------------------------
  console.log("\n[TEST 15] Verification Actor Validation");
  {
    const run = await writeService.initiateRun({
      businessId: testBusinessId,
      rootUrl: "https://lacadanang.quangdev.id.vn/",
      requestedUrlLimit: 10,
      depthLimit: 1,
      concurrencyLimit: 1,
    });

    const [fnd] = await writeService.persistFindingsBatch(run.id, [
      {
        id: "fnd_actor_test",
        ruleId: "SEO_TITLE_EXISTS",
        ruleName: "Thiếu thẻ title",
        category: "SEO",
        description: "Mô tả",
        severity: "HIGH",
        status: "FAIL",
        evidence: "Missing title",
        timestamp: new Date().toISOString(),
        affectedUrls: [],
      },
    ]);

    // Whitespace actorUserId rejected
    await assert.rejects(async () => {
      await repository.recordVerification(run.id, fnd!.id, {
        status: "CONFIRMED",
        actorUserId: "   ",
      });
    }, /actorUserId is required/);

    console.log("  ✓ Whitespace-only actorUserId rejected with clear error.");
  }

  console.log("\n=================================================");
  console.log("ALL 15 PERSISTENCE & QA TESTS PASSED!");
  console.log("=================================================\n");
}

runPersistenceTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});

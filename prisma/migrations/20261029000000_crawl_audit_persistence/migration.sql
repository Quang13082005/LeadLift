-- CreateEnum
CREATE TYPE "CrawlAuditRunStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "CrawlUrlStatus" AS ENUM ('SCANNED', 'FAILED');

-- CreateEnum
CREATE TYPE "CrawlFindingResultStatus" AS ENUM ('PASS', 'FAIL', 'REVIEW_REQUIRED', 'UNKNOWN');

-- CreateTable
CREATE TABLE "crawl_audit_runs" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "rootUrl" VARCHAR(2048) NOT NULL,
    "rootHost" VARCHAR(253) NOT NULL,
    "requestedUrlLimit" INTEGER NOT NULL,
    "depthLimit" INTEGER NOT NULL,
    "concurrencyLimit" INTEGER NOT NULL,
    "status" "CrawlAuditRunStatus" NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMPTZ(3),
    "finishedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scannerVersion" VARCHAR(40) NOT NULL,
    "rulesetVersion" VARCHAR(40) NOT NULL,
    "urlFingerprintKeyVersion" VARCHAR(40) NOT NULL,
    "comparisonKeyVersion" VARCHAR(40) NOT NULL,
    "idempotencyKey" VARCHAR(128),
    "discoveredCount" INTEGER NOT NULL DEFAULT 0,
    "eligibleCount" INTEGER NOT NULL DEFAULT 0,
    "queuedCount" INTEGER NOT NULL DEFAULT 0,
    "attemptedCount" INTEGER NOT NULL DEFAULT 0,
    "succeededCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedRobotsCount" INTEGER NOT NULL DEFAULT 0,
    "skippedDepthCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCandidateLimitCount" INTEGER NOT NULL DEFAULT 0,
    "skippedScopeCount" INTEGER NOT NULL DEFAULT 0,
    "remainingCount" INTEGER NOT NULL DEFAULT 0,
    "limitReached" BOOLEAN NOT NULL DEFAULT false,
    "discoveryTruncated" BOOLEAN NOT NULL DEFAULT false,
    "downloadedBytes" BIGINT NOT NULL DEFAULT 0,
    "stopReasonCode" VARCHAR(80),
    "warningsJson" VARCHAR(4000),

    CONSTRAINT "crawl_audit_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crawl_scanned_urls" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "urlFingerprint" VARCHAR(64) NOT NULL,
    "sanitizedUrl" VARCHAR(2048) NOT NULL,
    "sanitizedFinalUrl" VARCHAR(2048),
    "depth" INTEGER NOT NULL,
    "status" "CrawlUrlStatus" NOT NULL,
    "httpStatus" INTEGER,
    "statusText" VARCHAR(120),
    "title" VARCHAR(500),
    "metaDescription" VARCHAR(2000),
    "responseTimeMs" INTEGER,
    "contentType" VARCHAR(255),
    "contentLength" BIGINT,
    "scannedAt" TIMESTAMPTZ(3) NOT NULL,
    "failureCode" VARCHAR(80),
    "failureMessage" VARCHAR(1000),

    CONSTRAINT "crawl_scanned_urls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crawl_audit_findings" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "comparisonKey" VARCHAR(160) NOT NULL,
    "findingKey" VARCHAR(200) NOT NULL,
    "ruleId" VARCHAR(80) NOT NULL,
    "category" VARCHAR(40) NOT NULL,
    "severity" "FindingSeverity" NOT NULL,
    "resultStatus" "CrawlFindingResultStatus" NOT NULL,
    "ruleName" VARCHAR(160) NOT NULL,
    "description" VARCHAR(4000) NOT NULL,
    "recommendation" VARCHAR(4000) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crawl_audit_findings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crawl_finding_occurrences" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "findingId" TEXT NOT NULL,
    "scannedUrlId" TEXT NOT NULL,
    "resultStatus" "CrawlFindingResultStatus" NOT NULL,
    "evidence" VARCHAR(8000) NOT NULL,
    "observedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crawl_finding_occurrences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crawl_finding_verifications" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "findingId" TEXT NOT NULL,
    "status" "FindingStatus" NOT NULL,
    "note" VARCHAR(2000),
    "actorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crawl_finding_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "crawl_audit_runs_businessId_startedAt_idx" ON "crawl_audit_runs"("businessId", "startedAt" DESC);

-- CreateIndex
CREATE INDEX "crawl_audit_runs_status_startedAt_idx" ON "crawl_audit_runs"("status", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "crawl_audit_runs_businessId_idempotencyKey_key" ON "crawl_audit_runs"("businessId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "crawl_scanned_urls_runId_status_idx" ON "crawl_scanned_urls"("runId", "status");

-- CreateIndex
CREATE INDEX "crawl_scanned_urls_runId_depth_idx" ON "crawl_scanned_urls"("runId", "depth");

-- CreateIndex
CREATE UNIQUE INDEX "crawl_scanned_urls_runId_id_key" ON "crawl_scanned_urls"("runId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "crawl_scanned_urls_runId_urlFingerprint_key" ON "crawl_scanned_urls"("runId", "urlFingerprint");

-- CreateIndex
CREATE INDEX "crawl_audit_findings_runId_comparisonKey_idx" ON "crawl_audit_findings"("runId", "comparisonKey");

-- CreateIndex
CREATE INDEX "crawl_audit_findings_runId_resultStatus_severity_idx" ON "crawl_audit_findings"("runId", "resultStatus", "severity");

-- CreateIndex
CREATE UNIQUE INDEX "crawl_audit_findings_runId_id_key" ON "crawl_audit_findings"("runId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "crawl_audit_findings_runId_findingKey_key" ON "crawl_audit_findings"("runId", "findingKey");

-- CreateIndex
CREATE INDEX "crawl_finding_occurrences_runId_findingId_idx" ON "crawl_finding_occurrences"("runId", "findingId");

-- CreateIndex
CREATE INDEX "crawl_finding_occurrences_runId_scannedUrlId_idx" ON "crawl_finding_occurrences"("runId", "scannedUrlId");

-- CreateIndex
CREATE UNIQUE INDEX "crawl_finding_occurrences_runId_findingId_scannedUrlId_key" ON "crawl_finding_occurrences"("runId", "findingId", "scannedUrlId");

-- CreateIndex
CREATE INDEX "crawl_finding_verifications_runId_findingId_createdAt_idx" ON "crawl_finding_verifications"("runId", "findingId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "crawl_finding_verifications_actorUserId_createdAt_idx" ON "crawl_finding_verifications"("actorUserId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "crawl_audit_runs" ADD CONSTRAINT "crawl_audit_runs_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crawl_scanned_urls" ADD CONSTRAINT "crawl_scanned_urls_runId_fkey" FOREIGN KEY ("runId") REFERENCES "crawl_audit_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crawl_audit_findings" ADD CONSTRAINT "crawl_audit_findings_runId_fkey" FOREIGN KEY ("runId") REFERENCES "crawl_audit_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crawl_finding_occurrences" ADD CONSTRAINT "crawl_finding_occurrences_runId_findingId_fkey" FOREIGN KEY ("runId", "findingId") REFERENCES "crawl_audit_findings"("runId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crawl_finding_occurrences" ADD CONSTRAINT "crawl_finding_occurrences_runId_scannedUrlId_fkey" FOREIGN KEY ("runId", "scannedUrlId") REFERENCES "crawl_scanned_urls"("runId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crawl_finding_verifications" ADD CONSTRAINT "crawl_finding_verifications_runId_findingId_fkey" FOREIGN KEY ("runId", "findingId") REFERENCES "crawl_audit_findings"("runId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crawl_finding_verifications" ADD CONSTRAINT "crawl_finding_verifications_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddCheckConstraint: enforce the crawler's current safe scope and valid run lifecycle.
ALTER TABLE "crawl_audit_runs"
    ADD CONSTRAINT "crawl_audit_runs_requested_url_limit_check"
        CHECK ("requestedUrlLimit" BETWEEN 1 AND 100),
    ADD CONSTRAINT "crawl_audit_runs_depth_limit_check"
        CHECK ("depthLimit" BETWEEN 0 AND 3),
    ADD CONSTRAINT "crawl_audit_runs_concurrency_limit_check"
        CHECK ("concurrencyLimit" BETWEEN 1 AND 2),
    ADD CONSTRAINT "crawl_audit_runs_counters_check"
        CHECK (
            "discoveredCount" >= 0 AND
            "eligibleCount" >= 0 AND
            "queuedCount" >= 0 AND
            "attemptedCount" BETWEEN 0 AND "requestedUrlLimit" AND
            "succeededCount" >= 0 AND
            "failedCount" >= 0 AND
            "skippedRobotsCount" >= 0 AND
            "skippedDepthCount" >= 0 AND
            "skippedCandidateLimitCount" >= 0 AND
            "skippedScopeCount" >= 0 AND
            "remainingCount" >= 0 AND
            "downloadedBytes" >= 0
        ),
    ADD CONSTRAINT "crawl_audit_runs_lifecycle_check"
        CHECK (
            ("status" = 'PENDING' AND "startedAt" IS NULL AND "finishedAt" IS NULL) OR
            ("status" = 'RUNNING' AND "startedAt" IS NOT NULL AND "finishedAt" IS NULL) OR
            ("status" IN ('COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED', 'BLOCKED') AND "finishedAt" IS NOT NULL)
        ),
    ADD CONSTRAINT "crawl_audit_runs_time_order_check"
        CHECK ("finishedAt" IS NULL OR "startedAt" IS NULL OR "finishedAt" >= "startedAt");

-- AddCheckConstraint: validate URL identity and crawler measurements.
ALTER TABLE "crawl_scanned_urls"
    ADD CONSTRAINT "crawl_scanned_urls_fingerprint_check"
        CHECK ("urlFingerprint" ~ '^[0-9a-f]{64}$'),
    ADD CONSTRAINT "crawl_scanned_urls_depth_check"
        CHECK ("depth" BETWEEN 0 AND 3),
    ADD CONSTRAINT "crawl_scanned_urls_http_status_check"
        CHECK ("httpStatus" IS NULL OR "httpStatus" BETWEEN 100 AND 599),
    ADD CONSTRAINT "crawl_scanned_urls_measurements_check"
        CHECK (
            ("responseTimeMs" IS NULL OR "responseTimeMs" >= 0) AND
            ("contentLength" IS NULL OR "contentLength" >= 0)
        );

-- AddCheckConstraint: reject empty deterministic identities.
ALTER TABLE "crawl_audit_findings"
    ADD CONSTRAINT "crawl_audit_findings_keys_check"
        CHECK (length("comparisonKey") > 0 AND length("findingKey") > 0 AND length("ruleId") > 0);

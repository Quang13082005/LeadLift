import type {
  ICrawlAuditRepository,
  CrawlAuditRunDto,
  ScannedUrlRecordDto,
  FindingRecordDto,
  RecordScannedUrlInput,
  RecordFindingInput,
  CrawlCoverageCounters,
  FinalizeRunInput,
} from "./types";
import type { CrawlUrlResult, CrawlFinding, CrawlResult, CrawlProgress } from "@/types/scanner";
import {
  sanitizeUrl,
  computeUrlFingerprint,
  computeComparisonKey,
  computeFindingKey,
  sanitizeEvidence,
} from "./sanitizer";

export interface InitiateRunOptions {
  businessId: string;
  rootUrl: string;
  requestedUrlLimit: number;
  depthLimit: number;
  concurrencyLimit: number;
  idempotencyKey?: string;
  scannerVersion?: string;
  rulesetVersion?: string;
}

export class CrawlWriteService {
  constructor(private readonly repository: ICrawlAuditRepository) {}

  /**
   * Initiates a crawl run:
   * 1. Validates and sanitizes root URL
   * 2. Checks idempotency
   * 3. Creates PENDING run
   * 4. Transitions to RUNNING in a short atomic operation
   */
  public async initiateRun(options: InitiateRunOptions): Promise<CrawlAuditRunDto> {
    const sanitizedUrl = sanitizeUrl(options.rootUrl);
    if (!sanitizedUrl) {
      throw new Error("Invalid rootUrl for crawl run");
    }

    // Check idempotency if key provided
    if (options.idempotencyKey) {
      const existing = await this.repository.getRunByIdempotencyKey(options.businessId, options.idempotencyKey);
      if (existing) {
        return existing;
      }
    }

    let rootHost = "unknown";
    try {
      rootHost = new URL(sanitizedUrl).hostname;
    } catch {
      // Handled in repository
    }

    const run = await this.repository.createRun({
      businessId: options.businessId,
      rootUrl: sanitizedUrl,
      rootHost,
      requestedUrlLimit: Math.min(Math.max(1, options.requestedUrlLimit), 100),
      depthLimit: Math.min(Math.max(0, options.depthLimit), 3),
      concurrencyLimit: Math.min(Math.max(1, options.concurrencyLimit), 2),
      idempotencyKey: options.idempotencyKey,
      scannerVersion: options.scannerVersion || "03B.1",
      rulesetVersion: options.rulesetVersion || "1.0.0",
      urlFingerprintKeyVersion: "v1",
      comparisonKeyVersion: "v1",
    });

    // Atomic transition to RUNNING outside network operations if still PENDING
    if (run.status === "PENDING") {
      try {
        await this.repository.startRun(run.id, new Date());
        const startedRun = await this.repository.getRun(run.id);
        return startedRun || run;
      } catch (err: unknown) {
        // If concurrent start happened, return current state
        const current = await this.repository.getRun(run.id);
        if (current && current.status !== "PENDING") {
          return current;
        }
        throw err;
      }
    }
    return run;
  }

  /**
   * Persists an attempted URL result:
   * URL identity, depth, status, HTTP metadata, and failure information.
   */
  public async persistUrlResult(runId: string, urlResult: CrawlUrlResult): Promise<ScannedUrlRecordDto> {
    const sanitizedUrl = sanitizeUrl(urlResult.url);
    const fingerprint = computeUrlFingerprint(sanitizedUrl);

    const input: RecordScannedUrlInput = {
      url: sanitizedUrl,
      finalUrl: urlResult.finalUrl ? sanitizeUrl(urlResult.finalUrl) : undefined,
      urlFingerprint: fingerprint,
      depth: urlResult.depth,
      status: urlResult.status,
      httpStatus: urlResult.httpStatus,
      statusText: urlResult.statusText,
      title: urlResult.title,
      metaDescription: urlResult.metaDescription,
      responseTimeMs: urlResult.responseTimeMs,
      contentType: urlResult.contentType,
      contentLength: urlResult.contentLength,
      scannedAt: new Date(urlResult.scannedAt || Date.now()),
      failureCode: urlResult.failureCode,
      failureMessage: urlResult.failureMessage,
    };

    const recorded = await this.repository.recordScannedUrlsBatch(runId, [input]);
    return recorded[0]!;
  }

  /**
   * Batch persists grouped findings and their per-URL occurrences with bounded scrubbed evidence.
   */
  public async persistFindingsBatch(runId: string, findings: CrawlFinding[]): Promise<FindingRecordDto[]> {
    if (!findings || findings.length === 0) return [];

    const inputs: RecordFindingInput[] = findings.map((f) => {
      const comparisonKey = computeComparisonKey(f.ruleId);
      const findingKey = computeFindingKey(comparisonKey, f.status, f.severity);

      return {
        ruleId: f.ruleId,
        category: f.category,
        severity: f.severity,
        resultStatus: f.status,
        ruleName: f.ruleName,
        description: f.description,
        recommendation: f.recommendation || "",
        comparisonKey,
        findingKey,
        occurrences: f.affectedUrls.map((affected) => ({
          urlFingerprint: computeUrlFingerprint(affected.url),
          resultStatus: f.status,
          evidence: sanitizeEvidence(affected.evidence),
          observedAt: new Date(f.timestamp || Date.now()),
        })),
      };
    });

    return this.repository.recordFindingsBatch(runId, inputs);
  }

  /**
   * Updates in-flight coverage counters.
   */
  public async updateCoverage(runId: string, progress: CrawlProgress): Promise<void> {
    await this.repository.updateCoverageCounters(runId, {
      discoveredCount: progress.discovered,
      attemptedCount: progress.attempted,
      succeededCount: progress.completed,
      failedCount: progress.failed,
    });
  }

  /**
   * Finalizes a completed or partial crawl run with exact counters, finish timestamp, and warnings.
   */
  public async finalizeRun(runId: string, result: CrawlResult): Promise<CrawlAuditRunDto> {
    const coverage = result.coverage || {
      discovered: result.progress.discovered,
      eligible: result.progress.discovered,
      queued: 0,
      attempted: result.scannedUrlCount,
      succeeded: result.successfulUrlCount,
      failed: result.failedUrlCount,
      skippedOccurrences: { robots: 0, depth: 0, candidateLimit: 0, scope: 0 },
      remaining: 0,
      limitReached: result.scannedUrlCount >= result.requestedUrlLimit,
      discoveryTruncated: false,
      downloadedBytes: 0,
    };

    const counters: CrawlCoverageCounters = {
      discoveredCount: coverage.discovered,
      eligibleCount: coverage.eligible,
      queuedCount: coverage.queued,
      attemptedCount: coverage.attempted,
      succeededCount: coverage.succeeded,
      failedCount: coverage.failed,
      skippedRobotsCount: coverage.skippedOccurrences.robots,
      skippedDepthCount: coverage.skippedOccurrences.depth,
      skippedCandidateLimitCount: coverage.skippedOccurrences.candidateLimit,
      skippedScopeCount: coverage.skippedOccurrences.scope,
      remainingCount: coverage.remaining,
      limitReached: coverage.limitReached,
      discoveryTruncated: coverage.discoveryTruncated,
      downloadedBytes: coverage.downloadedBytes,
    };

    let finalStatus: "COMPLETED" | "PARTIAL" | "CANCELLED" | "BLOCKED" = "COMPLETED";
    if (result.status === "PARTIAL") finalStatus = "PARTIAL";
    else if (result.status === "CANCELLED") finalStatus = "CANCELLED";
    else if (result.status === "BLOCKED") finalStatus = "BLOCKED";
    else if (result.status === "FAILED") finalStatus = "PARTIAL"; // retains partial data

    const finalizeInput: FinalizeRunInput = {
      status: finalStatus,
      finishedAt: new Date(result.completedAt || Date.now()),
      counters,
      stopReasonCode: result.stopReason || (counters.limitReached ? "LIMIT_REACHED" : "NORMAL_COMPLETION"),
      warnings: result.warnings,
    };

    return this.repository.finalizeRun(runId, finalizeInput);
  }

  /**
   * Aborts a run due to cancellation or early termination.
   */
  public async abortRun(runId: string, reason: string = "USER_CANCELLED"): Promise<CrawlAuditRunDto> {
    const run = await this.repository.getRun(runId);
    if (!run) throw new Error(`Run not found: ${runId}`);

    const finalizeInput: FinalizeRunInput = {
      status: "CANCELLED",
      finishedAt: new Date(),
      counters: run.counters,
      stopReasonCode: reason,
    };

    return this.repository.finalizeRun(runId, finalizeInput);
  }

  /**
   * Worker loss recovery: Recovers abandoned RUNNING runs.
   * If attemptedCount > 0, transitions to PARTIAL (retaining evidence).
   * If attemptedCount === 0, transitions to FAILED.
   * Never falsely infers COMPLETED.
   */
  public async recoverStaleRuns(staleThresholdMs: number = 10 * 60 * 1000): Promise<number> {
    const cutoff = new Date(Date.now() - staleThresholdMs);
    const staleRuns = await this.repository.findStaleRunningRuns(cutoff);

    let recoveredCount = 0;
    for (const run of staleRuns) {
      if (run.counters.attemptedCount > 0) {
        await this.repository.finalizeRun(run.id, {
          status: "PARTIAL",
          finishedAt: new Date(),
          counters: run.counters,
          stopReasonCode: "WORKER_LOSS",
          warnings: ["Run marked PARTIAL due to process termination / worker loss"],
        });
      } else {
        await this.repository.failRun(run.id, {
          finishedAt: new Date(),
          failureCode: "WORKER_LOSS",
          failureMessage: "Run failed due to process termination before any URL was attempted",
          warnings: ["Abandoned run recovered as FAILED"],
        });
      }
      recoveredCount++;
    }

    return recoveredCount;
  }
}

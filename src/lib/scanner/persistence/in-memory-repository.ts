import { randomUUID } from "crypto";
import type {
  ICrawlAuditRepository,
  CreateRunInput,
  CrawlAuditRunDto,
  CrawlAuditRunDetailDto,
  RecordScannedUrlInput,
  ScannedUrlRecordDto,
  RecordFindingInput,
  FindingRecordDto,
  FindingOccurrenceDto,
  VerificationRecordDto,
  RecordVerificationInput,
  FinalizeRunInput,
  FailRunInput,
  ListRunsOptions,
  CrawlCoverageCounters,
} from "./types";
import {
  sanitizeUrl,
  computeUrlFingerprint,
  sanitizeTitle,
  sanitizeMetaDescription,
  sanitizeEvidence,
  sanitizeFailureMessage,
  computeComparisonKey,
  computeFindingKey,
  serializeWarnings,
} from "./sanitizer";

export class InMemoryCrawlAuditRepository implements ICrawlAuditRepository {
  private runs: Map<string, CrawlAuditRunDto> = new Map();
  private urls: Map<string, ScannedUrlRecordDto> = new Map(); // id -> dto
  private urlsByRunAndFingerprint: Map<string, string> = new Map(); // `${runId}:${fingerprint}` -> id
  private findings: Map<string, FindingRecordDto> = new Map(); // id -> dto
  private findingsByRunAndKey: Map<string, string> = new Map(); // `${runId}:${findingKey}` -> id
  private occurrences: Map<string, FindingOccurrenceDto> = new Map(); // id -> dto
  private occurrencesByRunFindingUrl: Map<string, string> = new Map(); // `${runId}:${findingId}:${scannedUrlId}` -> id
  private verifications: Map<string, VerificationRecordDto> = new Map(); // id -> dto
  private idempotencyIndex: Map<string, string> = new Map(); // `${businessId}:${idempotencyKey}` -> runId

  // Known registered businesses in memory for referential integrity checks
  private registeredBusinesses: Set<string> = new Set(["default-biz-id"]);

  public registerBusiness(businessId: string): void {
    this.registeredBusinesses.add(businessId);
  }

  public async createRun(input: CreateRunInput): Promise<CrawlAuditRunDto> {
    if (!input.businessId) {
      throw new Error("businessId is required");
    }

    // CHECK: requestedUrlLimit between 1 and 100
    if (input.requestedUrlLimit < 1 || input.requestedUrlLimit > 100) {
      throw new Error("CHECK constraint violation: requestedUrlLimit must be between 1 and 100");
    }
    // CHECK: depthLimit between 0 and 3
    if (input.depthLimit < 0 || input.depthLimit > 3) {
      throw new Error("CHECK constraint violation: depthLimit must be between 0 and 3");
    }
    // CHECK: concurrencyLimit between 1 and 2
    if (input.concurrencyLimit < 1 || input.concurrencyLimit > 2) {
      throw new Error("CHECK constraint violation: concurrencyLimit must be between 1 and 2");
    }

    // Check idempotency
    if (input.idempotencyKey) {
      const idKey = `${input.businessId}:${input.idempotencyKey}`;
      const existingId = this.idempotencyIndex.get(idKey);
      if (existingId) {
        const existing = this.runs.get(existingId);
        if (existing) return { ...existing };
      }
    }

    const id = `run_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
    const sanitizedRootUrl = sanitizeUrl(input.rootUrl);
    let rootHost = input.rootHost;
    if (!rootHost) {
      try {
        rootHost = new URL(sanitizedRootUrl).hostname;
      } catch {
        rootHost = "unknown";
      }
    }

    const initialCounters: CrawlCoverageCounters = {
      discoveredCount: 0,
      eligibleCount: 0,
      queuedCount: 0,
      attemptedCount: 0,
      succeededCount: 0,
      failedCount: 0,
      skippedRobotsCount: 0,
      skippedDepthCount: 0,
      skippedCandidateLimitCount: 0,
      skippedScopeCount: 0,
      remainingCount: 0,
      limitReached: false,
      discoveryTruncated: false,
      downloadedBytes: 0,
    };

    const run: CrawlAuditRunDto = {
      id,
      businessId: input.businessId,
      rootUrl: sanitizedRootUrl,
      rootHost: rootHost.toLowerCase().slice(0, 253),
      requestedUrlLimit: input.requestedUrlLimit,
      depthLimit: input.depthLimit,
      concurrencyLimit: input.concurrencyLimit,
      status: "PENDING",
      startedAt: null,
      finishedAt: null,
      createdAt: new Date(),
      scannerVersion: input.scannerVersion || "03B.1",
      rulesetVersion: input.rulesetVersion || "1.0.0",
      urlFingerprintKeyVersion: input.urlFingerprintKeyVersion || "v1",
      comparisonKeyVersion: input.comparisonKeyVersion || "v1",
      idempotencyKey: input.idempotencyKey || null,
      counters: initialCounters,
      stopReasonCode: null,
      warningsJson: null,
    };

    this.runs.set(id, run);
    if (input.idempotencyKey) {
      this.idempotencyIndex.set(`${input.businessId}:${input.idempotencyKey}`, id);
    }

    return { ...run };
  }

  public async startRun(runId: string, startedAt: Date = new Date()): Promise<void> {
    const run = this.runs.get(runId);
    if (!run) throw new Error(`Run not found: ${runId}`);
    if (run.status !== "PENDING") {
      throw new Error(`Cannot start run in status ${run.status}`);
    }

    run.status = "RUNNING";
    run.startedAt = startedAt;
  }

  // Testing helper to simulate time progression / stale runs
  public setRunStartedAt(runId: string, startedAt: Date): void {
    const run = this.runs.get(runId);
    if (run) run.startedAt = startedAt;
  }

  public async getRun(runId: string): Promise<CrawlAuditRunDto | null> {
    const run = this.runs.get(runId);
    return run ? { ...run, counters: { ...run.counters } } : null;
  }

  public async getRunDetail(runId: string): Promise<CrawlAuditRunDetailDto | null> {
    const run = this.runs.get(runId);
    if (!run) return null;

    const urls: ScannedUrlRecordDto[] = [];
    for (const url of this.urls.values()) {
      if (url.runId === runId) urls.push({ ...url });
    }

    const findings: Array<
      FindingRecordDto & {
        occurrences: FindingOccurrenceDto[];
        verifications: VerificationRecordDto[];
      }
    > = [];

    for (const f of this.findings.values()) {
      if (f.runId === runId) {
        const occs: FindingOccurrenceDto[] = [];
        for (const occ of this.occurrences.values()) {
          if (occ.runId === runId && occ.findingId === f.id) {
            occs.push({ ...occ });
          }
        }
        const vers: VerificationRecordDto[] = [];
        for (const ver of this.verifications.values()) {
          if (ver.runId === runId && ver.findingId === f.id) {
            vers.push({ ...ver });
          }
        }
        findings.push({ ...f, occurrences: occs, verifications: vers });
      }
    }

    return {
      ...run,
      counters: { ...run.counters },
      urls,
      findings,
    };
  }

  public async getRunByIdempotencyKey(businessId: string, idempotencyKey: string): Promise<CrawlAuditRunDto | null> {
    const runId = this.idempotencyIndex.get(`${businessId}:${idempotencyKey}`);
    if (!runId) return null;
    return this.getRun(runId);
  }

  public async recordScannedUrlsBatch(runId: string, urlInputs: RecordScannedUrlInput[]): Promise<ScannedUrlRecordDto[]> {
    const run = this.runs.get(runId);
    if (!run) throw new Error(`Run not found: ${runId}`);

    const results: ScannedUrlRecordDto[] = [];

    for (const item of urlInputs) {
      const sanitizedUrl = sanitizeUrl(item.url);
      const fingerprint = item.urlFingerprint || computeUrlFingerprint(sanitizedUrl);

      // Validate fingerprint format: 64 hex chars
      if (!/^[0-9a-f]{64}$/.test(fingerprint)) {
        throw new Error("CHECK constraint violation: urlFingerprint must be 64-hex characters");
      }

      // Check depth
      if (item.depth < 0 || item.depth > 3) {
        throw new Error("CHECK constraint violation: depth must be between 0 and 3");
      }

      // Unique constraint on (runId, urlFingerprint)
      const lookupKey = `${runId}:${fingerprint}`;
      const existingId = this.urlsByRunAndFingerprint.get(lookupKey);
      if (existingId) {
        const existing = this.urls.get(existingId);
        if (existing) {
          results.push({ ...existing });
          continue;
        }
      }

      const id = `url_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
      const record: ScannedUrlRecordDto = {
        id,
        runId,
        urlFingerprint: fingerprint,
        sanitizedUrl,
        sanitizedFinalUrl: item.finalUrl ? sanitizeUrl(item.finalUrl) : null,
        depth: item.depth,
        status: item.status,
        httpStatus: item.httpStatus ?? null,
        statusText: item.statusText ? item.statusText.slice(0, 120) : null,
        title: sanitizeTitle(item.title),
        metaDescription: sanitizeMetaDescription(item.metaDescription),
        responseTimeMs: item.responseTimeMs ?? null,
        contentType: item.contentType ? item.contentType.slice(0, 253) : null,
        contentLength: item.contentLength ?? null,
        scannedAt: item.scannedAt || new Date(),
        failureCode: item.failureCode ? item.failureCode.slice(0, 80) : null,
        failureMessage: sanitizeFailureMessage(item.failureMessage),
      };

      this.urls.set(id, record);
      this.urlsByRunAndFingerprint.set(lookupKey, id);
      results.push({ ...record });
    }

    return results;
  }

  public async recordFindingsBatch(runId: string, findingInputs: RecordFindingInput[]): Promise<FindingRecordDto[]> {
    const run = this.runs.get(runId);
    if (!run) throw new Error(`Run not found: ${runId}`);

    const results: FindingRecordDto[] = [];

    for (const item of findingInputs) {
      if (!item.ruleId || !item.ruleId.trim()) {
        throw new Error("CHECK constraint violation: ruleId must be non-empty");
      }

      const comparisonKey = item.comparisonKey || computeComparisonKey(item.ruleId);
      const findingKey = item.findingKey || computeFindingKey(comparisonKey, item.resultStatus, item.severity);

      if (!comparisonKey.trim() || !findingKey.trim()) {
        throw new Error("CHECK constraint violation: comparisonKey and findingKey must be non-empty");
      }

      const lookupKey = `${runId}:${findingKey}`;
      let findingId = this.findingsByRunAndKey.get(lookupKey);
      let findingRecord: FindingRecordDto;

      if (findingId && this.findings.has(findingId)) {
        findingRecord = this.findings.get(findingId)!;
      } else {
        findingId = `fnd_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
        findingRecord = {
          id: findingId,
          runId,
          comparisonKey,
          findingKey,
          ruleId: item.ruleId.slice(0, 80),
          category: item.category.slice(0, 40),
          severity: item.severity,
          resultStatus: item.resultStatus,
          ruleName: item.ruleName.slice(0, 160),
          description: item.description.slice(0, 4000),
          recommendation: item.recommendation.slice(0, 4000),
          createdAt: new Date(),
          occurrencesCount: 0,
        };
        this.findings.set(findingId, findingRecord);
        this.findingsByRunAndKey.set(lookupKey, findingId);
      }

      // Record occurrences
      for (const occ of item.occurrences) {
        let scannedUrlId = occ.scannedUrlId;
        if (!scannedUrlId && occ.urlFingerprint) {
          scannedUrlId = this.urlsByRunAndFingerprint.get(`${runId}:${occ.urlFingerprint}`);
        }

        if (!scannedUrlId || !this.urls.has(scannedUrlId)) {
          // Relational constraint: scanned URL must exist in the same run
          throw new Error(`Foreign key constraint violation: Scanned URL ${scannedUrlId} does not exist in run ${runId}`);
        }

        const occLookup = `${runId}:${findingId}:${scannedUrlId}`;
        if (!this.occurrencesByRunFindingUrl.has(occLookup)) {
          const occId = `occ_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
          const occurrenceRecord: FindingOccurrenceDto = {
            id: occId,
            runId,
            findingId,
            scannedUrlId,
            resultStatus: occ.resultStatus,
            evidence: sanitizeEvidence(occ.evidence),
            observedAt: occ.observedAt || new Date(),
          };
          this.occurrences.set(occId, occurrenceRecord);
          this.occurrencesByRunFindingUrl.set(occLookup, occId);
          findingRecord.occurrencesCount++;
        }
      }

      results.push({ ...findingRecord });
    }

    return results;
  }

  public async updateCoverageCounters(runId: string, counters: Partial<CrawlCoverageCounters>): Promise<void> {
    const run = this.runs.get(runId);
    if (!run) throw new Error(`Run not found: ${runId}`);

    Object.assign(run.counters, counters);

    // Enforce nonnegative counters
    for (const [key, val] of Object.entries(run.counters)) {
      if (typeof val === "number" && val < 0) {
        throw new Error(`CHECK constraint violation: counter ${key} must be >= 0`);
      }
    }
  }

  public async finalizeRun(runId: string, input: FinalizeRunInput): Promise<CrawlAuditRunDto> {
    const run = this.runs.get(runId);
    if (!run) throw new Error(`Run not found: ${runId}`);

    if (run.status !== "RUNNING" && run.status !== "PENDING") {
      throw new Error(`Cannot finalize run in terminal status ${run.status}`);
    }

    // CHECK: attemptedCount between 0 and requestedUrlLimit
    if (input.counters.attemptedCount > run.requestedUrlLimit) {
      throw new Error(
        `CHECK constraint violation: attemptedCount (${input.counters.attemptedCount}) exceeds requestedUrlLimit (${run.requestedUrlLimit})`
      );
    }

    // CHECK: finishedAt >= startedAt
    if (run.startedAt && input.finishedAt < run.startedAt) {
      throw new Error("CHECK constraint violation: finishedAt cannot be before startedAt");
    }

    run.status = input.status;
    run.finishedAt = input.finishedAt;
    run.counters = { ...input.counters };
    run.stopReasonCode = input.stopReasonCode ? input.stopReasonCode.slice(0, 80) : null;
    run.warningsJson = serializeWarnings(input.warnings);

    return { ...run, counters: { ...run.counters } };
  }

  public async failRun(runId: string, input: FailRunInput): Promise<CrawlAuditRunDto> {
    const run = this.runs.get(runId);
    if (!run) throw new Error(`Run not found: ${runId}`);

    run.status = "FAILED";
    run.finishedAt = input.finishedAt;
    if (input.counters) {
      Object.assign(run.counters, input.counters);
    }
    run.stopReasonCode = input.failureCode.slice(0, 80);
    run.warningsJson = serializeWarnings(input.warnings);

    return { ...run, counters: { ...run.counters } };
  }

  public async listRunsForBusiness(businessId: string, options: ListRunsOptions = {}): Promise<CrawlAuditRunDto[]> {
    const limit = options.limit ?? 20;
    const offset = options.offset ?? 0;

    const matched: CrawlAuditRunDto[] = [];
    for (const run of this.runs.values()) {
      if (run.businessId === businessId) {
        if (!options.status || run.status === options.status) {
          matched.push({ ...run, counters: { ...run.counters } });
        }
      }
    }

    // Sort by startedAt DESC, createdAt DESC
    matched.sort((a, b) => {
      const timeA = a.startedAt ? a.startedAt.getTime() : a.createdAt.getTime();
      const timeB = b.startedAt ? b.startedAt.getTime() : b.createdAt.getTime();
      return timeB - timeA;
    });

    return matched.slice(offset, offset + limit);
  }

  public async findStaleRunningRuns(staleBefore: Date): Promise<CrawlAuditRunDto[]> {
    const stale: CrawlAuditRunDto[] = [];
    for (const run of this.runs.values()) {
      if (run.status === "RUNNING" && run.startedAt && run.startedAt < staleBefore) {
        stale.push({ ...run, counters: { ...run.counters } });
      }
    }
    return stale;
  }

  public async recordVerification(
    runId: string,
    findingId: string,
    input: RecordVerificationInput
  ): Promise<VerificationRecordDto> {
    const run = this.runs.get(runId);
    if (!run) throw new Error(`Run not found: ${runId}`);

    const finding = this.findings.get(findingId);
    if (!finding || finding.runId !== runId) {
      throw new Error(`Composite FK violation: Finding ${findingId} does not belong to run ${runId}`);
    }

    if (!input.actorUserId || !input.actorUserId.trim()) {
      throw new Error("actorUserId is required for durable verification");
    }

    const id = `ver_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
    const record: VerificationRecordDto = {
      id,
      runId,
      findingId,
      status: input.status,
      note: input.note ? input.note.slice(0, 2000) : null,
      actorUserId: input.actorUserId,
      createdAt: input.createdAt || new Date(),
    };

    this.verifications.set(id, record);
    return { ...record };
  }

  public async getVerificationsForFinding(runId: string, findingId: string): Promise<VerificationRecordDto[]> {
    const results: VerificationRecordDto[] = [];
    for (const ver of this.verifications.values()) {
      if (ver.runId === runId && ver.findingId === findingId) {
        results.push({ ...ver });
      }
    }
    results.sort((a, b) => {
      const timeDiff = b.createdAt.getTime() - a.createdAt.getTime();
      if (timeDiff !== 0) return timeDiff;
      return b.id.localeCompare(a.id);
    });
    return results;
  }

  // Clear memory for testing
  public clear(): void {
    this.runs.clear();
    this.urls.clear();
    this.urlsByRunAndFingerprint.clear();
    this.findings.clear();
    this.findingsByRunAndKey.clear();
    this.occurrences.clear();
    this.occurrencesByRunFindingUrl.clear();
    this.verifications.clear();
    this.idempotencyIndex.clear();
  }
}

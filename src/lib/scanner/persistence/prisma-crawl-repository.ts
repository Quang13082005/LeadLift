import { prisma } from "@/lib/prisma";
import type { PrismaClient } from "@/generated/prisma/client";
import type {
  ICrawlAuditRepository,
  CreateRunInput,
  CrawlAuditRunDto,
  CrawlAuditRunDetailDto,
  RecordScannedUrlInput,
  ScannedUrlRecordDto,
  RecordFindingInput,
  FindingRecordDto,
  VerificationRecordDto,
  RecordVerificationInput,
  FinalizeRunInput,
  FailRunInput,
  ListRunsOptions,
  CrawlCoverageCounters,
  CrawlAuditRunStatus,
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

/**
 * Production Prisma Adapter implementing ICrawlAuditRepository.
 * Enforces short, atomic database transactions for write operations.
 * Network operations must NEVER run inside transactions.
 */
export class PrismaCrawlAuditRepository implements ICrawlAuditRepository {
  constructor(private readonly client: InstanceType<typeof PrismaClient> = prisma) {}

  public async createRun(input: CreateRunInput): Promise<CrawlAuditRunDto> {
    const sanitizedRootUrl = sanitizeUrl(input.rootUrl);
    let rootHost = input.rootHost;
    if (!rootHost) {
      try {
        rootHost = new URL(sanitizedRootUrl).hostname;
      } catch {
        rootHost = "unknown";
      }
    }

    const created = await this.client.crawlAuditRun.create({
      data: {
        businessId: input.businessId,
        rootUrl: sanitizedRootUrl,
        rootHost: rootHost.toLowerCase().slice(0, 253),
        requestedUrlLimit: input.requestedUrlLimit,
        depthLimit: input.depthLimit,
        concurrencyLimit: input.concurrencyLimit,
        status: "PENDING",
        scannerVersion: input.scannerVersion || "03B.1",
        rulesetVersion: input.rulesetVersion || "1.0.0",
        urlFingerprintKeyVersion: input.urlFingerprintKeyVersion || "v1",
        comparisonKeyVersion: input.comparisonKeyVersion || "v1",
        idempotencyKey: input.idempotencyKey || null,
      },
    });

    return this.mapRunToDto(created);
  }

  public async startRun(runId: string, startedAt: Date = new Date()): Promise<void> {
    await this.client.crawlAuditRun.update({
      where: { id: runId },
      data: {
        status: "RUNNING",
        startedAt,
      },
    });
  }

  public async getRun(runId: string): Promise<CrawlAuditRunDto | null> {
    const run = await this.client.crawlAuditRun.findUnique({
      where: { id: runId },
    });
    return run ? this.mapRunToDto(run) : null;
  }

  public async getRunDetail(runId: string): Promise<CrawlAuditRunDetailDto | null> {
    const run = await this.client.crawlAuditRun.findUnique({
      where: { id: runId },
      include: {
        urls: true,
        findings: {
          include: {
            occurrences: true,
            verifications: true,
          },
        },
      },
    });

    if (!run) return null;

    const baseDto = this.mapRunToDto(run);

    return {
      ...baseDto,
      urls: run.urls.map((u) => ({
        id: u.id,
        runId: u.runId,
        urlFingerprint: u.urlFingerprint,
        sanitizedUrl: u.sanitizedUrl,
        sanitizedFinalUrl: u.sanitizedFinalUrl,
        depth: u.depth,
        status: u.status,
        httpStatus: u.httpStatus,
        statusText: u.statusText,
        title: u.title,
        metaDescription: u.metaDescription,
        responseTimeMs: u.responseTimeMs,
        contentType: u.contentType,
        contentLength: u.contentLength ? Number(u.contentLength) : null,
        scannedAt: u.scannedAt,
        failureCode: u.failureCode,
        failureMessage: u.failureMessage,
      })),
      findings: run.findings.map((f) => ({
        id: f.id,
        runId: f.runId,
        comparisonKey: f.comparisonKey,
        findingKey: f.findingKey,
        ruleId: f.ruleId,
        category: f.category,
        severity: f.severity,
        resultStatus: f.resultStatus,
        ruleName: f.ruleName,
        description: f.description,
        recommendation: f.recommendation,
        createdAt: f.createdAt,
        occurrencesCount: f.occurrences.length,
        occurrences: f.occurrences.map((occ) => ({
          id: occ.id,
          runId: occ.runId,
          findingId: occ.findingId,
          scannedUrlId: occ.scannedUrlId,
          resultStatus: occ.resultStatus,
          evidence: occ.evidence,
          observedAt: occ.observedAt,
        })),
        verifications: f.verifications.map((ver) => ({
          id: ver.id,
          runId: ver.runId,
          findingId: ver.findingId,
          status: ver.status,
          note: ver.note,
          actorUserId: ver.actorUserId,
          createdAt: ver.createdAt,
        })),
      })),
    };
  }

  public async getRunByIdempotencyKey(businessId: string, idempotencyKey: string): Promise<CrawlAuditRunDto | null> {
    const run = await this.client.crawlAuditRun.findUnique({
      where: {
        businessId_idempotencyKey: {
          businessId,
          idempotencyKey,
        },
      },
    });
    return run ? this.mapRunToDto(run) : null;
  }

  public async recordScannedUrlsBatch(runId: string, urls: RecordScannedUrlInput[]): Promise<ScannedUrlRecordDto[]> {
    return this.client.$transaction(async (tx) => {
      const recorded: ScannedUrlRecordDto[] = [];

      for (const item of urls) {
        const sanitizedUrl = sanitizeUrl(item.url);
        const fingerprint = item.urlFingerprint || computeUrlFingerprint(sanitizedUrl);

        const upserted = await tx.crawlScannedUrl.upsert({
          where: {
            runId_urlFingerprint: {
              runId,
              urlFingerprint: fingerprint,
            },
          },
          update: {
            status: item.status,
            httpStatus: item.httpStatus,
            statusText: item.statusText?.slice(0, 120),
            title: sanitizeTitle(item.title),
            metaDescription: sanitizeMetaDescription(item.metaDescription),
            responseTimeMs: item.responseTimeMs,
            contentType: item.contentType?.slice(0, 255),
            contentLength: item.contentLength != null ? BigInt(item.contentLength) : null,
            failureCode: item.failureCode?.slice(0, 80),
            failureMessage: sanitizeFailureMessage(item.failureMessage),
          },
          create: {
            runId,
            urlFingerprint: fingerprint,
            sanitizedUrl,
            sanitizedFinalUrl: item.finalUrl ? sanitizeUrl(item.finalUrl) : null,
            depth: item.depth,
            status: item.status,
            httpStatus: item.httpStatus,
            statusText: item.statusText?.slice(0, 120),
            title: sanitizeTitle(item.title),
            metaDescription: sanitizeMetaDescription(item.metaDescription),
            responseTimeMs: item.responseTimeMs,
            contentType: item.contentType?.slice(0, 255),
            contentLength: item.contentLength != null ? BigInt(item.contentLength) : null,
            scannedAt: item.scannedAt,
            failureCode: item.failureCode?.slice(0, 80),
            failureMessage: sanitizeFailureMessage(item.failureMessage),
          },
        });

        recorded.push({
          id: upserted.id,
          runId: upserted.runId,
          urlFingerprint: upserted.urlFingerprint,
          sanitizedUrl: upserted.sanitizedUrl,
          sanitizedFinalUrl: upserted.sanitizedFinalUrl,
          depth: upserted.depth,
          status: upserted.status,
          httpStatus: upserted.httpStatus,
          statusText: upserted.statusText,
          title: upserted.title,
          metaDescription: upserted.metaDescription,
          responseTimeMs: upserted.responseTimeMs,
          contentType: upserted.contentType,
          contentLength: upserted.contentLength ? Number(upserted.contentLength) : null,
          scannedAt: upserted.scannedAt,
          failureCode: upserted.failureCode,
          failureMessage: upserted.failureMessage,
        });
      }

      return recorded;
    });
  }

  public async recordFindingsBatch(runId: string, findings: RecordFindingInput[]): Promise<FindingRecordDto[]> {
    return this.client.$transaction(async (tx) => {
      const results: FindingRecordDto[] = [];

      for (const item of findings) {
        const comparisonKey = item.comparisonKey || computeComparisonKey(item.ruleId);
        const findingKey = item.findingKey || computeFindingKey(comparisonKey, item.resultStatus, item.severity);

        const upsertedFinding = await tx.crawlAuditFinding.upsert({
          where: {
            runId_findingKey: {
              runId,
              findingKey,
            },
          },
          update: {
            resultStatus: item.resultStatus,
            severity: item.severity,
          },
          create: {
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
          },
        });

        // Insert occurrences
        for (const occ of item.occurrences) {
          let scannedUrlId = occ.scannedUrlId;
          if (!scannedUrlId && occ.urlFingerprint) {
            const urlRecord = await tx.crawlScannedUrl.findUnique({
              where: {
                runId_urlFingerprint: {
                  runId,
                  urlFingerprint: occ.urlFingerprint,
                },
              },
              select: { id: true },
            });
            if (urlRecord) scannedUrlId = urlRecord.id;
          }

          if (scannedUrlId) {
            await tx.crawlFindingOccurrence.upsert({
              where: {
                runId_findingId_scannedUrlId: {
                  runId,
                  findingId: upsertedFinding.id,
                  scannedUrlId,
                },
              },
              update: {
                resultStatus: occ.resultStatus,
                evidence: sanitizeEvidence(occ.evidence),
              },
              create: {
                runId,
                findingId: upsertedFinding.id,
                scannedUrlId,
                resultStatus: occ.resultStatus,
                evidence: sanitizeEvidence(occ.evidence),
                observedAt: occ.observedAt || new Date(),
              },
            });
          }
        }

        results.push({
          id: upsertedFinding.id,
          runId: upsertedFinding.runId,
          comparisonKey: upsertedFinding.comparisonKey,
          findingKey: upsertedFinding.findingKey,
          ruleId: upsertedFinding.ruleId,
          category: upsertedFinding.category,
          severity: upsertedFinding.severity,
          resultStatus: upsertedFinding.resultStatus,
          ruleName: upsertedFinding.ruleName,
          description: upsertedFinding.description,
          recommendation: upsertedFinding.recommendation,
          createdAt: upsertedFinding.createdAt,
          occurrencesCount: item.occurrences.length,
        });
      }

      return results;
    });
  }

  public async updateCoverageCounters(runId: string, counters: Partial<CrawlCoverageCounters>): Promise<void> {
    await this.client.crawlAuditRun.update({
      where: { id: runId },
      data: {
        discoveredCount: counters.discoveredCount,
        eligibleCount: counters.eligibleCount,
        queuedCount: counters.queuedCount,
        attemptedCount: counters.attemptedCount,
        succeededCount: counters.succeededCount,
        failedCount: counters.failedCount,
        skippedRobotsCount: counters.skippedRobotsCount,
        skippedDepthCount: counters.skippedDepthCount,
        skippedCandidateLimitCount: counters.skippedCandidateLimitCount,
        skippedScopeCount: counters.skippedScopeCount,
        remainingCount: counters.remainingCount,
        limitReached: counters.limitReached,
        discoveryTruncated: counters.discoveryTruncated,
        downloadedBytes: counters.downloadedBytes != null ? BigInt(counters.downloadedBytes) : undefined,
      },
    });
  }

  public async finalizeRun(runId: string, input: FinalizeRunInput): Promise<CrawlAuditRunDto> {
    const updated = await this.client.crawlAuditRun.update({
      where: { id: runId },
      data: {
        status: input.status,
        finishedAt: input.finishedAt,
        discoveredCount: input.counters.discoveredCount,
        eligibleCount: input.counters.eligibleCount,
        queuedCount: input.counters.queuedCount,
        attemptedCount: input.counters.attemptedCount,
        succeededCount: input.counters.succeededCount,
        failedCount: input.counters.failedCount,
        skippedRobotsCount: input.counters.skippedRobotsCount,
        skippedDepthCount: input.counters.skippedDepthCount,
        skippedCandidateLimitCount: input.counters.skippedCandidateLimitCount,
        skippedScopeCount: input.counters.skippedScopeCount,
        remainingCount: input.counters.remainingCount,
        limitReached: input.counters.limitReached,
        discoveryTruncated: input.counters.discoveryTruncated,
        downloadedBytes: BigInt(input.counters.downloadedBytes),
        stopReasonCode: input.stopReasonCode?.slice(0, 80),
        warningsJson: serializeWarnings(input.warnings),
      },
    });

    return this.mapRunToDto(updated);
  }

  public async failRun(runId: string, input: FailRunInput): Promise<CrawlAuditRunDto> {
    const updated = await this.client.crawlAuditRun.update({
      where: { id: runId },
      data: {
        status: "FAILED",
        finishedAt: input.finishedAt,
        stopReasonCode: input.failureCode.slice(0, 80),
        warningsJson: serializeWarnings(input.warnings),
      },
    });

    return this.mapRunToDto(updated);
  }

  public async listRunsForBusiness(businessId: string, options: ListRunsOptions = {}): Promise<CrawlAuditRunDto[]> {
    const runs = await this.client.crawlAuditRun.findMany({
      where: {
        businessId,
        status: options.status,
      },
      orderBy: [{ startedAt: "desc" }, { createdAt: "desc" }],
      take: options.limit ?? 20,
      skip: options.offset ?? 0,
    });

    return runs.map((r) => this.mapRunToDto(r));
  }

  public async findStaleRunningRuns(staleBefore: Date): Promise<CrawlAuditRunDto[]> {
    const runs = await this.client.crawlAuditRun.findMany({
      where: {
        status: "RUNNING",
        startedAt: {
          lt: staleBefore,
        },
      },
    });

    return runs.map((r) => this.mapRunToDto(r));
  }

  public async recordVerification(
    runId: string,
    findingId: string,
    input: RecordVerificationInput
  ): Promise<VerificationRecordDto> {
    const created = await this.client.crawlFindingVerification.create({
      data: {
        runId,
        findingId,
        status: input.status,
        note: input.note?.slice(0, 2000),
        actorUserId: input.actorUserId,
      },
    });

    return {
      id: created.id,
      runId: created.runId,
      findingId: created.findingId,
      status: created.status,
      note: created.note,
      actorUserId: created.actorUserId,
      createdAt: created.createdAt,
    };
  }

  public async getVerificationsForFinding(runId: string, findingId: string): Promise<VerificationRecordDto[]> {
    const verifications = await this.client.crawlFindingVerification.findMany({
      where: {
        runId,
        findingId,
      },
      orderBy: { createdAt: "desc" },
    });

    return verifications.map((v) => ({
      id: v.id,
      runId: v.runId,
      findingId: v.findingId,
      status: v.status,
      note: v.note,
      actorUserId: v.actorUserId,
      createdAt: v.createdAt,
    }));
  }

  private mapRunToDto(r: {
    id: string;
    businessId: string;
    rootUrl: string;
    rootHost: string;
    requestedUrlLimit: number;
    depthLimit: number;
    concurrencyLimit: number;
    status: CrawlAuditRunStatus;
    startedAt: Date | null;
    finishedAt: Date | null;
    createdAt: Date;
    scannerVersion: string;
    rulesetVersion: string;
    urlFingerprintKeyVersion: string;
    comparisonKeyVersion: string;
    idempotencyKey: string | null;
    discoveredCount: number;
    eligibleCount: number;
    queuedCount: number;
    attemptedCount: number;
    succeededCount: number;
    failedCount: number;
    skippedRobotsCount: number;
    skippedDepthCount: number;
    skippedCandidateLimitCount: number;
    skippedScopeCount: number;
    remainingCount: number;
    limitReached: boolean;
    discoveryTruncated: boolean;
    downloadedBytes: bigint;
    stopReasonCode: string | null;
    warningsJson: string | null;
  }): CrawlAuditRunDto {
    return {
      id: r.id,
      businessId: r.businessId,
      rootUrl: r.rootUrl,
      rootHost: r.rootHost,
      requestedUrlLimit: r.requestedUrlLimit,
      depthLimit: r.depthLimit,
      concurrencyLimit: r.concurrencyLimit,
      status: r.status,
      startedAt: r.startedAt,
      finishedAt: r.finishedAt,
      createdAt: r.createdAt,
      scannerVersion: r.scannerVersion,
      rulesetVersion: r.rulesetVersion,
      urlFingerprintKeyVersion: r.urlFingerprintKeyVersion,
      comparisonKeyVersion: r.comparisonKeyVersion,
      idempotencyKey: r.idempotencyKey,
      counters: {
        discoveredCount: r.discoveredCount,
        eligibleCount: r.eligibleCount,
        queuedCount: r.queuedCount,
        attemptedCount: r.attemptedCount,
        succeededCount: r.succeededCount,
        failedCount: r.failedCount,
        skippedRobotsCount: r.skippedRobotsCount,
        skippedDepthCount: r.skippedDepthCount,
        skippedCandidateLimitCount: r.skippedCandidateLimitCount,
        skippedScopeCount: r.skippedScopeCount,
        remainingCount: r.remainingCount,
        limitReached: r.limitReached,
        discoveryTruncated: r.discoveryTruncated,
        downloadedBytes: Number(r.downloadedBytes),
      },
      stopReasonCode: r.stopReasonCode,
      warningsJson: r.warningsJson,
    };
  }
}

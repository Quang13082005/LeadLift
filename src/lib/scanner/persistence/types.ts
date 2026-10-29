import type {
  FindingSeverity,
  CrawlStatus,
  RuleId,
  FindingCategory,
} from "@/types/scanner";

export type {
  FindingSeverity,
  CrawlStatus,
  RuleId,
  FindingCategory,
};

export type CrawlAuditRunStatus =
  | "PENDING"
  | "RUNNING"
  | "COMPLETED"
  | "PARTIAL"
  | "FAILED"
  | "CANCELLED"
  | "BLOCKED";

export type CrawlUrlStatus = "SCANNED" | "FAILED";

export type CrawlFindingResultStatus = "PASS" | "FAIL" | "REVIEW_REQUIRED" | "UNKNOWN";

export type FindingVerificationStatus = "PENDING" | "CONFIRMED" | "REJECTED";

export interface CrawlCoverageCounters {
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
  downloadedBytes: number;
}

export interface CreateRunInput {
  businessId: string;
  rootUrl: string;
  rootHost?: string;
  requestedUrlLimit: number;
  depthLimit: number;
  concurrencyLimit: number;
  scannerVersion?: string;
  rulesetVersion?: string;
  urlFingerprintKeyVersion?: string;
  comparisonKeyVersion?: string;
  idempotencyKey?: string;
}

export interface CrawlAuditRunDto {
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
  counters: CrawlCoverageCounters;
  stopReasonCode: string | null;
  warningsJson: string | null;
}

export interface RecordScannedUrlInput {
  url: string;
  finalUrl?: string;
  urlFingerprint?: string;
  depth: number;
  status: CrawlUrlStatus;
  httpStatus?: number;
  statusText?: string;
  title?: string;
  metaDescription?: string;
  responseTimeMs?: number;
  contentType?: string;
  contentLength?: number;
  scannedAt: Date;
  failureCode?: string;
  failureMessage?: string;
}

export interface ScannedUrlRecordDto {
  id: string;
  runId: string;
  urlFingerprint: string;
  sanitizedUrl: string;
  sanitizedFinalUrl: string | null;
  depth: number;
  status: CrawlUrlStatus;
  httpStatus: number | null;
  statusText: string | null;
  title: string | null;
  metaDescription: string | null;
  responseTimeMs: number | null;
  contentType: string | null;
  contentLength: number | null;
  scannedAt: Date;
  failureCode: string | null;
  failureMessage: string | null;
}

export interface RecordFindingInput {
  ruleId: string;
  category: string;
  severity: FindingSeverity;
  resultStatus: CrawlFindingResultStatus;
  ruleName: string;
  description: string;
  recommendation: string;
  comparisonKey?: string;
  findingKey?: string;
  occurrences: Array<{
    scannedUrlId?: string;
    urlFingerprint?: string;
    resultStatus: CrawlFindingResultStatus;
    evidence: string;
    observedAt?: Date;
  }>;
}

export interface FindingRecordDto {
  id: string;
  runId: string;
  comparisonKey: string;
  findingKey: string;
  ruleId: string;
  category: string;
  severity: FindingSeverity;
  resultStatus: CrawlFindingResultStatus;
  ruleName: string;
  description: string;
  recommendation: string;
  createdAt: Date;
  occurrencesCount: number;
}

export interface FindingOccurrenceDto {
  id: string;
  runId: string;
  findingId: string;
  scannedUrlId: string;
  resultStatus: CrawlFindingResultStatus;
  evidence: string;
  observedAt: Date;
}

export interface VerificationRecordDto {
  id: string;
  runId: string;
  findingId: string;
  status: FindingVerificationStatus;
  note: string | null;
  actorUserId: string;
  createdAt: Date;
}

export interface RecordVerificationInput {
  status: FindingVerificationStatus;
  note?: string;
  actorUserId: string;
  createdAt?: Date;
}

export interface FinalizeRunInput {
  status: "COMPLETED" | "PARTIAL" | "CANCELLED" | "BLOCKED";
  finishedAt: Date;
  counters: CrawlCoverageCounters;
  stopReasonCode?: string;
  warnings?: string[];
}

export interface FailRunInput {
  finishedAt: Date;
  counters?: Partial<CrawlCoverageCounters>;
  failureCode: string;
  failureMessage?: string;
  warnings?: string[];
}

export interface CrawlAuditRunDetailDto extends CrawlAuditRunDto {
  urls: ScannedUrlRecordDto[];
  findings: Array<FindingRecordDto & {
    occurrences: FindingOccurrenceDto[];
    verifications: VerificationRecordDto[];
  }>;
}

export interface ListRunsOptions {
  limit?: number;
  offset?: number;
  status?: CrawlAuditRunStatus;
}

export interface ICrawlAuditRepository {
  createRun(input: CreateRunInput): Promise<CrawlAuditRunDto>;
  startRun(runId: string, startedAt?: Date): Promise<void>;
  getRun(runId: string): Promise<CrawlAuditRunDto | null>;
  getRunDetail(runId: string): Promise<CrawlAuditRunDetailDto | null>;
  getRunByIdempotencyKey(businessId: string, idempotencyKey: string): Promise<CrawlAuditRunDto | null>;
  recordScannedUrlsBatch(runId: string, urls: RecordScannedUrlInput[]): Promise<ScannedUrlRecordDto[]>;
  recordFindingsBatch(runId: string, findings: RecordFindingInput[]): Promise<FindingRecordDto[]>;
  updateCoverageCounters(runId: string, counters: Partial<CrawlCoverageCounters>): Promise<void>;
  finalizeRun(runId: string, input: FinalizeRunInput): Promise<CrawlAuditRunDto>;
  failRun(runId: string, input: FailRunInput): Promise<CrawlAuditRunDto>;
  listRunsForBusiness(businessId: string, options?: ListRunsOptions): Promise<CrawlAuditRunDto[]>;
  findStaleRunningRuns(staleBefore: Date): Promise<CrawlAuditRunDto[]>;
  recordVerification(runId: string, findingId: string, input: RecordVerificationInput): Promise<VerificationRecordDto>;
  getVerificationsForFinding(runId: string, findingId: string): Promise<VerificationRecordDto[]>;
}

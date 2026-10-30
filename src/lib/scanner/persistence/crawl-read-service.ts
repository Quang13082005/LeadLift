import type {
  ICrawlAuditRepository,
  CrawlAuditRunDto,
  CrawlAuditRunDetailDto,
  ListRunsOptions,
} from "./types";

export interface RunComparisonResult {
  comparable: boolean;
  incompatibilityReason?: string;
  baseRunId: string;
  targetRunId: string;
  summary: {
    persistingCount: number;
    newCount: number;
    resolvedCount: number;
    unresolvedNotRecheckedCount: number;
  };
  persistingFindings: Array<{
    comparisonKey: string;
    ruleId: string;
    urlFingerprint: string;
    sanitizedUrl: string;
    severity: string;
  }>;
  newFindings: Array<{
    comparisonKey: string;
    ruleId: string;
    urlFingerprint: string;
    sanitizedUrl: string;
    severity: string;
  }>;
  resolvedFindings: Array<{
    comparisonKey: string;
    ruleId: string;
    urlFingerprint: string;
    sanitizedUrl: string;
  }>;
  unresolvedNotRechecked: Array<{
    comparisonKey: string;
    ruleId: string;
    urlFingerprint: string;
    sanitizedUrl: string;
    reason: "TARGET_RUN_DID_NOT_SCAN_URL" | "TARGET_RUN_PARTIAL" | "URL_FAILED_IN_TARGET";
  }>;
}

export class CrawlReadService {
  constructor(private readonly repository: ICrawlAuditRepository) {}

  public async getRun(runId: string): Promise<CrawlAuditRunDto | null> {
    return this.repository.getRun(runId);
  }

  public async getRunDetails(runId: string): Promise<CrawlAuditRunDetailDto | null> {
    return this.repository.getRunDetail(runId);
  }

  public async listBusinessRuns(businessId: string, options?: ListRunsOptions): Promise<CrawlAuditRunDto[]> {
    return this.repository.listRunsForBusiness(businessId, options);
  }

  /**
   * Evaluates comparison between two crawl runs.
   * Enforces strict compatibility checks and conservative resolution semantics:
   * A finding can ONLY be marked resolved if the exact affected URL was successfully rescanned (HTTP 2xx)
   * and evaluated in the target run. If the target run was partial, cancelled, or did not reach that URL,
   * the issue is marked UNRESOLVED_NOT_RECHECKED, never falsely resolved.
   */
  public async compareRuns(baseRunId: string, targetRunId: string): Promise<RunComparisonResult> {
    const [baseRun, targetRun] = await Promise.all([
      this.repository.getRunDetail(baseRunId),
      this.repository.getRunDetail(targetRunId),
    ]);

    if (!baseRun || !targetRun) {
      return {
        comparable: false,
        incompatibilityReason: "One or both runs not found",
        baseRunId,
        targetRunId,
        summary: { persistingCount: 0, newCount: 0, resolvedCount: 0, unresolvedNotRecheckedCount: 0 },
        persistingFindings: [],
        newFindings: [],
        resolvedFindings: [],
        unresolvedNotRechecked: [],
      };
    }

    // Compatibility validation
    if (baseRun.rootHost !== targetRun.rootHost) {
      return {
        comparable: false,
        incompatibilityReason: `Host mismatch: '${baseRun.rootHost}' vs '${targetRun.rootHost}'`,
        baseRunId,
        targetRunId,
        summary: { persistingCount: 0, newCount: 0, resolvedCount: 0, unresolvedNotRecheckedCount: 0 },
        persistingFindings: [],
        newFindings: [],
        resolvedFindings: [],
        unresolvedNotRechecked: [],
      };
    }

    if (baseRun.rulesetVersion !== targetRun.rulesetVersion) {
      return {
        comparable: false,
        incompatibilityReason: `Ruleset version mismatch: '${baseRun.rulesetVersion}' vs '${targetRun.rulesetVersion}'`,
        baseRunId,
        targetRunId,
        summary: { persistingCount: 0, newCount: 0, resolvedCount: 0, unresolvedNotRecheckedCount: 0 },
        persistingFindings: [],
        newFindings: [],
        resolvedFindings: [],
        unresolvedNotRechecked: [],
      };
    }

    if (baseRun.scannerVersion !== targetRun.scannerVersion) {
      return {
        comparable: false,
        incompatibilityReason: `Scanner version mismatch: '${baseRun.scannerVersion}' vs '${targetRun.scannerVersion}'`,
        baseRunId,
        targetRunId,
        summary: { persistingCount: 0, newCount: 0, resolvedCount: 0, unresolvedNotRecheckedCount: 0 },
        persistingFindings: [],
        newFindings: [],
        resolvedFindings: [],
        unresolvedNotRechecked: [],
      };
    }

    if (baseRun.urlFingerprintKeyVersion !== targetRun.urlFingerprintKeyVersion) {
      return {
        comparable: false,
        incompatibilityReason: `URL fingerprint key version mismatch: '${baseRun.urlFingerprintKeyVersion}' vs '${targetRun.urlFingerprintKeyVersion}'`,
        baseRunId,
        targetRunId,
        summary: { persistingCount: 0, newCount: 0, resolvedCount: 0, unresolvedNotRecheckedCount: 0 },
        persistingFindings: [],
        newFindings: [],
        resolvedFindings: [],
        unresolvedNotRechecked: [],
      };
    }

    if (baseRun.comparisonKeyVersion !== targetRun.comparisonKeyVersion) {
      return {
        comparable: false,
        incompatibilityReason: `Comparison key version mismatch: '${baseRun.comparisonKeyVersion}' vs '${targetRun.comparisonKeyVersion}'`,
        baseRunId,
        targetRunId,
        summary: { persistingCount: 0, newCount: 0, resolvedCount: 0, unresolvedNotRecheckedCount: 0 },
        persistingFindings: [],
        newFindings: [],
        resolvedFindings: [],
        unresolvedNotRechecked: [],
      };
    }

    if (targetRun.status === "FAILED" || targetRun.status === "BLOCKED" || targetRun.urls.length === 0) {
      return {
        comparable: false,
        incompatibilityReason: `Target run is ${targetRun.status} with ${targetRun.urls.length} scanned URLs; cannot perform valid comparison`,
        baseRunId,
        targetRunId,
        summary: { persistingCount: 0, newCount: 0, resolvedCount: 0, unresolvedNotRecheckedCount: 0 },
        persistingFindings: [],
        newFindings: [],
        resolvedFindings: [],
        unresolvedNotRechecked: [],
      };
    }

    // Build URL lookup maps for target run
    const targetUrlByFingerprint = new Map<string, (typeof targetRun.urls)[0]>();
    for (const u of targetRun.urls) {
      targetUrlByFingerprint.set(u.urlFingerprint, u);
    }

    // Build base run failed occurrences map: `${comparisonKey}:${urlFingerprint}` -> occurrence
    interface BaseFailedOcc {
      comparisonKey: string;
      ruleId: string;
      urlFingerprint: string;
      sanitizedUrl: string;
      severity: string;
    }
    const baseFailedMap = new Map<string, BaseFailedOcc>();
    const baseScannedUrlMap = new Map<string, string>(); // scannedUrlId -> urlFingerprint
    const baseSanitizedUrlMap = new Map<string, string>(); // urlFingerprint -> sanitizedUrl

    for (const u of baseRun.urls) {
      baseScannedUrlMap.set(u.id, u.urlFingerprint);
      baseSanitizedUrlMap.set(u.urlFingerprint, u.sanitizedUrl);
    }

    for (const f of baseRun.findings) {
      if (f.resultStatus === "FAIL" || f.resultStatus === "REVIEW_REQUIRED") {
        for (const occ of f.occurrences) {
          const fp = baseScannedUrlMap.get(occ.scannedUrlId);
          if (fp) {
            const key = `${f.comparisonKey}:${fp}`;
            baseFailedMap.set(key, {
              comparisonKey: f.comparisonKey,
              ruleId: f.ruleId,
              urlFingerprint: fp,
              sanitizedUrl: baseSanitizedUrlMap.get(fp) || "unknown",
              severity: f.severity,
            });
          }
        }
      }
    }

    // Build target run failed occurrences map
    const targetFailedMap = new Map<string, { comparisonKey: string; ruleId: string; urlFingerprint: string; sanitizedUrl: string; severity: string }>();
    const targetScannedUrlMap = new Map<string, string>();
    const targetSanitizedUrlMap = new Map<string, string>();

    for (const u of targetRun.urls) {
      targetScannedUrlMap.set(u.id, u.urlFingerprint);
      targetSanitizedUrlMap.set(u.urlFingerprint, u.sanitizedUrl);
    }

    for (const f of targetRun.findings) {
      if (f.resultStatus === "FAIL" || f.resultStatus === "REVIEW_REQUIRED") {
        for (const occ of f.occurrences) {
          const fp = targetScannedUrlMap.get(occ.scannedUrlId);
          if (fp) {
            const key = `${f.comparisonKey}:${fp}`;
            targetFailedMap.set(key, {
              comparisonKey: f.comparisonKey,
              ruleId: f.ruleId,
              urlFingerprint: fp,
              sanitizedUrl: targetSanitizedUrlMap.get(fp) || "unknown",
              severity: f.severity,
            });
          }
        }
      }
    }

    const persistingFindings: RunComparisonResult["persistingFindings"] = [];
    const resolvedFindings: RunComparisonResult["resolvedFindings"] = [];
    const unresolvedNotRechecked: RunComparisonResult["unresolvedNotRechecked"] = [];
    const newFindings: RunComparisonResult["newFindings"] = [];

    // Analyze base failed issues against target run
    for (const [key, baseIssue] of baseFailedMap.entries()) {
      if (targetFailedMap.has(key)) {
        persistingFindings.push({ ...baseIssue });
      } else {
        // Did target run successfully scan this URL?
        const targetUrl = targetUrlByFingerprint.get(baseIssue.urlFingerprint);
        if (!targetUrl) {
          // Target run did not scan this URL at all (different discovery order, hit limit, etc.)
          unresolvedNotRechecked.push({
            comparisonKey: baseIssue.comparisonKey,
            ruleId: baseIssue.ruleId,
            urlFingerprint: baseIssue.urlFingerprint,
            sanitizedUrl: baseIssue.sanitizedUrl,
            reason: "TARGET_RUN_DID_NOT_SCAN_URL",
          });
        } else if (targetUrl.status === "FAILED" || (targetUrl.httpStatus && targetUrl.httpStatus >= 400)) {
          // Target URL attempt failed; rule could not be evaluated
          unresolvedNotRechecked.push({
            comparisonKey: baseIssue.comparisonKey,
            ruleId: baseIssue.ruleId,
            urlFingerprint: baseIssue.urlFingerprint,
            sanitizedUrl: baseIssue.sanitizedUrl,
            reason: "URL_FAILED_IN_TARGET",
          });
        } else {
          // URL was successfully rescanned (HTTP 2xx) and issue did not appear -> genuinely RESOLVED!
          resolvedFindings.push({
            comparisonKey: baseIssue.comparisonKey,
            ruleId: baseIssue.ruleId,
            urlFingerprint: baseIssue.urlFingerprint,
            sanitizedUrl: baseIssue.sanitizedUrl,
          });
        }
      }
    }

    // Find new issues in target run
    for (const [key, targetIssue] of targetFailedMap.entries()) {
      if (!baseFailedMap.has(key)) {
        newFindings.push({ ...targetIssue });
      }
    }

    return {
      comparable: true,
      baseRunId,
      targetRunId,
      summary: {
        persistingCount: persistingFindings.length,
        newCount: newFindings.length,
        resolvedCount: resolvedFindings.length,
        unresolvedNotRecheckedCount: unresolvedNotRechecked.length,
      },
      persistingFindings,
      newFindings,
      resolvedFindings,
      unresolvedNotRechecked,
    };
  }
}

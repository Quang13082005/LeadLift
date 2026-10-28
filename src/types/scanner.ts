export type RuleId =
  | "HTTP_STATUS"
  | "SECURITY_HTTPS"
  | "SEO_TITLE_EXISTS"
  | "SEO_TITLE_LENGTH"
  | "SEO_META_DESCRIPTION"
  | "SEO_META_DESCRIPTION_LENGTH"
  | "SEO_TITLE_DUPLICATE"
  | "SEO_META_DESCRIPTION_DUPLICATE"
  | "SEO_CANONICAL"
  | "SEO_CANONICAL_MISMATCH"
  | "SEO_ROBOTS_NOINDEX"
  | "SEO_H1_COUNT"
  | "SEO_HEADING_HIERARCHY"
  | "SEO_THIN_CONTENT"
  | "SEO_BROKEN_INTERNAL_LINK"
  | "MOBILE_VIEWPORT"
  | "SOCIAL_OG_TAGS"
  | "TECHNICAL_HEALTH";

export type FindingSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";

export type ScanStatus = "PASS" | "FAIL" | "UNKNOWN";
export type AuditFindingStatus = ScanStatus | "REVIEW_REQUIRED";

export type FindingCategory = "SEO" | "MOBILE" | "SECURITY" | "SOCIAL" | "TECHNICAL" | "PERFORMANCE";

export interface ScanFinding {
  ruleId: RuleId;
  ruleName: string;
  category: FindingCategory;
  description: string;
  severity: FindingSeverity;
  status: AuditFindingStatus;
  evidence: string;
  sourceUrl: string;
  timestamp: string;
  recommendation?: string;
}

export interface ParsedHtmlData {
  title?: string;
  metaDescription?: string;
  canonical?: string;
  canonicalTagPresent: boolean;
  robotsMeta?: string;
  xRobotsTag?: string;
  viewport?: string;
  h1List: string[];
  headingLevels: number[];
  bodyWordCount: number;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  ogUrl?: string;
}

export interface ScanSummary {
  totalRules: number;
  passCount: number;
  failCount: number;
  unknownCount: number;
  reviewRequiredCount: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  infoCount: number;
}

export interface RedirectHop {
  from: string;
  to: string;
  status: number;
}

export interface ScanResult {
  id: string;
  targetUrl: string;
  finalUrl: string;
  httpStatus: number;
  statusText: string;
  responseTimeMs: number;
  redirectCount: number;
  redirectChain: RedirectHop[];
  scannedAt: string;
  contentType: string;
  contentLength: number;
  findings: ScanFinding[];
  summary: ScanSummary;
  pageData: ParsedHtmlData;
  headers: Record<string, string>;
}

export interface ScanRequestInput {
  url: string;
}

export type CrawlStatus = "COMPLETED" | "PARTIAL" | "FAILED" | "CANCELLED" | "BLOCKED";
export type CrawlPhase = "ROBOTS" | "SITEMAP" | "CRAWL" | "AGGREGATE";

export interface CrawlProgress {
  phase: CrawlPhase;
  discovered: number;
  attempted: number;
  completed: number;
  failed: number;
  limit: number;
  currentUrl?: string;
}

export interface CrawlUrlResult {
  url: string;
  finalUrl?: string;
  depth: number;
  discoveredFrom: string[];
  status: "SCANNED" | "FAILED";
  httpStatus?: number;
  statusText?: string;
  title?: string;
  metaDescription?: string;
  responseTimeMs?: number;
  contentType?: string;
  contentLength?: number;
  scannedAt: string;
  findings: ScanFinding[];
  internalLinks: string[];
  failureCode?: string;
  failureMessage?: string;
}

export interface CrawlFinding {
  id: string;
  ruleId: RuleId;
  ruleName: string;
  category: FindingCategory;
  description: string;
  severity: FindingSeverity;
  status: AuditFindingStatus;
  evidence: string;
  affectedUrls: Array<{ url: string; evidence: string }>;
  timestamp: string;
  recommendation?: string;
}

export interface CrawlResult {
  id: string;
  targetUrl: string;
  rootHost: string;
  status: CrawlStatus;
  startedAt: string;
  completedAt: string;
  requestedUrlLimit: number;
  scannedUrlCount: number;
  successfulUrlCount: number;
  failedUrlCount: number;
  urlResults: CrawlUrlResult[];
  findings: CrawlFinding[];
  progress: CrawlProgress;
  warnings: string[];
  stopReason?: string;
}

export type CrawlStreamEvent =
  | { type: "progress"; progress: CrawlProgress }
  | { type: "url"; url: CrawlUrlResult }
  | { type: "complete"; result: CrawlResult }
  | { type: "error"; error: { code: string; message: string } };

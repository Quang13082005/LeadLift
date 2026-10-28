export type RuleId =
  | "HTTP_STATUS"
  | "SECURITY_HTTPS"
  | "SEO_TITLE_EXISTS"
  | "SEO_TITLE_LENGTH"
  | "SEO_META_DESCRIPTION"
  | "SEO_CANONICAL"
  | "SEO_ROBOTS_NOINDEX"
  | "SEO_H1_COUNT"
  | "MOBILE_VIEWPORT"
  | "SOCIAL_OG_TAGS"
  | "TECHNICAL_HEALTH";

export type FindingSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";

export type ScanStatus = "PASS" | "FAIL" | "UNKNOWN";

export type FindingCategory = "SEO" | "MOBILE" | "SECURITY" | "SOCIAL" | "TECHNICAL" | "PERFORMANCE";

export interface ScanFinding {
  ruleId: RuleId;
  ruleName: string;
  category: FindingCategory;
  description: string;
  severity: FindingSeverity;
  status: ScanStatus;
  evidence: string;
  sourceUrl: string;
  timestamp: string;
  recommendation?: string;
}

export interface ParsedHtmlData {
  title?: string;
  metaDescription?: string;
  canonical?: string;
  robotsMeta?: string;
  xRobotsTag?: string;
  viewport?: string;
  h1List: string[];
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

import { createHmac } from "crypto";
import type { FindingSeverity, CrawlFindingResultStatus } from "./types";

const DEFAULT_HMAC_SECRET = process.env.LEADLIFT_CRAWL_HMAC_SECRET || "leadlift_crawl_hmac_secret_v1_internal";

const SENSITIVE_PARAM_PREFIXES = ["utm_", "ga_", "fbclid", "gclid", "msclkid", "dclid", "mc_eid"];
const SENSITIVE_PARAM_NAMES = new Set([
  "token",
  "auth",
  "secret",
  "password",
  "pass",
  "api_key",
  "apikey",
  "access_token",
  "id_token",
  "refresh_token",
  "session",
  "sessionid",
  "phpsessid",
  "jsessionid",
]);

/**
 * Strips userinfo (username/password), fragments, and sensitive tracking/auth query parameters
 * from a URL before persistence.
 */
export function sanitizeUrl(rawUrl: string): string {
  if (!rawUrl || typeof rawUrl !== "string") {
    return "";
  }

  try {
    const parsed = new URL(rawUrl.trim());
    // Strip credentials
    parsed.username = "";
    parsed.password = "";
    // Strip fragment
    parsed.hash = "";

    // Redact or drop sensitive query params
    const searchParams = parsed.searchParams;
    const keysToDelete: string[] = [];

    searchParams.forEach((_, key) => {
      const lowerKey = key.toLowerCase();
      if (
        SENSITIVE_PARAM_NAMES.has(lowerKey) ||
        SENSITIVE_PARAM_PREFIXES.some((prefix) => lowerKey.startsWith(prefix))
      ) {
        keysToDelete.push(key);
      }
    });

    for (const key of keysToDelete) {
      searchParams.delete(key);
    }

    // Limit length to 2048
    const cleaned = parsed.toString();
    return cleaned.slice(0, 2048);
  } catch {
    // If not a valid absolute URL, sanitize as relative/plain string
    const withoutHash = rawUrl.split("#")[0] ?? "";
    const withoutAuth = withoutHash.replace(/^[a-zA-Z]+:\/\/[^/@]+@/, (m) => m.replace(/\/\/[^/@]+@/, "//"));
    return withoutAuth.slice(0, 2048);
  }
}

/**
 * Computes a deterministic 64-character lowercase hex HMAC-SHA256 fingerprint for a canonical URL.
 */
export function computeUrlFingerprint(url: string, secret: string = DEFAULT_HMAC_SECRET): string {
  const sanitized = sanitizeUrl(url).toLowerCase();
  return createHmac("sha256", secret).update(sanitized).digest("hex");
}

/**
 * Sanitizes and bounds a page title (max 500 chars, strips control characters).
 */
export function sanitizeTitle(title?: string | null): string | null {
  if (!title) return null;
  // Strip control chars and redundant whitespace
  const cleaned = title.replace(/[\x00-\x1F\x7F]/g, "").trim().replace(/\s+/g, " ");
  return cleaned.slice(0, 500) || null;
}

/**
 * Sanitizes and bounds a meta description (max 2000 chars, strips control characters).
 */
export function sanitizeMetaDescription(meta?: string | null): string | null {
  if (!meta) return null;
  const cleaned = meta.replace(/[\x00-\x1F\x7F]/g, "").trim().replace(/\s+/g, " ");
  return cleaned.slice(0, 2000) || null;
}

/**
 * Strictly scrubs and bounds evidence text before persistence:
 * - Max 8000 characters
 * - Strips script tags, style blocks, authorization headers, cookies, and bearer tokens
 */
export function sanitizeEvidence(evidence: string): string {
  if (!evidence || typeof evidence !== "string") {
    return "";
  }

  let scrubbed = evidence
    // Strip <script> and <style> tags and their contents
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "[REDACTED_SCRIPT]")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "[REDACTED_STYLE]")
    // Strip Authorization / Bearer tokens
    .replace(/bearer\s+[a-zA-Z0-9._~+/-]+=*/gi, "Bearer [REDACTED_TOKEN]")
    .replace(/authorization:\s*[^\r\n]+/gi, "Authorization: [REDACTED]")
    // Strip Cookies
    .replace(/cookie:\s*[^\r\n]+/gi, "Cookie: [REDACTED]")
    // Strip basic passwords in key-value format
    .replace(/(password|passwd|secret|token)\s*[:=]\s*["']?[^"',\s}]+/gi, "$1: [REDACTED]");

  if (scrubbed.length > 8000) {
    scrubbed = scrubbed.slice(0, 7960) + " ... [TRUNCATED_EVIDENCE_AT_8000_BYTES]";
  }

  return scrubbed;
}

/**
 * Bounds failure messages to 1000 characters without leaking stack traces or internal secrets.
 */
export function sanitizeFailureMessage(message?: string | null): string | null {
  if (!message) return null;
  // Remove absolute file system paths that might leak server architecture
  const cleaned = message
    .replace(/[A-Za-z]:\\[^:\s]+/g, "[PATH]")
    .replace(/\/home\/[^:\s]+/g, "[PATH]")
    .replace(/[\x00-\x1F\x7F]/g, "")
    .trim();
  return cleaned.slice(0, 1000) || null;
}

/**
 * Computes a stable, status-independent comparison key for a finding.
 * Format: `<ruleId>:<deterministicIdentity>` (e.g. `SEO_TITLE_EXISTS:root`, `SEO_META_DESCRIPTION_DUPLICATE:hash`)
 * Max length 160.
 */
export function computeComparisonKey(ruleId: string, ruleSpecificIdentity?: string): string {
  const identity = (ruleSpecificIdentity || "general").trim().toLowerCase().slice(0, 80);
  const rawKey = `${ruleId}:${identity}`;
  return rawKey.slice(0, 160);
}

/**
 * Computes a deterministic finding key within a run, unique per (rule, category, result status).
 * Max length 200.
 */
export function computeFindingKey(
  comparisonKey: string,
  resultStatus: CrawlFindingResultStatus,
  severity: FindingSeverity
): string {
  const rawKey = `${comparisonKey}:${resultStatus}:${severity}`;
  return rawKey.slice(0, 200);
}

/**
 * Sanitizes and bounds warnings payload into a JSON string of max 4000 characters.
 */
export function serializeWarnings(warnings?: string[]): string | null {
  if (!warnings || warnings.length === 0) return null;
  const safeWarnings = warnings.map((w) => String(w).slice(0, 500));
  const json = JSON.stringify(safeWarnings);
  return json.slice(0, 4000);
}

/**
 * Deserializes warnings JSON string.
 */
export function deserializeWarnings(json?: string | null): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [json.slice(0, 500)];
  }
}

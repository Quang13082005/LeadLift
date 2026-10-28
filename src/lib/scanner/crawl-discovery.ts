import { validateTargetUrl } from "./ssrf-validator";

export interface RobotsPolicy {
  allow: string[];
  disallow: string[];
  sitemapUrls: string[];
}

export interface DiscoveredUrl {
  url: string;
  sourceUrl: string;
}

const EXCLUDED_PATH = /^\/(?:wp-admin(?:\/|$)|wp-login\.php$|logout(?:\/|$)|log-out(?:\/|$))/i;

function decodeHtmlAttribute(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)));
}

/** Normalize a discovered link and reject anything outside the pinned host. */
export function normalizeCrawlUrl(rawUrl: string, baseUrl: string, rootHost: string): string | null {
  if (!rawUrl || rawUrl.length > 2048) return null;

  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim(), baseUrl);
  } catch {
    return null;
  }

  parsed.hash = "";
  if (EXCLUDED_PATH.test(parsed.pathname)) return null;

  const validation = validateTargetUrl(parsed.href, { allowedHost: rootHost });
  return validation.valid ? validation.normalizedUrl || null : null;
}

/** Extract bounded, same-host anchor links without executing page scripts. */
export function extractInternalLinks(
  html: string,
  sourceUrl: string,
  rootHost: string,
  maxLinks = 200
): DiscoveredUrl[] {
  const links = new Map<string, DiscoveredUrl>();
  const anchorPattern = /<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>/gi;
  let match: RegExpExecArray | null;

  while (links.size < maxLinks && (match = anchorPattern.exec(html)) !== null) {
    const rawHref = decodeHtmlAttribute(match[1] ?? match[2] ?? match[3] ?? "");
    const url = normalizeCrawlUrl(rawHref, sourceUrl, rootHost);
    if (url && url !== sourceUrl && !links.has(url)) links.set(url, { url, sourceUrl });
  }

  return [...links.values()];
}

function parseRobotsGroups(text: string): Array<{ agents: string[]; allow: string[]; disallow: string[] }> {
  const groups: Array<{ agents: string[]; allow: string[]; disallow: string[] }> = [];
  let current: { agents: string[]; allow: string[]; disallow: string[] } | null = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const directive = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (directive === "user-agent") {
      if (!current || current.allow.length || current.disallow.length) {
        current = { agents: [], allow: [], disallow: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      continue;
    }

    if (!current) continue;
    if (directive === "allow" && value) current.allow.push(value);
    if (directive === "disallow" && value) current.disallow.push(value);
  }

  return groups;
}

/** Parse the wildcard and prefix subset of robots.txt for LeadLift-Scanner. */
export function parseRobotsTxt(text: string, productToken = "leadlift-scanner"): RobotsPolicy {
  const groups = parseRobotsGroups(text);
  const exactGroups = groups.filter((group) => group.agents.some((agent) => agent === productToken.toLowerCase()));
  const selectedGroups = exactGroups.length ? exactGroups : groups.filter((group) => group.agents.includes("*"));
  const sitemapUrls = [...text.matchAll(/^\s*Sitemap\s*:\s*(\S+)/gim)].map((match) => match[1]);

  return {
    allow: selectedGroups.flatMap((group) => group.allow),
    disallow: selectedGroups.flatMap((group) => group.disallow),
    sitemapUrls,
  };
}

function patternMatches(pattern: string, path: string): boolean {
  const anchorEnd = pattern.endsWith("$");
  const source = anchorEnd ? pattern.slice(0, -1) : pattern;
  const escaped = source.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  try {
    return new RegExp(`^${escaped}${anchorEnd ? "$" : ""}`).test(path);
  } catch {
    return false;
  }
}

/** Allow the most-specific matching robots rule; Allow wins equal-length ties. */
export function isAllowedByRobots(url: string, policy: RobotsPolicy): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const path = `${parsed.pathname}${parsed.search}`;
  const matches = [
    ...policy.allow.filter((rule) => patternMatches(rule, path)).map((rule) => ({ rule, allow: true })),
    ...policy.disallow.filter((rule) => patternMatches(rule, path)).map((rule) => ({ rule, allow: false })),
  ].sort((a, b) => b.rule.replace(/[\*$]/g, "").length - a.rule.replace(/[\*$]/g, "").length || Number(b.allow) - Number(a.allow));

  return matches[0]?.allow ?? true;
}

function decodeXmlText(value: string): string {
  return value
    .replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .trim();
}

/** Extract loc values without an XML entity resolver or external entity support. */
export function parseSitemapLocs(xml: string, limit = 200): string[] {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) return [];
  const locs: string[] = [];
  const pattern = /<loc\b[^>]*>([\s\S]*?)<\/loc\s*>/gi;
  let match: RegExpExecArray | null;
  while (locs.length < limit && (match = pattern.exec(xml)) !== null) {
    const value = decodeXmlText(match[1]);
    if (value) locs.push(value);
  }
  return locs;
}

export function isSitemapIndex(xml: string): boolean {
  return /<sitemapindex\b/i.test(xml);
}

export function isHtmlContentType(contentType: string): boolean {
  const normalized = contentType.split(";")[0].trim().toLowerCase();
  return normalized === "text/html" || normalized === "application/xhtml+xml" || normalized === "text/plain";
}

import assert from "node:assert/strict";
import { aggregateCrawlFindings, CRAWL_LIMITS, CrawlerServiceError, runMultiUrlScan, type CrawlFetcher } from "../src/lib/scanner/crawler";
import {
  extractInternalLinks,
  isAllowedByRobots,
  normalizeCrawlUrl,
  parseRobotsTxt,
  parseSitemapLocs,
} from "../src/lib/scanner/crawl-discovery";
import { safeFetchWebsite, ScannerFetchError, type SafeFetchResult } from "../src/lib/scanner/safe-fetcher";
import { validateTargetUrl } from "../src/lib/scanner/ssrf-validator";

const ROOT = "https://example.com/";
const longDescription = "Một mô tả trang đủ dài để kiểm tra nội dung website trong bộ kiểm thử mà không tạo kết luận ngoài bằng chứng.";

function page(url: string, options: { status?: number; body?: string; contentType?: string; headers?: Record<string, string> } = {}): SafeFetchResult {
  const status = options.status ?? 200;
  return {
    finalUrl: url,
    httpStatus: status,
    statusText: status === 200 ? "OK" : status === 404 ? "Not Found" : status === 429 ? "Too Many Requests" : "Unavailable",
    headers: options.headers ?? { "content-type": options.contentType ?? "text/html; charset=utf-8" },
    htmlBody: options.body ?? `<html><head><title>Trang kiểm tra có tiêu đề hợp lệ</title><meta name="description" content="${longDescription}"><link rel="canonical" href="${url}"></head><body><h1>Nội dung trang</h1></body></html>`,
    responseTimeMs: 5,
    redirectCount: 0,
    redirectChain: [],
    contentLength: Buffer.byteLength(options.body ?? "", "utf8"),
    contentType: options.contentType ?? "text/html; charset=utf-8",
  };
}

function mockFetcher(handler: (url: string, options: Parameters<CrawlFetcher>[1]) => Promise<SafeFetchResult> | SafeFetchResult): CrawlFetcher {
  return async (url, options) => handler(url, options);
}

async function runTests() {
  const env = process.env as { NODE_ENV?: string };
  const originalNodeEnv = env.NODE_ENV;
  env.NODE_ENV = "development";
  let passed = 0;
  let failed = 0;

  async function test(name: string, run: () => void | Promise<void>) {
    try {
      await run();
      passed++;
      console.log(`PASS ${name}`);
    } catch (error) {
      failed++;
      console.error(`FAIL ${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  await test("crawler scope is hard-capped at 20 pages, depth 3, concurrency 2", () => {
    assert.equal(CRAWL_LIMITS.maxUrls, 20);
    assert.equal(CRAWL_LIMITS.maxDepth, 3);
    assert.equal(CRAWL_LIMITS.maxConcurrency, 2);
  });

  await test("URL normalizer resolves relative links, strips fragments, and pins exact host", () => {
    assert.equal(normalizeCrawlUrl("../menu#top", "https://example.com/services/", "example.com"), "https://example.com/menu");
    assert.equal(normalizeCrawlUrl("https://sub.example.com/menu", ROOT, "example.com"), null);
    assert.equal(normalizeCrawlUrl("https://other.test/menu", ROOT, "example.com"), null);
    assert.equal(normalizeCrawlUrl("javascript:alert(1)", ROOT, "example.com"), null);
    assert.equal(normalizeCrawlUrl("/wp-admin/edit.php", ROOT, "example.com"), null);
    assert.equal(normalizeCrawlUrl("/logout", ROOT, "example.com"), null);
  });

  await test("anchor discovery decodes entities, deduplicates, and excludes off-host links", () => {
    const links = extractInternalLinks(`<a href="/menu?a=1&amp;b=2#top">Menu</a><a href='/menu?a=1&amp;b=2'>again</a><a href="https://outside.test/">outside</a><a href="mailto:x@example.com">mail</a>`, ROOT, "example.com");
    assert.deepEqual(links.map((item) => item.url), ["https://example.com/menu?a=1&b=2"]);
    assert.equal(links[0].sourceUrl, ROOT);
  });

  await test("robots parser selects crawler-specific rules and gives Allow precedence on equal path", () => {
    const wildcardPolicy = parseRobotsTxt("User-agent: *\nDisallow: /private\nAllow: /private/public\nSitemap: https://example.com/sitemap.xml");
    assert.equal(isAllowedByRobots("https://example.com/private", wildcardPolicy), false);
    assert.equal(isAllowedByRobots("https://example.com/private/public", wildcardPolicy), true);
    const specificPolicy = parseRobotsTxt("User-agent: *\nDisallow: /public\nUser-agent: LeadLift-Scanner\nDisallow: /staff\nAllow: /staff/open");
    assert.equal(isAllowedByRobots("https://example.com/staff", specificPolicy), false);
    assert.equal(isAllowedByRobots("https://example.com/staff/open", specificPolicy), true);
    assert.equal(isAllowedByRobots("https://example.com/public", specificPolicy), true);
    assert.deepEqual(wildcardPolicy.sitemapUrls, ["https://example.com/sitemap.xml"]);
  });

  await test("sitemap loc parser decodes entities and refuses DTD/entity declarations", () => {
    assert.deepEqual(parseSitemapLocs(`<urlset><url><loc>https://example.com/a?x=1&amp;y=2</loc></url></urlset>`), ["https://example.com/a?x=1&y=2"]);
    assert.deepEqual(parseSitemapLocs(`<!DOCTYPE urlset [<!ENTITY x SYSTEM "file:///x">]><urlset><loc>&x;</loc></urlset>`), []);
    assert.equal(parseSitemapLocs(`<urlset>${Array.from({ length: 5 }, (_, i) => `<loc>https://example.com/${i}</loc>`).join("")}</urlset>`, 2).length, 2);
  });

  await test("safe-fetcher rejects initial or redirected host scope before network access", async () => {
    const initial = validateTargetUrl("https://outside.test/", { allowedHost: "example.com" });
    const redirect = validateTargetUrl("https://outside.test/private", { allowedHost: "example.com" });
    assert.equal(initial.valid, false);
    assert.equal(initial.code, "CRAWL_HOST_DISALLOWED");
    assert.equal(redirect.valid, false);
    await assert.rejects(safeFetchWebsite("https://outside.test/", { allowedHost: "example.com" }), (error: unknown) => error instanceof ScannerFetchError && error.code === "CRAWL_HOST_DISALLOWED");
  });

  await test("crawl follows internal links, honors robots, deduplicates, and stops at depth 3", async () => {
    const calls: string[] = [];
    const fetchPage = mockFetcher((url) => {
      calls.push(url);
      if (url.endsWith("/robots.txt")) return page(url, { contentType: "text/plain", body: "User-agent: *\nDisallow: /private" });
      if (url.endsWith("/sitemap.xml")) return page(url, { status: 404, contentType: "text/plain", body: "" });
      if (url === ROOT) return page(url, { body: `<html><head><title>Trang kiểm tra có tiêu đề hợp lệ</title></head><body><h1>Gốc</h1><a href="/one">1</a><a href="/one#again">trùng</a><a href="/private">cấm</a><a href="https://outside.test/">ngoài</a></body></html>` });
      if (url.endsWith("/one")) return page(url, { body: `<a href="/two">2</a>` });
      if (url.endsWith("/two")) return page(url, { body: `<a href="/three">3</a>` });
      if (url.endsWith("/three")) return page(url, { body: `<a href="/depth-four">4</a>` });
      throw new Error(`Unexpected fetch ${url}`);
    });
    const result = await runMultiUrlScan(ROOT, { maxUrls: 20, requestDelayMs: 0, fetchPage });
    const pages = result.urlResults.map((item) => item.url);
    assert.deepEqual(pages, [ROOT, "https://example.com/one", "https://example.com/two", "https://example.com/three"]);
    assert.equal(result.urlResults.at(-1)?.depth, 3);
    assert.equal(calls.some((url) => url.includes("/private") || url.includes("outside.test") || url.includes("depth-four")), false);
    assert.ok(result.urlResults.every((item) => item.depth <= 3));
  });

  await test("sitemap index is bounded and ignores external sitemap locations", async () => {
    const calls: string[] = [];
    const fetchPage = mockFetcher((url) => {
      calls.push(url);
      if (url.endsWith("/robots.txt")) return page(url, { contentType: "text/plain", body: "Sitemap: https://example.com/index.xml" });
      if (url.endsWith("/index.xml")) return page(url, { contentType: "application/xml", body: `<sitemapindex><sitemap><loc>https://example.com/pages.xml</loc></sitemap><sitemap><loc>https://outside.test/steal.xml</loc></sitemap></sitemapindex>` });
      if (url.endsWith("/sitemap.xml")) return page(url, { status: 404, contentType: "text/plain", body: "" });
      if (url.endsWith("/pages.xml")) return page(url, { contentType: "application/xml", body: `<urlset><url><loc>https://example.com/from-sitemap</loc></url></urlset>` });
      return page(url);
    });
    const result = await runMultiUrlScan(ROOT, { maxUrls: 3, requestDelayMs: 0, fetchPage });
    assert.ok(result.urlResults.some((item) => item.url === "https://example.com/from-sitemap"));
    assert.equal(calls.some((url) => url.includes("outside.test")), false);
    assert.ok(calls.filter((url) => url.endsWith(".xml")).length <= CRAWL_LIMITS.maxSitemapDocuments + 1);
  });

  await test("cross-URL findings link duplicate metadata to every page and broken links to their source", async () => {
    const missingUrl = "https://example.com/missing";
    const secondMissingUrl = "https://example.com/also-missing";
    const duplicateUrl = "https://example.com/duplicate";
    const fetchPage = mockFetcher((url) => {
      if (url.endsWith("/robots.txt")) return page(url, { status: 404, contentType: "text/plain", body: "" });
      if (url.endsWith("/sitemap.xml")) return page(url, { status: 404, contentType: "text/plain", body: "" });
      if (url === ROOT) return page(url, { body: `<html><head><title>Shared title for two landing pages</title><meta name="description" content="${longDescription}"></head><body><h1>Home</h1><a href="/duplicate">Second</a><a href="/missing">Broken</a><a href="/also-missing">Broken two</a></body></html>` });
      if (url === duplicateUrl) return page(url, { body: `<html><head><title>Shared title for two landing pages</title><meta name="description" content="${longDescription}"></head><body><h1>Second page</h1></body></html>` });
      if (url === missingUrl) return page(url, { status: 404, body: "<html><head><title>404</title></head><body>missing</body></html>" });
      if (url === secondMissingUrl) return page(url, { status: 404, body: "<html><head><title>404</title></head><body>missing</body></html>" });
      throw new Error(`Unexpected URL ${url}`);
    });
    const result = await runMultiUrlScan(ROOT, { maxUrls: 5, requestDelayMs: 0, fetchPage });
    const titleDuplicate = result.findings.find((finding) => finding.ruleId === "SEO_TITLE_DUPLICATE");
    const descriptionDuplicate = result.findings.find((finding) => finding.ruleId === "SEO_META_DESCRIPTION_DUPLICATE");
    const brokenLink = result.findings.find((finding) => finding.ruleId === "SEO_BROKEN_INTERNAL_LINK");
    assert.deepEqual(titleDuplicate?.affectedUrls.map((item) => item.url).sort(), [ROOT, duplicateUrl].sort());
    assert.deepEqual(descriptionDuplicate?.affectedUrls.map((item) => item.url).sort(), [ROOT, duplicateUrl].sort());
    assert.equal(titleDuplicate?.status, "REVIEW_REQUIRED");
    assert.equal(descriptionDuplicate?.status, "REVIEW_REQUIRED");
    assert.equal(brokenLink?.affectedUrls.length, 1, "two broken links from one source must not count as two affected pages");
    assert.equal(brokenLink?.affectedUrls[0]?.url, ROOT);
    assert.ok(brokenLink?.affectedUrls[0]?.evidence.includes("HTTP 404"));
    assert.ok(brokenLink?.affectedUrls[0]?.evidence.includes(secondMissingUrl));
    assert.ok(result.urlResults.find((item) => item.url === duplicateUrl)?.findings.some((finding) => finding.ruleId === "SEO_TITLE_DUPLICATE"));
    assert.deepEqual(aggregateCrawlFindings(result.urlResults).map((finding) => finding.ruleId).sort(), result.findings.map((finding) => finding.ruleId).sort());
  });

  await test("hard URL limit rejects values above 20 and never calls fetcher", async () => {
    let called = false;
    const fetchPage = mockFetcher((url) => { called = true; return page(url); });
    await assert.rejects(runMultiUrlScan(ROOT, { maxUrls: 21, fetchPage }), (error: unknown) => error instanceof CrawlerServiceError && error.code === "INVALID_URL_LIMIT");
    assert.equal(called, false);
  });

  await test("a 429 response stops the queue and returns partial status", async () => {
    const calls: string[] = [];
    const fetchPage = mockFetcher((url) => {
      calls.push(url);
      if (url.endsWith("/robots.txt")) return page(url, { contentType: "text/plain", body: "" });
      if (url.endsWith("/sitemap.xml")) return page(url, { status: 429, contentType: "text/plain", body: "slow down" });
      return page(url);
    });
    const result = await runMultiUrlScan(ROOT, { maxUrls: 10, requestDelayMs: 0, fetchPage });
    assert.equal(result.status, "PARTIAL");
    assert.equal(result.stopReason, "HTTP_429");
    assert.equal(calls.some((url) => url === ROOT), false);
    assert.ok(result.warnings.some((warning) => warning.includes("429")));
  });

  await test("per-host request delay is applied to robots, sitemap, and pages", async () => {
    const starts: number[] = [];
    const fetchPage = mockFetcher((url) => {
      starts.push(Date.now());
      if (url.endsWith("/robots.txt")) return page(url, { contentType: "text/plain", body: "" });
      if (url.endsWith("/sitemap.xml")) return page(url, { status: 404, contentType: "text/plain", body: "" });
      return page(url);
    });
    await runMultiUrlScan(ROOT, { maxUrls: 1, requestDelayMs: 20, fetchPage });
    assert.ok(starts.length >= 3);
    assert.ok(starts.slice(1).every((time, index) => time - starts[index] >= 15));
  });

  await test("concurrency never exceeds two and parallel work is used when sitemap provides URLs", async () => {
    let active = 0;
    let maximum = 0;
    const fetchPage = mockFetcher(async (url) => {
      if (url.endsWith("/robots.txt")) return page(url, { contentType: "text/plain", body: "Sitemap: https://example.com/pages.xml" });
      if (url.endsWith("/pages.xml")) return page(url, { contentType: "application/xml", body: `<urlset><loc>https://example.com/a</loc><loc>https://example.com/b</loc></urlset>` });
      if (url.endsWith("/sitemap.xml")) return page(url, { status: 404, contentType: "text/plain", body: "" });
      active++;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 40));
      active--;
      return page(url);
    });
    const result = await runMultiUrlScan(ROOT, { maxUrls: 3, requestDelayMs: 0, fetchPage });
    assert.equal(result.scannedUrlCount, 3);
    assert.ok(maximum <= 2);
    assert.equal(maximum, 2);
  });

  await test("cancel keeps completed URL results and marks the scan cancelled", async () => {
    const controller = new AbortController();
    let rootStarted!: () => void;
    const started = new Promise<void>((resolve) => { rootStarted = resolve; });
    const fetchPage = mockFetcher((url, options) => {
      if (url.endsWith("/robots.txt")) return page(url, { status: 404, contentType: "text/plain", body: "" });
      if (url.endsWith("/sitemap.xml")) return page(url, { status: 404, contentType: "text/plain", body: "" });
      rootStarted();
      return new Promise<SafeFetchResult>((_, reject) => {
        options.signal?.addEventListener("abort", () => reject(new ScannerFetchError("cancelled", "SCAN_CANCELLED", url)), { once: true });
      });
    });
    const pending = runMultiUrlScan(ROOT, { maxUrls: 1, requestDelayMs: 0, fetchPage, signal: controller.signal });
    await started;
    controller.abort();
    const result = await pending;
    assert.equal(result.status, "CANCELLED");
    assert.equal(result.urlResults.length, 1);
    assert.equal(result.urlResults[0].status, "FAILED");
  });

  await test("total scan timeout returns partial results without waiting on a stuck fetch", async () => {
    const fetchPage = mockFetcher((url, options) => {
      if (url.endsWith("/robots.txt")) return page(url, { status: 404, contentType: "text/plain", body: "" });
      return new Promise<SafeFetchResult>((_, reject) => {
        options.signal?.addEventListener("abort", () => reject(new ScannerFetchError("timeout", "TOTAL_TIMEOUT", url)), { once: true });
      });
    });
    const result = await runMultiUrlScan(ROOT, { maxUrls: 2, requestDelayMs: 0, maxDurationMs: 25, fetchPage });
    assert.equal(result.status, "PARTIAL");
    assert.equal(result.stopReason, "TOTAL_SCAN_TIMEOUT");
  });

  await test("service fails closed outside development before the injected fetcher runs", async () => {
    const previous = process.env.NODE_ENV;
    env.NODE_ENV = "production";
    let called = false;
    try {
      await assert.rejects(runMultiUrlScan(ROOT, { fetchPage: mockFetcher((url) => { called = true; return page(url); }) }), /fail-closed/i);
    } finally {
      env.NODE_ENV = previous || "development";
    }
    assert.equal(called, false);
  });

  env.NODE_ENV = originalNodeEnv || "development";
  console.log(`\nCrawler tests: ${passed} passed, ${failed} failed.`);
  if (failed > 0) process.exitCode = 1;
}

runTests().catch((error) => {
  console.error("Fatal crawler test error:", error);
  process.exitCode = 1;
});

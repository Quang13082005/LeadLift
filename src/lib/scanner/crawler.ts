import { analyzeWebsite } from "./html-analyzer";
import { aggregateCrawlFindings } from "./crawl-findings";
import {
  extractInternalLinks,
  isAllowedByRobots,
  isHtmlContentType,
  isSitemapIndex,
  normalizeCrawlUrl,
  parseRobotsTxt,
  parseSitemapLocs,
  type RobotsPolicy,
} from "./crawl-discovery";
import { enforceScannerDevOnly } from "./scanner-service";
import { safeFetchWebsite, ScannerFetchError, type SafeFetchOptions, type SafeFetchResult } from "./safe-fetcher";
import { validateTargetUrl } from "./ssrf-validator";
import type { CrawlProgress, CrawlResult, CrawlStreamEvent, CrawlUrlResult, ParsedHtmlData, ScanFinding } from "@/types/scanner";

export { aggregateCrawlFindings } from "./crawl-findings";

export const CRAWL_LIMITS = {
  maxUrls: 20,
  maxDepth: 3,
  maxConcurrency: 2,
  requestDelayMs: 250,
  maxDurationMs: 120_000,
  maxSitemapDocuments: 5,
  maxSitemapLocations: 200,
  maxLinksPerPage: 200,
  maxBodySizeBytes: 2 * 1024 * 1024,
  requestTimeoutMs: 10_000,
} as const;

export class CrawlerServiceError extends Error {
  code: string;
  statusCode: number;

  constructor(message: string, code: string, statusCode = 400) {
    super(message);
    this.name = "CrawlerServiceError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export type CrawlFetcher = (url: string, options: SafeFetchOptions) => Promise<SafeFetchResult>;

export interface CrawlOptions {
  maxUrls?: number;
  signal?: AbortSignal;
  onEvent?: (event: CrawlStreamEvent) => void;
  /** Test seam. Production routes always use the SSRF-safe fetcher. */
  fetchPage?: CrawlFetcher;
  /** Test seam; production uses the fixed 250ms delay. */
  requestDelayMs?: number;
  /** Test seam; production uses the fixed 120 second deadline. */
  maxDurationMs?: number;
}

interface QueueItem {
  url: string;
  depth: number;
  discoveredFrom: Set<string>;
}

class HostRateLimiter {
  private lastStartedAt = 0;
  private queued: Promise<void> = Promise.resolve();

  constructor(private readonly delayMs: number) {}

  async wait(signal: AbortSignal): Promise<void> {
    const turn = this.queued.then(async () => {
      const waitMs = Math.max(0, this.lastStartedAt + this.delayMs - Date.now());
      if (waitMs > 0) await abortableDelay(waitMs, signal);
      if (signal.aborted) throw signal.reason || new Error("aborted");
      this.lastStartedAt = Date.now();
    });
    this.queued = turn.catch(() => {});
    await turn;
  }
}

function abortableDelay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason || new Error("aborted"));
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      reject(signal.reason || new Error("aborted"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function emit(options: CrawlOptions, event: CrawlStreamEvent): void {
  try {
    options.onEvent?.(event);
  } catch {
    // A disconnected UI must not break the bounded crawler's cleanup path.
  }
}

function makeProgress(
  phase: CrawlProgress["phase"],
  discovered: number,
  attempted: number,
  completed: number,
  failed: number,
  limit: number,
  currentUrl?: string
): CrawlProgress {
  return currentUrl
    ? { phase, discovered, attempted, completed, failed, limit, currentUrl }
    : { phase, discovered, attempted, completed, failed, limit };
}

function errorDetails(error: unknown): { code: string; message: string; httpStatus?: number } {
  if (error instanceof ScannerFetchError) {
    return {
      code: error.code,
      message: error.message,
      ...(error.httpStatus === undefined ? {} : { httpStatus: error.httpStatus }),
    };
  }
  return {
    code: "FETCH_FAILED",
    message: "Không thể tải URL này trong phạm vi quét hiện tại.",
  };
}

function makeNetworkUnknownFinding(url: string, failureCode: string, message: string): ScanFinding {
  const timestamp = new Date().toISOString();
  return {
    ruleId: "HTTP_STATUS",
    ruleName: "Mã trạng thái phản hồi HTTP",
    category: "TECHNICAL",
    severity: "MEDIUM",
    status: "UNKNOWN",
    description: "Không nhận được phản hồi HTTP để xác định tình trạng của URL.",
    evidence: `${failureCode}: ${message}`,
    sourceUrl: url,
    timestamp,
    recommendation: "Kiểm tra DNS, kết nối mạng hoặc thử lại sau. Đây chưa phải bằng chứng về lỗi SEO của trang.",
  };
}

function makeHttpOnlyFindings(url: string, httpStatus: number, statusText: string): ScanFinding[] {
  const { findings } = analyzeWebsite({
    targetUrl: url,
    finalUrl: url,
    httpStatus,
    statusText,
    responseTimeMs: 0,
    headers: {},
    htmlBody: "",
  });
  return findings.filter((finding) => finding.ruleId === "HTTP_STATUS");
}

function makePageResult(
  item: QueueItem,
  fetched: SafeFetchResult,
  findings: ScanFinding[],
  internalLinks: string[],
  pageData?: ParsedHtmlData
): CrawlUrlResult {
  return {
    url: item.url,
    finalUrl: fetched.finalUrl,
    depth: item.depth,
    discoveredFrom: [...item.discoveredFrom],
    status: "SCANNED",
    httpStatus: fetched.httpStatus,
    statusText: fetched.statusText,
    ...(pageData?.title ? { title: pageData.title } : {}),
    ...(pageData?.metaDescription ? { metaDescription: pageData.metaDescription } : {}),
    responseTimeMs: fetched.responseTimeMs,
    contentType: fetched.contentType,
    contentLength: fetched.contentLength,
    scannedAt: new Date().toISOString(),
    findings,
    internalLinks,
  };
}

function makeFailedResult(item: QueueItem, error: unknown, stopReason?: string): CrawlUrlResult {
  const detail = errorDetails(error);
  const failureMessage = stopReason ? `Đã dừng lượt quét: ${stopReason}.` : detail.message;
  return {
    url: item.url,
    depth: item.depth,
    discoveredFrom: [...item.discoveredFrom],
    status: "FAILED",
    ...(detail.httpStatus === undefined ? {} : { httpStatus: detail.httpStatus }),
    scannedAt: new Date().toISOString(),
    findings: [makeNetworkUnknownFinding(item.url, stopReason ? "SCAN_STOPPED" : detail.code, failureMessage)],
    internalLinks: [],
    failureCode: stopReason ? "SCAN_STOPPED" : detail.code,
    failureMessage,
  };
}

function isRateLimited(status: number): boolean {
  return status === 429 || status === 503;
}

function duplicateFinding(
  ruleId: "SEO_TITLE_DUPLICATE" | "SEO_META_DESCRIPTION_DUPLICATE",
  ruleName: string,
  value: string,
  urls: string[]
): ScanFinding {
  const isTitle = ruleId === "SEO_TITLE_DUPLICATE";
  return {
    ruleId,
    ruleName,
    category: "SEO",
    severity: "MEDIUM",
    status: "REVIEW_REQUIRED",
    description: isTitle
      ? "Nhiều URL dùng cùng tiêu đề. Cần xem nội dung và vai trò từng trang trước khi quyết định có nên viết lại."
      : "Nhiều URL dùng cùng mô tả meta. Cần đối chiếu nội dung từng trang trước khi kết luận mức độ ảnh hưởng.",
    evidence: `Giá trị trùng: “${value}”. URL ảnh hưởng: ${urls.join(", ")}.`,
    sourceUrl: urls[0],
    timestamp: new Date().toISOString(),
    recommendation: isTitle
      ? "Rà soát các trang trong nhóm và viết tiêu đề mô tả riêng đúng nội dung khi việc phân biệt trang có ích cho người tìm kiếm."
      : "Rà soát các trang trong nhóm và viết mô tả riêng phản ánh đúng nội dung từng trang; không cần sửa nếu trùng lặp là chủ ý hợp lý.",
  };
}

function addCrossUrlFindings(results: CrawlUrlResult[]): void {
  const byRequestedUrl = new Map(results.map((result) => [result.url, result]));
  const successful = results.filter((result) => result.status === "SCANNED" && result.httpStatus !== undefined && result.httpStatus >= 200 && result.httpStatus < 400);
  const titleGroups = new Map<string, Array<{ url: string; value: string }>>();
  const descriptionGroups = new Map<string, Array<{ url: string; value: string }>>();

  for (const result of successful) {
    const title = result.title?.replace(/\s+/g, " ").trim();
    const description = result.metaDescription?.replace(/\s+/g, " ").trim();
    if (title) {
      const key = title.normalize("NFKC").toLocaleLowerCase("vi-VN");
      const group = titleGroups.get(key) || [];
      group.push({ url: result.url, value: title });
      titleGroups.set(key, group);
    }
    if (description) {
      const key = description.normalize("NFKC").toLocaleLowerCase("vi-VN");
      const group = descriptionGroups.get(key) || [];
      group.push({ url: result.url, value: description });
      descriptionGroups.set(key, group);
    }
  }

  for (const [normalizedValue, group] of titleGroups) {
    if (group.length < 2) continue;
    const urls = group.map((occurrence) => occurrence.url);
    const finding = duplicateFinding("SEO_TITLE_DUPLICATE", "Tiêu đề trùng lặp", group[0].value || normalizedValue, urls);
    for (const occurrence of group) byRequestedUrl.get(occurrence.url)?.findings.push({ ...finding, sourceUrl: occurrence.url });
  }

  for (const [normalizedValue, group] of descriptionGroups) {
    if (group.length < 2) continue;
    const urls = group.map((occurrence) => occurrence.url);
    const finding = duplicateFinding("SEO_META_DESCRIPTION_DUPLICATE", "Mô tả meta trùng lặp", group[0].value || normalizedValue, urls);
    for (const occurrence of group) byRequestedUrl.get(occurrence.url)?.findings.push({ ...finding, sourceUrl: occurrence.url });
  }

  const statusByUrl = new Map(results.map((result) => [result.url, result]));
  for (const source of successful) {
    for (const targetUrl of source.internalLinks) {
      const target = statusByUrl.get(targetUrl);
      if (!target || target.httpStatus === undefined || target.httpStatus < 400) continue;
      const evidence = `Liên kết nội bộ từ ${source.url} trỏ tới ${targetUrl}, máy chủ trả HTTP ${target.httpStatus}.`;
      source.findings.push({
        ruleId: "SEO_BROKEN_INTERNAL_LINK",
        ruleName: "Liên kết nội bộ không hoạt động",
        category: "SEO",
        severity: target.httpStatus >= 500 ? "HIGH" : "MEDIUM",
        status: "FAIL",
        description: "Một liên kết nội bộ trong trang được quét dẫn tới URL trả về lỗi HTTP.",
        evidence,
        sourceUrl: source.url,
        timestamp: new Date().toISOString(),
        recommendation: "Kiểm tra đường dẫn đích, khôi phục trang hoặc cập nhật liên kết tới nội dung phù hợp.",
      });
    }
  }
}

export async function runMultiUrlScan(rawRootUrl: string, options: CrawlOptions = {}): Promise<CrawlResult> {
  enforceScannerDevOnly();
  const maxUrls = options.maxUrls ?? CRAWL_LIMITS.maxUrls;
  if (!Number.isInteger(maxUrls) || maxUrls < 1 || maxUrls > CRAWL_LIMITS.maxUrls) {
    throw new CrawlerServiceError(`Giới hạn URL phải là số nguyên từ 1 đến ${CRAWL_LIMITS.maxUrls}.`, "INVALID_URL_LIMIT");
  }

  const rootValidation = validateTargetUrl(rawRootUrl);
  if (!rootValidation.valid || !rootValidation.normalizedUrl) {
    throw new CrawlerServiceError(rootValidation.reason || "URL gốc không hợp lệ.", rootValidation.code || "INVALID_ROOT_URL");
  }
  const root = new URL(rootValidation.normalizedUrl);
  root.hash = "";
  const rootUrl = root.href;
  const rootHost = root.hostname.toLowerCase();
  const now = new Date().toISOString();
  const id = `crawl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const startedAt = now;
  const warnings: string[] = [];
  const queue: QueueItem[] = [];
  const known = new Map<string, QueueItem>();
  const results: CrawlUrlResult[] = [];
  const fetchPage = options.fetchPage || safeFetchWebsite;
  const rateLimiter = new HostRateLimiter(options.requestDelayMs ?? CRAWL_LIMITS.requestDelayMs);
  const controller = new AbortController();
  let cancelledByUser = false;
  let deadlineExpired = false;
  let stopReason: string | undefined;
  let attempted = 0;
  let completed = 0;
  let failed = 0;
  let currentPhase: CrawlProgress["phase"] = "ROBOTS";
  let currentUrl: string | undefined;
  const durationMs = options.maxDurationMs ?? CRAWL_LIMITS.maxDurationMs;

  const onAbort = () => {
    cancelledByUser = true;
    controller.abort(new Error("CANCELLED"));
  };
  options.signal?.addEventListener("abort", onAbort, { once: true });
  if (options.signal?.aborted) onAbort();
  const deadlineTimer = setTimeout(() => {
    deadlineExpired = true;
    controller.abort(new Error("DEADLINE"));
  }, durationMs);

  const progress = (phase = currentPhase) => makeProgress(phase, known.size, attempted, completed, failed, maxUrls, currentUrl);
  const publishProgress = (phase = currentPhase) => emit(options, { type: "progress", progress: progress(phase) });

  const fetchScoped = async (url: string, allowXml = false): Promise<SafeFetchResult> => {
    await rateLimiter.wait(controller.signal);
    const elapsed = Date.now() - Date.parse(startedAt);
    const remainingMs = Math.max(1, durationMs - elapsed);
    return fetchPage(url, {
      allowedHost: rootHost,
      allowXml,
      maxBodySizeBytes: CRAWL_LIMITS.maxBodySizeBytes,
      totalTimeoutMs: Math.min(CRAWL_LIMITS.requestTimeoutMs, remainingMs),
      signal: controller.signal,
    });
  };

  const enqueue = (url: string, depth: number, sourceUrl: string) => {
    const normalized = normalizeCrawlUrl(url, sourceUrl, rootHost);
    if (!normalized || !isAllowedByRobots(normalized, robotsPolicy)) return;
    const existing = known.get(normalized);
    if (existing) {
      existing.discoveredFrom.add(sourceUrl);
      return;
    }
    if (known.size >= maxUrls) return;
    const item: QueueItem = { url: normalized, depth, discoveredFrom: new Set([sourceUrl]) };
    known.set(normalized, item);
    queue.push(item);
    publishProgress(currentPhase);
  };

  let robotsPolicy: RobotsPolicy = { allow: [], disallow: [], sitemapUrls: [] };
  let finalStatus: CrawlResult["status"] = "COMPLETED";

  try {
    publishProgress("ROBOTS");
    const robotsUrl = new URL("/robots.txt", root.origin).href;
    let robotsResponse: SafeFetchResult;
    try {
      robotsResponse = await fetchScoped(robotsUrl);
    } catch (error) {
      if (controller.signal.aborted) {
        if (!cancelledByUser && !deadlineExpired) stopReason ||= "Robots fetch bị dừng trước khi bắt đầu crawl";
        finalStatus = cancelledByUser ? "CANCELLED" : "PARTIAL";
        warnings.push(cancelledByUser ? "Đã hủy khi đang đọc robots.txt; chưa có URL nội dung nào được quét." : deadlineExpired ? "Hết thời gian tối đa khi đang đọc robots.txt." : errorDetails(error).message);
        return buildResult();
      }
      const detail = errorDetails(error);
      finalStatus = "FAILED";
      stopReason = "ROBOTS_FETCH_FAILED";
      warnings.push(`Không xác định được robots.txt; dừng an toàn trước khi quét trang. ${detail.message}`);
      return buildResult();
    }

    if (isRateLimited(robotsResponse.httpStatus)) {
      stopReason = `ROBOTS_HTTP_${robotsResponse.httpStatus}`;
      finalStatus = "PARTIAL";
      warnings.push(`robots.txt trả HTTP ${robotsResponse.httpStatus}; đã dừng để tránh gây thêm tải.`);
      return buildResult();
    }
    if (robotsResponse.httpStatus >= 500 || robotsResponse.httpStatus === 401 || robotsResponse.httpStatus === 403) {
      stopReason = `ROBOTS_HTTP_${robotsResponse.httpStatus}`;
      finalStatus = "BLOCKED";
      warnings.push(`robots.txt trả HTTP ${robotsResponse.httpStatus}; dừng crawl theo chính sách an toàn.`);
      return buildResult();
    }
    if (robotsResponse.httpStatus !== 404 && robotsResponse.httpStatus !== 410 && (robotsResponse.httpStatus < 200 || robotsResponse.httpStatus >= 400)) {
      finalStatus = "BLOCKED";
      stopReason = `ROBOTS_HTTP_${robotsResponse.httpStatus}`;
      warnings.push(`Không thể đọc chính sách robots.txt (HTTP ${robotsResponse.httpStatus}); đã dừng crawl.`);
      return buildResult();
    }
    robotsPolicy = robotsResponse.httpStatus === 404 || robotsResponse.httpStatus === 410
      ? robotsPolicy
      : parseRobotsTxt(robotsResponse.htmlBody);

    if (!isAllowedByRobots(rootUrl, robotsPolicy)) {
      finalStatus = "BLOCKED";
      stopReason = "ROBOTS_DISALLOW_ROOT";
      warnings.push("robots.txt không cho phép quét URL gốc; không có trang nội dung nào được tải.");
      return buildResult();
    }

    currentPhase = "SITEMAP";
    publishProgress();
    enqueue(rootUrl, 0, rootUrl);

    const sitemapCandidates = [
      ...robotsPolicy.sitemapUrls.slice(0, CRAWL_LIMITS.maxSitemapDocuments),
      new URL("/sitemap.xml", root.origin).href,
    ];
    const sitemapQueue: string[] = [];
    const seenSitemapDocs = new Set<string>();
    for (const candidate of sitemapCandidates) {
      const normalized = normalizeCrawlUrl(candidate, rootUrl, rootHost);
      if (normalized && !seenSitemapDocs.has(normalized)) {
        seenSitemapDocs.add(normalized);
        sitemapQueue.push(normalized);
      }
    }

    let sitemapDocumentsRead = 0;
    while (sitemapQueue.length && sitemapDocumentsRead < CRAWL_LIMITS.maxSitemapDocuments && !controller.signal.aborted) {
      const sitemapUrl = sitemapQueue.shift()!;
      sitemapDocumentsRead++;
      try {
        const sitemap = await fetchScoped(sitemapUrl, true);
        if (isRateLimited(sitemap.httpStatus)) {
          stopReason = `HTTP_${sitemap.httpStatus}`;
          finalStatus = "PARTIAL";
          warnings.push(`Sitemap trả HTTP ${sitemap.httpStatus}; đã dừng để tránh tiếp tục gây tải.`);
          controller.abort(new Error("RATE_LIMIT"));
          break;
        }
        if (sitemap.httpStatus >= 500) {
          warnings.push(`Sitemap không khả dụng (HTTP ${sitemap.httpStatus}); các URL đã phát hiện vẫn có thể được quét.`);
          continue;
        }
        if (sitemap.httpStatus < 200 || sitemap.httpStatus >= 400) continue;

        const locations = parseSitemapLocs(sitemap.htmlBody, CRAWL_LIMITS.maxSitemapLocations);
        if (isSitemapIndex(sitemap.htmlBody)) {
          for (const location of locations) {
            const nested = normalizeCrawlUrl(location, sitemap.finalUrl, rootHost);
            if (nested && !seenSitemapDocs.has(nested) && seenSitemapDocs.size < CRAWL_LIMITS.maxSitemapDocuments + 1) {
              seenSitemapDocs.add(nested);
              sitemapQueue.push(nested);
            }
          }
        } else {
          for (const location of locations) {
            enqueue(location, 1, sitemap.finalUrl);
            if (known.size >= maxUrls) break;
          }
        }
      } catch (error) {
        if (controller.signal.aborted) break;
        warnings.push(`Sitemap ${sitemapUrl} không đọc được: ${errorDetails(error).message}`);
      }
      publishProgress();
    }

    if (controller.signal.aborted && !stopReason) {
      finalStatus = cancelledByUser ? "CANCELLED" : "PARTIAL";
      if (deadlineExpired) {
        stopReason = "TOTAL_SCAN_TIMEOUT";
        warnings.push("Đã đạt giới hạn tổng thời gian; giữ lại các kết quả đã hoàn thành.");
      }
      if (cancelledByUser) warnings.push("Đã hủy crawl; giữ lại các kết quả đã hoàn thành.");
    }

    if (!controller.signal.aborted) {
      currentPhase = "CRAWL";
      publishProgress();
      const workers = Array.from({ length: CRAWL_LIMITS.maxConcurrency }, async () => {
        while (queue.length > 0 && !controller.signal.aborted) {
          const item = queue.shift();
          if (!item) return;
          attempted++;
          currentUrl = item.url;
          publishProgress();

          let row: CrawlUrlResult;
          try {
            const fetched = await fetchScoped(item.url);
            let pageFindings: ScanFinding[];
            let internalLinks: string[] = [];
            let pageData: ParsedHtmlData | undefined;
            if (fetched.httpStatus < 200 || fetched.httpStatus >= 300 || !isHtmlContentType(fetched.contentType)) {
              pageFindings = makeHttpOnlyFindings(fetched.finalUrl, fetched.httpStatus, fetched.statusText);
            } else {
              const analyzed = analyzeWebsite({
                targetUrl: item.url,
                finalUrl: fetched.finalUrl,
                httpStatus: fetched.httpStatus,
                statusText: fetched.statusText,
                responseTimeMs: fetched.responseTimeMs,
                headers: fetched.headers,
                htmlBody: fetched.htmlBody,
              });
              pageFindings = analyzed.findings;
              pageData = analyzed.pageData;
              if (fetched.httpStatus >= 200 && fetched.httpStatus < 300) {
                const discovered = extractInternalLinks(fetched.htmlBody, fetched.finalUrl, rootHost, CRAWL_LIMITS.maxLinksPerPage);
                internalLinks = discovered.map((entry) => entry.url);
                if (item.depth < CRAWL_LIMITS.maxDepth) {
                  for (const entry of discovered) enqueue(entry.url, item.depth + 1, item.url);
                }
              }
            }
            row = makePageResult(item, fetched, pageFindings, internalLinks, pageData);
            if (isRateLimited(fetched.httpStatus)) {
              stopReason = `HTTP_${fetched.httpStatus}`;
              finalStatus = "PARTIAL";
              warnings.push(`HTTP ${fetched.httpStatus} từ ${item.url}; các request mới đã dừng. Retry-After không được tự động bỏ qua.`);
              controller.abort(new Error("RATE_LIMIT"));
            }
          } catch (error) {
            row = makeFailedResult(item, error, stopReason);
            if (controller.signal.aborted && cancelledByUser) finalStatus = "CANCELLED";
            else if (controller.signal.aborted && deadlineExpired) {
              finalStatus = "PARTIAL";
              stopReason = "TOTAL_SCAN_TIMEOUT";
            }
            failed++;
          }

          results.push(row);
          completed++;
          if (row.status === "FAILED") failed = Math.max(failed, results.filter((result) => result.status === "FAILED").length);
          emit(options, { type: "url", url: row });
          publishProgress();
        }
      });
      await Promise.all(workers);
    }

    if (results.length === 0 && finalStatus === "COMPLETED") finalStatus = "FAILED";
    if (failed > 0 && finalStatus === "COMPLETED") finalStatus = "PARTIAL";
    if (cancelledByUser) finalStatus = "CANCELLED";
    if (deadlineExpired && finalStatus !== "FAILED") {
      finalStatus = "PARTIAL";
      stopReason = "TOTAL_SCAN_TIMEOUT";
    }

    currentPhase = "AGGREGATE";
    publishProgress();
    addCrossUrlFindings(results);
    return buildResult();
  } finally {
    clearTimeout(deadlineTimer);
    options.signal?.removeEventListener("abort", onAbort);
  }

  function buildResult(): CrawlResult {
    results.sort((a, b) => a.depth - b.depth || a.url.localeCompare(b.url));
    const timestamp = new Date().toISOString();
    const crawlResult: CrawlResult = {
      id,
      targetUrl: rootUrl,
      rootHost,
      status: finalStatus,
      startedAt,
      completedAt: timestamp,
      requestedUrlLimit: maxUrls,
      scannedUrlCount: results.length,
      successfulUrlCount: results.filter((result) => result.status === "SCANNED" && (result.httpStatus || 0) >= 200 && (result.httpStatus || 0) < 400).length,
      failedUrlCount: results.filter((result) => result.status === "FAILED").length,
      urlResults: results,
      findings: aggregateCrawlFindings(results),
      progress: makeProgress(currentPhase, known.size, attempted, completed, failed, maxUrls),
      warnings,
      ...(stopReason ? { stopReason } : {}),
    };
    emit(options, { type: "complete", result: crawlResult });
    return crawlResult;
  }
}

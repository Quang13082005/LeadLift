import { safeFetchWebsite, ScannerFetchError } from "./safe-fetcher";
import { analyzeWebsite } from "./html-analyzer";
import type { ScanResult } from "@/types/scanner";

export class ScannerServiceError extends Error {
  code: string;
  statusCode: number;

  constructor(message: string, code = "SCANNER_ERROR", statusCode = 400) {
    super(message);
    this.name = "ScannerServiceError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

/**
 * Server-side fail-closed guard: Website scanner must strictly reject
 * access when running in production until formal Authentication is integrated.
 */
export function enforceScannerDevOnly(): void {
  if (process.env.NODE_ENV !== "development") {
    throw new ScannerServiceError(
      "Truy cập bị từ chối (fail-closed). Chức năng quét website chỉ khả dụng trong môi trường development local cho đến khi hoàn tất Authentication.",
      "DEV_ONLY_RESTRICTION",
      403
    );
  }
}

// In-memory concurrency guard to prevent resource exhaustion
let activeScansCount = 0;
const MAX_CONCURRENT_SCANS = 1;

/**
 * Scans a target website URL using the SSRF-safe fetcher and runs 10 technical checks.
 * Produces structured findings with concrete evidence.
 * Does NOT persist findings to the Neon database in Phase 03A.
 */
export async function scanWebsite(rawUrl: string): Promise<ScanResult> {
  enforceScannerDevOnly();

  if (activeScansCount >= MAX_CONCURRENT_SCANS) {
    throw new ScannerServiceError(
      "Hệ thống đang thực hiện một tác vụ quét khác. Vui lòng chờ tác vụ hiện tại hoàn tất trước khi bắt đầu lượt quét mới.",
      "CONCURRENCY_LIMIT_REACHED",
      429
    );
  }

  activeScansCount++;

  try {
    const fetchResult = await safeFetchWebsite(rawUrl);

    const { findings, summary, pageData } = analyzeWebsite({
      targetUrl: rawUrl,
      finalUrl: fetchResult.finalUrl,
      httpStatus: fetchResult.httpStatus,
      statusText: fetchResult.statusText,
      responseTimeMs: fetchResult.responseTimeMs,
      headers: fetchResult.headers,
      htmlBody: fetchResult.htmlBody,
    });

    const scanId = `scan_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    return {
      id: scanId,
      targetUrl: rawUrl,
      finalUrl: fetchResult.finalUrl,
      httpStatus: fetchResult.httpStatus,
      statusText: fetchResult.statusText,
      responseTimeMs: fetchResult.responseTimeMs,
      redirectCount: fetchResult.redirectCount,
      redirectChain: fetchResult.redirectChain,
      scannedAt: new Date().toISOString(),
      contentType: fetchResult.contentType,
      contentLength: fetchResult.contentLength,
      findings,
      summary,
      pageData,
      headers: fetchResult.headers,
    };
  } catch (err) {
    if (err instanceof ScannerFetchError) {
      throw new ScannerServiceError(err.message, err.code, err.httpStatus || 400);
    }
    if (err instanceof ScannerServiceError) {
      throw err;
    }
    const message = err instanceof Error ? err.message : "Đã xảy ra lỗi không xác định khi quét website.";
    throw new ScannerServiceError(message, "SCAN_FAILED", 500);
  } finally {
    activeScansCount = Math.max(0, activeScansCount - 1);
  }
}

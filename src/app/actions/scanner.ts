"use server";

import { scanWebsite, enforceScannerDevOnly, ScannerServiceError } from "@/lib/scanner/scanner-service";
import type { ScanResult } from "@/types/scanner";

export interface ScanActionResult {
  success: boolean;
  data?: ScanResult;
  error?: string;
  code?: string;
}

/**
 * Server Action to trigger a safe website scan.
 * Enforces development-only access (fail-closed in production).
 */
export async function scanWebsiteAction(targetUrl: string): Promise<ScanActionResult> {
  try {
    enforceScannerDevOnly();

    if (!targetUrl || typeof targetUrl !== "string") {
      return {
        success: false,
        error: "Vui lòng nhập địa chỉ URL cần kiểm tra.",
        code: "MISSING_URL",
      };
    }

    const trimmedUrl = targetUrl.trim();
    const result = await scanWebsite(trimmedUrl);

    return {
      success: true,
      data: result,
    };
  } catch (err) {
    if (err instanceof ScannerServiceError) {
      return {
        success: false,
        error: err.message,
        code: err.code,
      };
    }
    const message = err instanceof Error ? err.message : "Đã xảy ra lỗi không xác định khi quét website.";
    return {
      success: false,
      error: message,
      code: "UNKNOWN_ERROR",
    };
  }
}

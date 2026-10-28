import http from "node:http";
import https from "node:https";
import { createSsrfSafeLookup, validateTargetUrl } from "./ssrf-validator";
import type { RedirectHop } from "@/types/scanner";

export interface SafeFetchOptions {
  maxRedirects?: number;
  connectTimeoutMs?: number;
  totalTimeoutMs?: number;
  maxBodySizeBytes?: number;
  userAgent?: string;
}

export interface SafeFetchResult {
  finalUrl: string;
  httpStatus: number;
  statusText: string;
  headers: Record<string, string>;
  htmlBody: string;
  responseTimeMs: number;
  redirectCount: number;
  redirectChain: RedirectHop[];
  contentLength: number;
  contentType: string;
}

export class ScannerFetchError extends Error {
  code: string;
  httpStatus?: number;
  url: string;

  constructor(message: string, code: string, url: string, httpStatus?: number) {
    super(message);
    this.name = "ScannerFetchError";
    this.code = code;
    this.url = url;
    this.httpStatus = httpStatus;
  }
}

const DEFAULT_MAX_REDIRECTS = 5;
const DEFAULT_CONNECT_TIMEOUT_MS = 5000;
const DEFAULT_TOTAL_TIMEOUT_MS = 10000;
const DEFAULT_MAX_BODY_SIZE_BYTES = 2 * 1024 * 1024; // 2MB
const DEFAULT_USER_AGENT = "LeadLift-Scanner/1.0 (+https://leadlift.example; website audit preview)";

/**
 * Executes a single HTTP/HTTPS request step with SSRF protection,
 * custom DNS pinning, response size limits, and timeout controls.
 */
function performSingleRequest(
  targetUrl: string,
  options: Required<SafeFetchOptions>
): Promise<{
  statusCode: number;
  statusMessage: string;
  headers: Record<string, string>;
  body: string;
  location?: string;
}> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(targetUrl);
    const isHttps = parsed.protocol === "https:";
    const client = isHttps ? https : http;

    const lookup = createSsrfSafeLookup();
    const agent = isHttps
      ? new https.Agent({ keepAlive: false, lookup, timeout: options.connectTimeoutMs })
      : new http.Agent({ keepAlive: false, lookup, timeout: options.connectTimeoutMs });

    const requestOptions: http.RequestOptions = {
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: `${parsed.pathname}${parsed.search}`,
      method: "GET",
      agent,
      headers: {
        "User-Agent": options.userAgent,
        Accept: "text/html,application/xhtml+xml,text/plain;q=0.9",
        "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
        "Cache-Control": "no-cache",
        Connection: "close",
      },
      timeout: options.connectTimeoutMs,
    };

    let totalBytes = 0;
    const chunks: Buffer[] = [];
    let isAborted = false;

    const req = client.request(requestOptions, (res) => {
      const statusCode = res.statusCode || 0;
      const statusMessage = res.statusMessage || "";

      // Normalize headers
      const headers: Record<string, string> = {};
      for (const [key, value] of Object.entries(res.headers)) {
        if (value !== undefined) {
          headers[key.toLowerCase()] = Array.isArray(value) ? value.join(", ") : value;
        }
      }

      // Check Content-Type
      const rawContentType = headers["content-type"] || "";
      const contentType = rawContentType.split(";")[0].trim().toLowerCase();

      // Check for redirect responses (301, 302, 303, 307, 308)
      if ([301, 302, 303, 307, 308].includes(statusCode)) {
        const location = headers["location"];
        res.resume(); // discard body
        return resolve({ statusCode, statusMessage, headers, body: "", location });
      }

      // If not redirect, verify content type is acceptable (HTML or text)
      if (
        contentType &&
        !["text/html", "application/xhtml+xml", "text/plain"].some((t) => contentType.includes(t))
      ) {
        // Disallow binary file downloads (images, pdfs, audio, video, zip, etc.)
        isAborted = true;
        req.destroy();
        return reject(
          new ScannerFetchError(
            `Loại nội dung '${contentType}' không được hỗ trợ. Scanner chỉ phân tích trang web HTML/văn bản.`,
            "UNSUPPORTED_CONTENT_TYPE",
            targetUrl,
            statusCode
          )
        );
      }

      // Check Content-Length header if present
      const reportedLength = parseInt(headers["content-length"] || "0", 10);
      if (reportedLength > options.maxBodySizeBytes) {
        isAborted = true;
        req.destroy();
        return reject(
          new ScannerFetchError(
            `Kích thước trang web (${reportedLength} bytes) vượt quá giới hạn tối đa cho phép (2MB).`,
            "BODY_SIZE_EXCEEDED",
            targetUrl,
            statusCode
          )
        );
      }

      res.on("data", (chunk: Buffer) => {
        if (isAborted) return;
        totalBytes += chunk.length;
        if (totalBytes > options.maxBodySizeBytes) {
          isAborted = true;
          req.destroy();
          return reject(
            new ScannerFetchError(
              "Nội dung phản hồi vượt quá giới hạn tối đa 2MB trong quá trình tải.",
              "BODY_SIZE_EXCEEDED",
              targetUrl,
              statusCode
            )
          );
        }
        chunks.push(chunk);
      });

      res.on("end", () => {
        if (isAborted) return;
        const bodyBuffer = Buffer.concat(chunks);
        const body = bodyBuffer.toString("utf8");
        resolve({ statusCode, statusMessage, headers, body });
      });

      res.on("error", (err) => {
        if (isAborted) return;
        reject(
          new ScannerFetchError(
            `Lỗi khi đọc dữ liệu từ máy chủ: ${err.message}`,
            "SOCKET_READ_ERROR",
            targetUrl
          )
        );
      });
    });

    req.on("timeout", () => {
      isAborted = true;
      req.destroy();
      reject(
        new ScannerFetchError(
          `Kết nối đến website quá thời gian chờ (hơn ${options.connectTimeoutMs}ms).`,
          "CONNECT_TIMEOUT",
          targetUrl
        )
      );
    });

    req.on("error", (err) => {
      if (isAborted) return;
      // Handle SSRF rejection from custom lookup
      if (err.message.includes("SSRF Blocked")) {
        return reject(new ScannerFetchError(err.message, "SSRF_DNS_BLOCKED", targetUrl));
      }
      reject(
        new ScannerFetchError(
          `Không thể kết nối đến website: ${err.message}`,
          "CONNECTION_FAILED",
          targetUrl
        )
      );
    });

    req.end();
  });
}

/**
 * Safely fetches a website URL, resolving up to maxRedirects while enforcing
 * strict SSRF validation on every hop, timeouts, and body size limits.
 */
export async function safeFetchWebsite(
  initialUrl: string,
  userOptions: SafeFetchOptions = {}
): Promise<SafeFetchResult> {
  const options: Required<SafeFetchOptions> = {
    maxRedirects: userOptions.maxRedirects ?? DEFAULT_MAX_REDIRECTS,
    connectTimeoutMs: userOptions.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS,
    totalTimeoutMs: userOptions.totalTimeoutMs ?? DEFAULT_TOTAL_TIMEOUT_MS,
    maxBodySizeBytes: userOptions.maxBodySizeBytes ?? DEFAULT_MAX_BODY_SIZE_BYTES,
    userAgent: userOptions.userAgent ?? DEFAULT_USER_AGENT,
  };

  // Step 1: Initial URL validation
  const val = validateTargetUrl(initialUrl);
  if (!val.valid || !val.normalizedUrl) {
    throw new ScannerFetchError(val.reason || "URL không hợp lệ.", val.code || "INVALID_URL", initialUrl);
  }

  let currentUrl = val.normalizedUrl;
  const redirectChain: RedirectHop[] = [];
  const visited = new Set<string>([currentUrl]);

  const startTime = Date.now();

  // Enforce overall operation timeout
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(
        new ScannerFetchError(
          `Toàn bộ tác vụ quét quá thời gian chờ tối đa (${options.totalTimeoutMs}ms).`,
          "TOTAL_TIMEOUT",
          initialUrl
        )
      );
    }, options.totalTimeoutMs);
  });

  const fetchPromise = (async () => {
    let redirectCount = 0;

    while (redirectCount <= options.maxRedirects) {
      const response = await performSingleRequest(currentUrl, options);

      // Check if this response is a redirect
      if (response.location && [301, 302, 303, 307, 308].includes(response.statusCode)) {
        redirectCount++;
        if (redirectCount > options.maxRedirects) {
          throw new ScannerFetchError(
            `Website chuyển hướng (redirect) quá số lần cho phép (tối đa ${options.maxRedirects} lần).`,
            "TOO_MANY_REDIRECTS",
            currentUrl,
            response.statusCode
          );
        }

        // Resolve next URL relative to currentUrl
        let nextUrl: string;
        try {
          nextUrl = new URL(response.location, currentUrl).href;
        } catch {
          throw new ScannerFetchError(
            `Đường dẫn chuyển hướng không hợp lệ: '${response.location}'.`,
            "INVALID_REDIRECT_LOCATION",
            currentUrl,
            response.statusCode
          );
        }

        // Crucial SSRF check on every redirect hop!
        const nextVal = validateTargetUrl(nextUrl);
        if (!nextVal.valid || !nextVal.normalizedUrl) {
          throw new ScannerFetchError(
            `Chuyển hướng đến địa chỉ bị từ chối bảo mật: ${nextVal.reason}`,
            nextVal.code || "REDIRECT_SSRF_BLOCKED",
            nextUrl,
            response.statusCode
          );
        }

        const normalizedNextUrl = nextVal.normalizedUrl;

        // Detect redirect loops
        if (visited.has(normalizedNextUrl)) {
          throw new ScannerFetchError(
            `Phát hiện vòng lặp chuyển hướng (redirect loop) tại URL '${normalizedNextUrl}'.`,
            "REDIRECT_LOOP",
            normalizedNextUrl,
            response.statusCode
          );
        }

        visited.add(normalizedNextUrl);
        redirectChain.push({
          from: currentUrl,
          to: normalizedNextUrl,
          status: response.statusCode,
        });

        currentUrl = normalizedNextUrl;
        continue;
      }

      // Reached final non-redirect response
      const responseTimeMs = Date.now() - startTime;
      const rawContentType = response.headers["content-type"] || "text/html";

      return {
        finalUrl: currentUrl,
        httpStatus: response.statusCode,
        statusText: response.statusMessage,
        headers: response.headers,
        htmlBody: response.body,
        responseTimeMs,
        redirectCount,
        redirectChain,
        contentLength: Buffer.byteLength(response.body, "utf8"),
        contentType: rawContentType,
      };
    }

    throw new ScannerFetchError(
      `Vượt quá giới hạn chuyển hướng (${options.maxRedirects}).`,
      "TOO_MANY_REDIRECTS",
      currentUrl
    );
  })();

  return Promise.race([fetchPromise, timeoutPromise]);
}

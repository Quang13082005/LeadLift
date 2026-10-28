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
  /** Limit the initial URL and every redirect hop to this exact hostname. */
  allowedHost?: string;
  /** Permit XML content types for bounded sitemap retrieval only. */
  allowXml?: boolean;
  /** Abort in-flight DNS/socket work when the caller cancels. */
  signal?: AbortSignal;
}

interface ResolvedSafeFetchOptions {
  maxRedirects: number;
  connectTimeoutMs: number;
  totalTimeoutMs: number;
  maxBodySizeBytes: number;
  userAgent: string;
  allowedHost: string | undefined;
  allowXml: boolean;
  signal: AbortSignal | undefined;
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
const MAX_ACTIVE_SAFE_REQUESTS = 2;

interface SafeRequestWaiter {
  url: string;
  signal: AbortSignal;
  resolve: (release: () => void) => void;
  reject: (error: Error) => void;
  onAbort: () => void;
}

let activeSafeRequests = 0;
const safeRequestWaiters: SafeRequestWaiter[] = [];

function makeSafeRequestRelease(): () => void {
  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeSafeRequests = Math.max(0, activeSafeRequests - 1);
    while (safeRequestWaiters.length > 0 && activeSafeRequests < MAX_ACTIVE_SAFE_REQUESTS) {
      const waiter = safeRequestWaiters.shift()!;
      waiter.signal.removeEventListener("abort", waiter.onAbort);
      if (waiter.signal.aborted) {
        waiter.reject(new ScannerFetchError("Quá trình quét đã bị hủy.", "SCAN_CANCELLED", waiter.url));
        continue;
      }
      activeSafeRequests++;
      waiter.resolve(makeSafeRequestRelease());
    }
  };
}

function acquireSafeRequestSlot(signal: AbortSignal, url: string): Promise<() => void> {
  if (signal.aborted) return Promise.reject(new ScannerFetchError("Quá trình quét đã bị hủy.", "SCAN_CANCELLED", url));
  if (activeSafeRequests < MAX_ACTIVE_SAFE_REQUESTS) {
    activeSafeRequests++;
    return Promise.resolve(makeSafeRequestRelease());
  }

  return new Promise((resolve, reject) => {
    const waiter: SafeRequestWaiter = {
      url,
      signal,
      resolve,
      reject,
      onAbort: () => {
        const index = safeRequestWaiters.indexOf(waiter);
        if (index >= 0) safeRequestWaiters.splice(index, 1);
        signal.removeEventListener("abort", waiter.onAbort);
        reject(new ScannerFetchError("Quá trình quét đã bị hủy.", "SCAN_CANCELLED", url));
      },
    };
    safeRequestWaiters.push(waiter);
    signal.addEventListener("abort", waiter.onAbort, { once: true });
    if (signal.aborted) waiter.onAbort();
  });
}

/**
 * Executes a single HTTP/HTTPS request step with SSRF protection,
 * custom DNS pinning, response size limits, and timeout controls.
 */
function performSingleRequest(
  targetUrl: string,
  options: ResolvedSafeFetchOptions
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

    let settled = false;
    let isAborted = false;
    const requestRef: { current?: http.ClientRequest } = {};
    const cleanup = () => {
      options.signal?.removeEventListener("abort", onAbort);
      agent.destroy();
    };
    const finishResolve = (value: {
      statusCode: number;
      statusMessage: string;
      headers: Record<string, string>;
      body: string;
      location?: string;
    }) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };
    const finishReject = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const onAbort = () => {
      if (settled) return;
      isAborted = true;
      requestRef.current?.destroy();
      const reason = options.signal?.reason;
      finishReject(reason instanceof ScannerFetchError ? reason : new ScannerFetchError("Quá trình quét đã bị hủy.", "SCAN_CANCELLED", targetUrl));
    };

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
        return finishResolve({ statusCode, statusMessage, headers, body: "", location });
      }

      // If not redirect, verify content type is acceptable (HTML or text)
      const acceptedContentTypes = ["text/html", "application/xhtml+xml", "text/plain"];
      const isXml = options.allowXml && (contentType === "application/xml" || contentType === "text/xml" || contentType.endsWith("+xml"));
      if (contentType && !acceptedContentTypes.includes(contentType) && !isXml) {
        // Disallow binary file downloads (images, pdfs, audio, video, zip, etc.)
        isAborted = true;
        req.destroy();
        return finishReject(
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
        return finishReject(
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
          return finishReject(
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
        finishResolve({ statusCode, statusMessage, headers, body });
      });

      res.on("error", (err) => {
        if (isAborted) return;
        finishReject(
          new ScannerFetchError(
            `Lỗi khi đọc dữ liệu từ máy chủ: ${err.message}`,
            "SOCKET_READ_ERROR",
            targetUrl
          )
        );
      });
    });
    requestRef.current = req;

    req.on("timeout", () => {
      isAborted = true;
      req.destroy();
      finishReject(
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
        return finishReject(new ScannerFetchError(err.message, "SSRF_DNS_BLOCKED", targetUrl));
      }
      finishReject(
        new ScannerFetchError(
          `Không thể kết nối đến website: ${err.message}`,
          "CONNECTION_FAILED",
          targetUrl
        )
      );
    });

    if (options.signal?.aborted) {
      onAbort();
      return;
    }
    options.signal?.addEventListener("abort", onAbort, { once: true });

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
  if (userOptions.signal?.aborted) {
    throw new ScannerFetchError("Quá trình quét đã bị hủy.", "SCAN_CANCELLED", initialUrl);
  }

  const operationController = new AbortController();
  const options: ResolvedSafeFetchOptions = {
    maxRedirects: userOptions.maxRedirects ?? DEFAULT_MAX_REDIRECTS,
    connectTimeoutMs: userOptions.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS,
    totalTimeoutMs: userOptions.totalTimeoutMs ?? DEFAULT_TOTAL_TIMEOUT_MS,
    maxBodySizeBytes: userOptions.maxBodySizeBytes ?? DEFAULT_MAX_BODY_SIZE_BYTES,
    userAgent: userOptions.userAgent ?? DEFAULT_USER_AGENT,
    allowedHost: userOptions.allowedHost,
    allowXml: userOptions.allowXml ?? false,
    signal: operationController.signal,
  };

  // Step 1: Initial URL validation
  const val = validateTargetUrl(initialUrl, options.allowedHost ? { allowedHost: options.allowedHost } : {});
  if (!val.valid || !val.normalizedUrl) {
    throw new ScannerFetchError(val.reason || "URL không hợp lệ.", val.code || "INVALID_URL", initialUrl);
  }

  let currentUrl = val.normalizedUrl;
  const redirectChain: RedirectHop[] = [];
  const visited = new Set<string>([currentUrl]);

  const startTime = Date.now();

  let rejectAbort: (reason: ScannerFetchError) => void = () => {};
  const abortPromise = new Promise<never>((_, reject) => { rejectAbort = reject; });
  const onExternalAbort = () => {
    const abortError = new ScannerFetchError("Quá trình quét đã bị hủy.", "SCAN_CANCELLED", initialUrl);
    operationController.abort(abortError);
    rejectAbort(abortError);
  };
  userOptions.signal?.addEventListener("abort", onExternalAbort, { once: true });
  if (userOptions.signal?.aborted) onExternalAbort();

  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      const timeoutError = new ScannerFetchError(
        `Toàn bộ tác vụ quét quá thời gian chờ tối đa (${options.totalTimeoutMs}ms).`,
        "TOTAL_TIMEOUT",
        initialUrl
      );
      operationController.abort(timeoutError);
      reject(timeoutError);
    }, options.totalTimeoutMs);
  });

  const fetchPromise = (async () => {
    let redirectCount = 0;

    while (redirectCount <= options.maxRedirects) {
      if (options.signal?.aborted) {
        const reason = options.signal.reason;
        throw reason instanceof ScannerFetchError ? reason : new ScannerFetchError("Quá trình quét đã bị hủy.", "SCAN_CANCELLED", currentUrl);
      }
      const release = await acquireSafeRequestSlot(options.signal || new AbortController().signal, currentUrl);
      let response: Awaited<ReturnType<typeof performSingleRequest>>;
      try {
        response = await performSingleRequest(currentUrl, options);
      } finally {
        release();
      }

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
        const nextVal = validateTargetUrl(nextUrl, options.allowedHost ? { allowedHost: options.allowedHost } : {});
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

  try {
    return await Promise.race([fetchPromise, abortPromise, timeoutPromise]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
    userOptions.signal?.removeEventListener("abort", onExternalAbort);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { CRAWL_LIMITS, CrawlerServiceError, runMultiUrlScan } from "@/lib/scanner/crawler";
import { enforceScannerDevOnly, ScannerServiceError } from "@/lib/scanner/scanner-service";
import type { CrawlStreamEvent } from "@/types/scanner";

export const maxDuration = 120;

const MAX_REQUEST_BYTES = 16 * 1024;

function errorResponse(error: unknown): NextResponse {
  if (error instanceof ScannerServiceError || error instanceof CrawlerServiceError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
  }
  return NextResponse.json({ error: "Yêu cầu quét không hợp lệ.", code: "INVALID_REQUEST" }, { status: 400 });
}

export async function GET() {
  try {
    enforceScannerDevOnly();
    return NextResponse.json({
      status: "ready",
      phase: "03B.1",
      maxUrls: CRAWL_LIMITS.maxUrls,
      maxDepth: CRAWL_LIMITS.maxDepth,
      maxConcurrency: CRAWL_LIMITS.maxConcurrency,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    enforceScannerDevOnly();

    const originHeader = request.headers.get("origin");
    if (originHeader) {
      let origin: URL | null = null;
      try {
        origin = new URL(originHeader);
      } catch {
        return NextResponse.json({ error: "Nguồn yêu cầu không được phép.", code: "ORIGIN_DISALLOWED" }, { status: 403 });
      }
      const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0].trim();
      const requestHost = (forwardedHost || request.headers.get("host") || "").toLowerCase();
      const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0].trim();
      const requestProtocol = forwardedProtocol ? `${forwardedProtocol.replace(/:$/, "")}:` : new URL(request.url).protocol;
      if (origin.host.toLowerCase() !== requestHost || origin.protocol !== requestProtocol) {
        return NextResponse.json({ error: "Nguồn yêu cầu không được phép.", code: "ORIGIN_DISALLOWED" }, { status: 403 });
      }
    }
    const contentType = request.headers.get("content-type")?.split(";")[0].trim();
    if (contentType !== "application/json") {
      return NextResponse.json({ error: "Yêu cầu phải có định dạng application/json.", code: "UNSUPPORTED_MEDIA_TYPE" }, { status: 415 });
    }

    const reader = request.body?.getReader();
    if (!reader) return NextResponse.json({ error: "Thiếu nội dung JSON.", code: "EMPTY_BODY" }, { status: 400 });
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_REQUEST_BYTES) {
        await reader.cancel();
        return NextResponse.json({ error: "Nội dung vượt quá giới hạn 16KB.", code: "PAYLOAD_TOO_LARGE" }, { status: 413 });
      }
      chunks.push(value);
    }

    let payload: unknown;
    try {
      payload = JSON.parse(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf8"));
    } catch {
      return NextResponse.json({ error: "Nội dung JSON không hợp lệ.", code: "INVALID_JSON" }, { status: 400 });
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return NextResponse.json({ error: "Nội dung JSON phải là một object.", code: "INVALID_BODY" }, { status: 400 });
    }
    const body = payload as { url?: unknown; maxUrls?: unknown };
    if (typeof body.url !== "string" || !body.url.trim()) {
      return NextResponse.json({ error: "Thiếu URL gốc cần quét.", code: "MISSING_URL" }, { status: 400 });
    }
    const maxUrls = body.maxUrls === undefined ? 5 : body.maxUrls;
    if (!Number.isInteger(maxUrls) || (maxUrls as number) < 1 || (maxUrls as number) > CRAWL_LIMITS.maxUrls) {
      return NextResponse.json({ error: `Giới hạn URL phải là số nguyên từ 1 đến ${CRAWL_LIMITS.maxUrls}.`, code: "INVALID_URL_LIMIT" }, { status: 400 });
    }

    const abortController = new AbortController();
    const onRequestAbort = () => abortController.abort(new Error("CLIENT_DISCONNECTED"));
    request.signal.addEventListener("abort", onRequestAbort, { once: true });
    if (request.signal.aborted) onRequestAbort();
    const encoder = new TextEncoder();
    let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        streamController = controller;
        const send = (event: CrawlStreamEvent) => {
          try {
            if (streamController?.desiredSize === null) return;
            streamController?.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
          } catch {
            abortController.abort(new Error("CLIENT_DISCONNECTED"));
          }
        };

        void runMultiUrlScan(body.url as string, {
          maxUrls: maxUrls as number,
          signal: abortController.signal,
          onEvent: send,
        }).then(() => {
          try { streamController?.close(); } catch { /* The client may already have cancelled the stream. */ }
        }).catch((error: unknown) => {
          const code = error instanceof CrawlerServiceError ? error.code : "CRAWL_FAILED";
          const message = error instanceof Error ? error.message : "Lượt quét thất bại.";
          send({ type: "error", error: { code, message } });
          try { streamController?.close(); } catch { /* The client may already have cancelled the stream. */ }
        }).finally(() => request.signal.removeEventListener("abort", onRequestAbort));
      },
      cancel() {
        abortController.abort(new Error("CLIENT_DISCONNECTED"));
        request.signal.removeEventListener("abort", onRequestAbort);
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store, no-transform",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

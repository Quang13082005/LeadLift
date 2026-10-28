import { NextRequest, NextResponse } from "next/server";
import { scanWebsite, enforceScannerDevOnly, ScannerServiceError } from "@/lib/scanner/scanner-service";

export async function GET() {
  try {
    enforceScannerDevOnly();
    return NextResponse.json({
      status: "ready",
      service: "LeadLift Website Scanner Core",
      phase: "03A",
      environment: process.env.NODE_ENV,
    });
  } catch (err) {
    if (err instanceof ScannerServiceError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode });
    }
    return NextResponse.json({ error: "Lỗi nội bộ." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    enforceScannerDevOnly();

    // CSRF Origin verification
    const origin = request.headers.get("origin");
    if (origin && origin !== request.nextUrl.origin) {
      return NextResponse.json({ error: "Nguồn yêu cầu không được phép.", code: "ORIGIN_DISALLOWED" }, { status: 403 });
    }

    // Content-Type validation
    const contentType = request.headers.get("content-type")?.split(";")[0].trim();
    if (contentType !== "application/json") {
      return NextResponse.json({ error: "Yêu cầu phải có định dạng application/json.", code: "UNSUPPORTED_MEDIA_TYPE" }, { status: 415 });
    }

    // Body size limit (max 16KB)
    const reader = request.body?.getReader();
    if (!reader) {
      return NextResponse.json({ error: "Thiếu nội dung JSON.", code: "EMPTY_BODY" }, { status: 400 });
    }

    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 16 * 1024) {
        await reader.cancel();
        return NextResponse.json({ error: "Nội dung vượt quá giới hạn 16KB.", code: "PAYLOAD_TOO_LARGE" }, { status: 413 });
      }
      chunks.push(value);
    }

    let body: { url?: string };
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      return NextResponse.json({ error: "Nội dung JSON không hợp lệ.", code: "INVALID_JSON" }, { status: 400 });
    }

    if (!body.url || typeof body.url !== "string") {
      return NextResponse.json({ error: "Thiếu trường 'url' cần quét.", code: "MISSING_URL_FIELD" }, { status: 400 });
    }

    const result = await scanWebsite(body.url);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    if (err instanceof ScannerServiceError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode });
    }
    const message = err instanceof Error ? err.message : "Đã xảy ra lỗi không xác định.";
    return NextResponse.json({ error: message, code: "INTERNAL_ERROR" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getBusinesses, createBusiness, enforceDevOnly } from "@/lib/services/business-service";
import type { CreateBusinessInput } from "@/types/business";
import { BusinessError, publicBusinessError } from "@/lib/business-error";

export async function GET(request: NextRequest) {
  try {
    enforceDevOnly();

    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get("search") || undefined;
    const area = searchParams.get("area") || undefined;
    const sector = searchParams.get("sector") || undefined;
    const status = searchParams.get("status") || undefined;
    const page = searchParams.has("page") ? Number(searchParams.get("page")) : 1;
    const limit = searchParams.has("limit") ? Number(searchParams.get("limit")) : 10;

    const result = await getBusinesses({ search, area, sector, status, page, limit });
    return NextResponse.json(result);
  } catch (err) {
    const { message, status } = publicBusinessError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    enforceDevOnly();
    const origin = request.headers.get("origin");
    if (origin && origin !== request.nextUrl.origin) throw new BusinessError("Nguồn yêu cầu không được phép.", 403);
    if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") throw new BusinessError("Yêu cầu phải có định dạng JSON.", 415);
    const reader = request.body?.getReader();
    if (!reader) throw new BusinessError("Thiếu nội dung JSON.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 64 * 1024) { await reader.cancel(); throw new BusinessError("Nội dung vượt quá giới hạn 64KB.", 413); }
      chunks.push(value);
    }
    let body: CreateBusinessInput;
    try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch { throw new BusinessError("Nội dung JSON không hợp lệ."); }
    const created = await createBusiness(body);
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    const { message, status } = publicBusinessError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

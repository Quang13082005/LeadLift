import { NextRequest, NextResponse } from "next/server";
import { getBusinesses, createBusiness, enforceDevOnly } from "@/lib/services/business-service";
import type { CreateBusinessInput } from "@/types/business";

export async function GET(request: NextRequest) {
  try {
    enforceDevOnly();

    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get("search") || undefined;
    const area = searchParams.get("area") || undefined;
    const sector = searchParams.get("sector") || undefined;
    const status = searchParams.get("status") || undefined;
    const page = searchParams.get("page") ? parseInt(searchParams.get("page")!, 10) : 1;
    const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!, 10) : 10;

    const result = await getBusinesses({ search, area, sector, status, page, limit });
    return NextResponse.json(result);
  } catch (err) {
    const error = err as Error & { statusCode?: number };
    const status = error.statusCode || 500;
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    enforceDevOnly();

    const body = (await request.json()) as CreateBusinessInput;
    const created = await createBusiness(body);
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    const error = err as Error & { statusCode?: number };
    const status = error.statusCode || 400;
    return NextResponse.json({ error: error.message || "Bad Request" }, { status });
  }
}

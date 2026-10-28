import { prisma } from "@/lib/prisma";
import { normalizeDomain } from "@/lib/domain-normalizer";
import { BusinessError } from "@/lib/business-error";
import { validateImportRows } from "@/lib/csv-parser";
import type { Business, Prisma } from "@/generated/prisma/client";
import {
  createBusinessSchema,
  updateBusinessSchema,
  businessQuerySchema,
  type BusinessItem,
  type BusinessQueryOptions,
  type BusinessQueryResult,
  type CreateBusinessInput,
  type UpdateBusinessInput,
  type ValidatedCsvRow,
} from "@/types/business";

/**
 * Server-side fail-closed guard: Internal business APIs must strictly reject
 * access when running in production until formal Authentication is integrated.
 */
export function enforceDevOnly(): void {
  if (process.env.NODE_ENV !== "development") {
    throw new BusinessError("Truy cập bị từ chối (fail-closed). Chức năng doanh nghiệp chỉ khả dụng trong môi trường development local cho đến khi tích hợp Authentication.", 403);
  }
}

/**
 * Serializes a Prisma Business record into a clean, JSON-safe BusinessItem.
 */
function serializeBusiness(b: Business): BusinessItem {
  return {
    id: b.id,
    name: b.name,
    industry: b.industry,
    category: b.category ?? null,
    address: b.address ?? null,
    city: b.city,
    district: b.district ?? null,
    websiteUrl: b.websiteUrl,
    normalizedDomain: b.normalizedDomain,
    phone: b.phone ?? null,
    email: b.email ?? null,
    dataSource: b.dataSource ?? null,
    collectedAt: b.collectedAt instanceof Date ? b.collectedAt.toISOString() : String(b.collectedAt),
    leadStatus: b.leadStatus,
    opportunityScore: b.opportunityScore ?? null,
    notes: b.notes ?? null,
    createdAt: b.createdAt instanceof Date ? b.createdAt.toISOString() : String(b.createdAt),
    updatedAt: b.updatedAt instanceof Date ? b.updatedAt.toISOString() : String(b.updatedAt),
  };
}

/**
 * Retrieves paginated businesses with search, filters, and dashboard summary stats.
 */
export async function getBusinesses(options: BusinessQueryOptions = {}): Promise<BusinessQueryResult> {
  enforceDevOnly();

  const query = businessQuerySchema.parse(options);
  const { page, limit } = query;
  const skip = (page - 1) * limit;

  const where: Prisma.BusinessWhereInput = {};
  const conditions: Prisma.BusinessWhereInput[] = [];

  if (query.search) {
    const term = query.search;
    conditions.push({ OR: [
      { name: { contains: term, mode: "insensitive" } },
      { normalizedDomain: { contains: term, mode: "insensitive" } },
    ] });
  }

  if (query.area && query.area !== "Tất cả") {
    conditions.push({ OR: [{ city: query.area }, { district: query.area }] });
  }

  if (query.sector && query.sector !== "Tất cả") {
    where.industry = query.sector;
  }

  if (query.status && query.status !== "Tất cả") {
    where.leadStatus = query.status;
  }
  if (conditions.length) where.AND = conditions;

  try {
    const [items, total, totalCount, prioritizeAuditCount, outreachSentCount, inDiscussionCount] = await Promise.all([
      prisma.business.findMany({
        where,
        orderBy: [{ opportunityScore: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }, { id: "asc" }],
        skip,
        take: limit,
      }),
      prisma.business.count({ where }),
      prisma.business.count(),
      prisma.business.count({
        where: {
          OR: [{ opportunityScore: null }, { opportunityScore: { lt: 70 } }],
        },
      }),
      prisma.business.count({ where: { leadStatus: "OUTREACH_SENT" } }),
      prisma.business.count({
        where: {
          leadStatus: { in: ["IN_DISCUSSION", "CONVERTED"] },
        },
      }),
    ]);

    return {
      items: items.map(serializeBusiness),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
      stats: {
        totalCount,
        prioritizeAuditCount,
        outreachSentCount,
        inDiscussionCount,
      },
    };
  } catch {
    throw new BusinessError("Không thể tải danh sách doanh nghiệp. Vui lòng thử lại.", 503);
  }
}

/**
 * Retrieves a single business by ID.
 */
export async function getBusinessById(id: string): Promise<BusinessItem | null> {
  enforceDevOnly();
  updateBusinessSchema.pick({ id: true }).parse({ id });

  const business = await prisma.business.findUnique({
    where: { id },
  });

  return business ? serializeBusiness(business) : null;
}

/**
 * Creates a new business with domain normalization and duplicate prevention.
 */
export async function createBusiness(input: CreateBusinessInput): Promise<BusinessItem> {
  enforceDevOnly();

  const validated = createBusinessSchema.parse(input);
  const normalizedDomain = normalizeDomain(validated.websiteUrl);

  if (!normalizedDomain) {
    throw new Error("Không thể trích xuất tên miền hợp lệ từ địa chỉ website.");
  }

  // Check unique domain constraint
  const existing = await prisma.business.findUnique({
    where: { normalizedDomain },
    select: { id: true, name: true, normalizedDomain: true },
  });

  if (existing) {
    throw new BusinessError(
      `Tên miền '${normalizedDomain}' đã tồn tại trong hệ thống (Doanh nghiệp: "${existing.name}"). Hệ thống từ chối tạo trùng lặp.`
      , 409
    );
  }

  const websiteUrl =
    validated.websiteUrl.startsWith("http://") || validated.websiteUrl.startsWith("https://")
      ? validated.websiteUrl
      : `https://${validated.websiteUrl}`;

  const created = await prisma.business.create({
    data: {
      name: validated.name,
      websiteUrl,
      normalizedDomain,
      industry: validated.industry,
      category: validated.category,
      city: validated.city || "Đà Nẵng",
      district: validated.district,
      address: validated.address,
      phone: validated.phone,
      email: validated.email || null,
      dataSource: validated.dataSource || "Thủ công",
      notes: validated.notes,
    },
  });

  return serializeBusiness(created);
}

/**
 * Updates an existing business with duplicate domain protection.
 */
export async function updateBusiness(input: UpdateBusinessInput): Promise<BusinessItem> {
  enforceDevOnly();

  const validated = updateBusinessSchema.parse(input);
  const existing = await prisma.business.findUnique({
    where: { id: validated.id },
  });

  if (!existing) {
    throw new BusinessError("Không tìm thấy doanh nghiệp cần cập nhật.", 404);
  }

  let normalizedDomain = existing.normalizedDomain;
  let websiteUrl = existing.websiteUrl;

  if (validated.websiteUrl && validated.websiteUrl !== existing.websiteUrl) {
    normalizedDomain = normalizeDomain(validated.websiteUrl);
    if (!normalizedDomain) {
      throw new Error("Địa chỉ website mới không hợp lệ.");
    }

    if (normalizedDomain !== existing.normalizedDomain) {
      const duplicate = await prisma.business.findUnique({
        where: { normalizedDomain },
      });
      if (duplicate && duplicate.id !== existing.id) {
        throw new BusinessError(
          `Tên miền '${normalizedDomain}' đã được sử dụng bởi doanh nghiệp "${duplicate.name}".`
          , 409
        );
      }
    }

    websiteUrl =
      validated.websiteUrl.startsWith("http://") || validated.websiteUrl.startsWith("https://")
        ? validated.websiteUrl
        : `https://${validated.websiteUrl}`;
  }

  const updated = await prisma.business.update({
    where: { id: validated.id },
    data: {
      name: validated.name ?? existing.name,
      websiteUrl,
      normalizedDomain,
      industry: validated.industry ?? existing.industry,
      category: validated.category !== undefined ? validated.category : existing.category,
      city: validated.city ?? existing.city,
      district: validated.district !== undefined ? validated.district : existing.district,
      address: validated.address !== undefined ? validated.address : existing.address,
      phone: validated.phone !== undefined ? validated.phone : existing.phone,
      email: validated.email !== undefined ? validated.email : existing.email,
      dataSource: validated.dataSource ?? existing.dataSource,
      leadStatus: validated.leadStatus ?? existing.leadStatus,
      opportunityScore:
        validated.opportunityScore !== undefined ? validated.opportunityScore : existing.opportunityScore,
      notes: validated.notes !== undefined ? validated.notes : existing.notes,
    },
  });

  return serializeBusiness(updated);
}

/**
 * Checks an array of domains against database to detect existing duplicates.
 */
export async function checkDuplicateDomains(
  domains: string[]
): Promise<Array<{ domain: string; businessName: string }>> {
  enforceDevOnly();

  if (!Array.isArray(domains) || domains.length > 200 || domains.some((domain) => typeof domain !== "string" || !normalizeDomain(domain))) throw new BusinessError("Danh sách tên miền không hợp lệ.");
  if (!domains.length) return [];

  const matches = await prisma.business.findMany({
    where: {
      normalizedDomain: { in: domains },
    },
    select: {
      normalizedDomain: true,
      name: true,
    },
  });

  return matches.map((m) => ({
    domain: m.normalizedDomain,
    businessName: m.name,
  }));
}

/**
 * Imports a batch of pre-validated CSV rows without overwriting existing records.
 */
export async function importBusinessesBatch(rows: ValidatedCsvRow[]): Promise<{
  importedCount: number;
  skippedCount: number;
  skippedDetails: Array<{ rowNumber: number; domain: string; reason: string }>;
}> {
  enforceDevOnly();
  rows = validateImportRows(rows);

  if (!rows.length) {
    return { importedCount: 0, skippedCount: 0, skippedDetails: [] };
  }

  // Find all domains that already exist in DB
  const domains = rows.map((r) => r.normalizedDomain);
  const existingMatches = await checkDuplicateDomains(domains);
  const existingDomainMap = new Map(existingMatches.map((m) => [m.domain, m.businessName]));

  const rowsToInsert: ValidatedCsvRow[] = [];
  const skippedDetails: Array<{ rowNumber: number; domain: string; reason: string }> = [];

  for (const row of rows) {
    if (existingDomainMap.has(row.normalizedDomain)) {
      const existingName = existingDomainMap.get(row.normalizedDomain);
      skippedDetails.push({
        rowNumber: row.rowNumber,
        domain: row.normalizedDomain,
        reason: `Đã tồn tại trong hệ thống (Doanh nghiệp: "${existingName}")`,
      });
    } else {
      rowsToInsert.push(row);
      // Mark as existing so subsequent duplicate rows in the batch are caught
      existingDomainMap.set(row.normalizedDomain, row.name);
    }
  }

  // One atomic SQL insert: unique constraint arbitrates concurrent duplicates.
  const created = rowsToInsert.length ? await prisma.business.createManyAndReturn({
    skipDuplicates: true,
    select: { normalizedDomain: true },
    data: rowsToInsert.map((row) => ({
        name: row.name,
        websiteUrl: row.websiteUrl,
        normalizedDomain: row.normalizedDomain,
        industry: row.industry,
        city: row.city,
        district: row.district,
        address: row.address,
        phone: row.phone,
        email: row.email,
        dataSource: "CSV_IMPORT",
        notes: row.notes,
    })),
  }) : [];
  const insertedDomains = new Set(created.map((record) => record.normalizedDomain));
  for (const row of rowsToInsert) if (!insertedDomains.has(row.normalizedDomain)) skippedDetails.push({ rowNumber: row.rowNumber, domain: row.normalizedDomain, reason: "Tên miền đã được thêm bởi yêu cầu khác; không ghi đè." });

  return {
    importedCount: created.length,
    skippedCount: skippedDetails.length,
    skippedDetails,
  };
}

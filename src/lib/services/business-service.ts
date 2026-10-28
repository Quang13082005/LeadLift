import { prisma } from "@/lib/prisma";
import { normalizeDomain } from "@/lib/domain-normalizer";
import {
  createBusinessSchema,
  updateBusinessSchema,
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
  // Allow during build compilation
  if (process.env.npm_lifecycle_event === "build" || process.env.NEXT_PHASE === "phase-production-build") {
    return;
  }

  if (process.env.NODE_ENV === "production") {
    const error = new Error(
      "TRUY CẬP BỊ TỪ CHỐI: Các API nghiệp vụ nội bộ chưa có Authentication hoàn chỉnh chỉ được phép hoạt động trong môi trường phát triển (NODE_ENV !== 'production'). Cơ chế bảo mật fail-closed đã chặn yêu cầu này."
    );
    (error as unknown as { statusCode: number }).statusCode = 403;
    throw error;
  }
}

/**
 * Serializes a Prisma Business record into a clean, JSON-safe BusinessItem.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeBusiness(b: any): BusinessItem {
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

  const page = Math.max(1, options.page || 1);
  const limit = Math.min(50, Math.max(1, options.limit || 10));
  const skip = (page - 1) * limit;

  // Build Prisma where filter
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};

  if (options.search && options.search.trim().length > 0) {
    const term = options.search.trim();
    where.OR = [
      { name: { contains: term, mode: "insensitive" } },
      { normalizedDomain: { contains: term, mode: "insensitive" } },
    ];
  }

  if (options.area && options.area !== "Tất cả") {
    where.OR = where.OR
      ? [{ AND: [where, { OR: [{ city: options.area }, { district: options.area }] }] }]
      : [{ city: options.area }, { district: options.area }];
  }

  if (options.sector && options.sector !== "Tất cả") {
    where.industry = options.sector;
  }

  if (options.status && options.status !== "Tất cả") {
    where.leadStatus = options.status;
  }

  try {
    const [items, total, totalCount, prioritizeAuditCount, outreachSentCount, inDiscussionCount] = await Promise.all([
      prisma.business.findMany({
        where,
        orderBy: [{ opportunityScore: "desc" }, { createdAt: "desc" }],
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
          leadStatus: { in: ["IN_DISCUSSION", "CONVERTED", "QUALIFIED"] },
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
  } catch (err) {
    // If database is temporarily empty or unreachable, return empty fallback
    console.error("Error querying businesses:", err);
    return {
      items: [],
      total: 0,
      page: 1,
      limit,
      totalPages: 1,
      stats: {
        totalCount: 0,
        prioritizeAuditCount: 0,
        outreachSentCount: 0,
        inDiscussionCount: 0,
      },
    };
  }
}

/**
 * Retrieves a single business by ID.
 */
export async function getBusinessById(id: string): Promise<BusinessItem | null> {
  enforceDevOnly();

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
    throw new Error(
      `Tên miền '${normalizedDomain}' đã tồn tại trong hệ thống (Doanh nghiệp: "${existing.name}"). Hệ thống từ chối tạo trùng lặp.`
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
    throw new Error(`Không tìm thấy doanh nghiệp có ID '${validated.id}'`);
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
        throw new Error(
          `Tên miền '${normalizedDomain}' đã được sử dụng bởi doanh nghiệp "${duplicate.name}".`
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

  let importedCount = 0;
  for (const row of rowsToInsert) {
    await prisma.business.create({
      data: {
        name: row.name,
        websiteUrl: row.websiteUrl,
        normalizedDomain: row.normalizedDomain,
        industry: row.industry,
        city: row.city,
        district: row.district,
        phone: row.phone,
        email: row.email,
        dataSource: "CSV_IMPORT",
        notes: row.notes,
      },
    });
    importedCount++;
  }

  return {
    importedCount,
    skippedCount: skippedDetails.length,
    skippedDetails,
  };
}

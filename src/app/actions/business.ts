"use server";

import { revalidatePath } from "next/cache";
import {
  getBusinesses,
  getBusinessById,
  createBusiness,
  updateBusiness,
  checkDuplicateDomains,
  importBusinessesBatch,
} from "@/lib/services/business-service";
import { parseAndValidateCsv } from "@/lib/csv-parser";
import type {
  BusinessQueryOptions,
  BusinessQueryResult,
  CreateBusinessInput,
  UpdateBusinessInput,
  CsvValidationResult,
  ValidatedCsvRow,
} from "@/types/business";

export async function fetchBusinessesAction(
  options: BusinessQueryOptions = {}
): Promise<BusinessQueryResult> {
  return await getBusinesses(options);
}

export async function fetchBusinessByIdAction(id: string) {
  return await getBusinessById(id);
}

export async function createBusinessAction(
  input: CreateBusinessInput
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  try {
    const created = await createBusiness(input);
    revalidatePath("/businesses");
    return { success: true, data: created };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Không thể tạo hồ sơ doanh nghiệp.";
    return { success: false, error: message };
  }
}

export async function updateBusinessAction(
  input: UpdateBusinessInput
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  try {
    const updated = await updateBusiness(input);
    revalidatePath("/businesses");
    return { success: true, data: updated };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Không thể cập nhật hồ sơ doanh nghiệp.";
    return { success: false, error: message };
  }
}

export async function validateCsvAction(
  csvContent: string
): Promise<{ success: boolean; result?: CsvValidationResult; error?: string }> {
  try {
    const initialResult = parseAndValidateCsv(csvContent);

    if (initialResult.errors.length > 0 && initialResult.validRows.length === 0) {
      return { success: true, result: initialResult };
    }

    // Cross-check valid rows against database to flag any domains that already exist on Neon
    const domains = initialResult.validRows.map((r) => r.normalizedDomain);
    const dbDuplicates = await checkDuplicateDomains(domains);
    const dbDuplicateMap = new Map(dbDuplicates.map((d) => [d.domain, d.businessName]));

    const finalValidRows: ValidatedCsvRow[] = [];
    const combinedErrors = [...initialResult.errors];

    for (const row of initialResult.validRows) {
      if (dbDuplicateMap.has(row.normalizedDomain)) {
        const existingName = dbDuplicateMap.get(row.normalizedDomain);
        combinedErrors.push({
          rowNumber: row.rowNumber,
          field: "normalizedDomain",
          message: `Tên miền '${row.normalizedDomain}' đã tồn tại trong hệ thống (Doanh nghiệp: "${existingName}").`,
          rawValue: row.websiteUrl,
        });
      } else {
        finalValidRows.push(row);
      }
    }

    return {
      success: true,
      result: {
        totalRows: initialResult.totalRows,
        validCount: finalValidRows.length,
        invalidCount: combinedErrors.length,
        validRows: finalValidRows,
        errors: combinedErrors.sort((a, b) => a.rowNumber - b.rowNumber),
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Lỗi xử lý tệp CSV.";
    return { success: false, error: message };
  }
}

export async function importCsvAction(
  rows: ValidatedCsvRow[]
): Promise<{
  success: boolean;
  importedCount?: number;
  skippedCount?: number;
  skippedDetails?: Array<{ rowNumber: number; domain: string; reason: string }>;
  error?: string;
}> {
  try {
    const result = await importBusinessesBatch(rows);
    revalidatePath("/businesses");
    return {
      success: true,
      importedCount: result.importedCount,
      skippedCount: result.skippedCount,
      skippedDetails: result.skippedDetails,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Lỗi khi nhập danh sách doanh nghiệp vào cơ sở dữ liệu.";
    return { success: false, error: message };
  }
}

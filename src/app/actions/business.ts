"use server";

import { revalidatePath } from "next/cache";
import {
  getBusinesses,
  getBusinessById,
  createBusiness,
  updateBusiness,
  checkDuplicateDomains,
  importBusinessesBatch,
  enforceDevOnly,
} from "@/lib/services/business-service";
import { publicBusinessError } from "@/lib/business-error";
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
  enforceDevOnly();
  return await getBusinesses(options);
}

export async function fetchBusinessByIdAction(id: string) {
  enforceDevOnly();
  return await getBusinessById(id);
}

export async function createBusinessAction(
  input: CreateBusinessInput
): Promise<{ success: boolean; data?: unknown; error?: string; code?: number }> {
  try {
    enforceDevOnly();
    const created = await createBusiness(input);
    revalidatePath("/businesses");
    return { success: true, data: created };
  } catch (err) {
    const { message, status } = publicBusinessError(err);
    return { success: false, error: message, code: status };
  }
}

export async function updateBusinessAction(
  input: UpdateBusinessInput
): Promise<{ success: boolean; data?: unknown; error?: string; code?: number }> {
  try {
    enforceDevOnly();
    const updated = await updateBusiness(input);
    revalidatePath("/businesses");
    return { success: true, data: updated };
  } catch (err) {
    const { message, status } = publicBusinessError(err);
    return { success: false, error: message, code: status };
  }
}

export async function validateCsvAction(
  csvContent: string
): Promise<{ success: boolean; result?: CsvValidationResult; error?: string; code?: number }> {
  try {
    enforceDevOnly();
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
        invalidCount: new Set(combinedErrors.map((error) => error.rowNumber)).size,
        validRows: finalValidRows,
        errors: combinedErrors.sort((a, b) => a.rowNumber - b.rowNumber),
      },
    };
  } catch (err) {
    const { message, status } = publicBusinessError(err);
    return { success: false, error: message, code: status };
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
  code?: number;
}> {
  try {
    enforceDevOnly();
    const result = await importBusinessesBatch(rows);
    revalidatePath("/businesses");
    return {
      success: true,
      importedCount: result.importedCount,
      skippedCount: result.skippedCount,
      skippedDetails: result.skippedDetails,
    };
  } catch (err) {
    const { message, status } = publicBusinessError(err);
    return { success: false, error: message, code: status };
  }
}

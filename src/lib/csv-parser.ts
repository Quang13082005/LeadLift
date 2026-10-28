import { normalizeDomain } from "@/lib/domain-normalizer";
import type { CsvRowError, CsvValidationResult, ValidatedCsvRow } from "@/types/business";

export const MAX_CSV_SIZE_BYTES = 2 * 1024 * 1024; // 2MB
export const MAX_CSV_ROWS = 200;

/**
 * Standard RFC 4180 CSV line parser supporting quoted fields with commas and escaped quotes.
 */
export function parseCsvLine(line: string, delimiter = ","): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

/**
 * Normalizes header string to standard column identifier.
 */
function mapHeaderToKey(header: string): string | null {
  const h = header.toLowerCase().replace(/[\s_\-\/]+/g, "");
  if (h.includes("têndoanhnghiệp") || h.includes("têncty") || h.includes("tên") || h.includes("businessname") || h.includes("company") || h.includes("name")) {
    return "name";
  }
  if (h.includes("website") || h.includes("url") || h.includes("trangweb") || h.includes("domain") || h.includes("web")) {
    return "websiteUrl";
  }
  if (h.includes("ngànhnghề") || h.includes("ngành") || h.includes("lĩnhvực") || h.includes("industry") || h.includes("category")) {
    return "industry";
  }
  if (h.includes("khuvực") || h.includes("thànhphố") || h.includes("tỉnhthành") || h.includes("city") || h.includes("location") || h.includes("địachỉ") || h.includes("address")) {
    return "city";
  }
  if (h.includes("quận") || h.includes("huyện") || h.includes("district")) {
    return "district";
  }
  if (h.includes("sốđiệnthoại") || h.includes("điệnthoại") || h.includes("sđt") || h.includes("phone") || h.includes("hotline") || h.includes("tel")) {
    return "phone";
  }
  if (h.includes("email") || h.includes("thưđiệntử") || h.includes("mail")) {
    return "email";
  }
  if (h.includes("ghichú") || h.includes("notes") || h.includes("note") || h.includes("môtả")) {
    return "notes";
  }
  return null;
}

/**
 * Parses and validates raw CSV content against business rules.
 */
export function parseAndValidateCsv(csvContent: string): CsvValidationResult {
  if (!csvContent || typeof csvContent !== "string") {
    return {
      totalRows: 0,
      validCount: 0,
      invalidCount: 1,
      validRows: [],
      errors: [{ rowNumber: 0, field: "file", message: "Nội dung tệp CSV rỗng hoặc không hợp lệ" }],
    };
  }

  // Check file size (rough byte estimation from string length)
  const byteSize = new TextEncoder().encode(csvContent).length;
  if (byteSize > MAX_CSV_SIZE_BYTES) {
    return {
      totalRows: 0,
      validCount: 0,
      invalidCount: 1,
      validRows: [],
      errors: [
        {
          rowNumber: 0,
          field: "file",
          message: `Kích thước tệp (${(byteSize / 1024 / 1024).toFixed(1)}MB) vượt quá giới hạn tối đa cho phép là 2MB.`,
        },
      ],
    };
  }

  // Strip BOM if present
  let cleanContent = csvContent;
  if (cleanContent.charCodeAt(0) === 0xfeff) {
    cleanContent = cleanContent.slice(1);
  }

  // Split lines while respecting CR, LF, and CRLF
  const rawLines = cleanContent
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (rawLines.length === 0) {
    return {
      totalRows: 0,
      validCount: 0,
      invalidCount: 1,
      validRows: [],
      errors: [{ rowNumber: 0, field: "file", message: "Tệp CSV không chứa bất kỳ dòng dữ liệu nào." }],
    };
  }

  // Parse header line
  const headerCells = parseCsvLine(rawLines[0]);
  const columnMap: Record<number, string> = {};

  headerCells.forEach((header, index) => {
    const key = mapHeaderToKey(header);
    if (key) {
      columnMap[index] = key;
    }
  });

  const hasName = Object.values(columnMap).includes("name");
  const hasWebsite = Object.values(columnMap).includes("websiteUrl");

  if (!hasName || !hasWebsite) {
    return {
      totalRows: rawLines.length - 1,
      validCount: 0,
      invalidCount: 1,
      validRows: [],
      errors: [
        {
          rowNumber: 1,
          field: "header",
          message: "Tiêu đề cột CSV phải chứa tối thiểu hai cột bắt buộc: 'Tên doanh nghiệp' và 'Website/URL'.",
        },
      ],
    };
  }

  const dataLines = rawLines.slice(1);

  if (dataLines.length > MAX_CSV_ROWS) {
    return {
      totalRows: dataLines.length,
      validCount: 0,
      invalidCount: dataLines.length,
      validRows: [],
      errors: [
        {
          rowNumber: 0,
          field: "file",
          message: `Số lượng dòng dữ liệu (${dataLines.length}) vượt quá giới hạn tối đa ${MAX_CSV_ROWS} dòng trong một lần nhập.`,
        },
      ],
    };
  }

  const validRows: ValidatedCsvRow[] = [];
  const errors: CsvRowError[] = [];
  const seenDomainsInFile = new Map<string, number>(); // domain -> rowNumber

  dataLines.forEach((line, index) => {
    const rowNumber = index + 2; // Line 1 is header, data starts at line 2
    const cells = parseCsvLine(line);

    // Skip empty lines that only contain commas
    if (cells.every((c) => c === "")) {
      return;
    }

    const rowData: Record<string, string> = {};
    cells.forEach((val, colIdx) => {
      const key = columnMap[colIdx];
      if (key) {
        rowData[key] = val;
      }
    });

    const name = rowData.name?.trim() || "";
    const websiteUrl = rowData.websiteUrl?.trim() || "";
    const industry = rowData.industry?.trim() || "Dịch vụ địa phương";
    const city = rowData.city?.trim() || "Đà Nẵng";
    const district = rowData.district?.trim() || undefined;
    const phone = rowData.phone?.trim() || undefined;
    const email = rowData.email?.trim() || undefined;
    const notes = rowData.notes?.trim() || undefined;

    let hasRowError = false;

    // Validate Name
    if (!name || name.length < 2) {
      errors.push({
        rowNumber,
        field: "name",
        message: "Tên doanh nghiệp không được để trống và phải có ít nhất 2 ký tự.",
        rawValue: name,
      });
      hasRowError = true;
    }

    // Validate Website URL & Normalized Domain
    const normalizedDomain = normalizeDomain(websiteUrl);
    if (!websiteUrl || !normalizedDomain) {
      errors.push({
        rowNumber,
        field: "websiteUrl",
        message: "Địa chỉ website không hợp lệ hoặc không trích xuất được tên miền chuẩn.",
        rawValue: websiteUrl,
      });
      hasRowError = true;
    } else {
      // Check duplicate domain inside the CSV file
      if (seenDomainsInFile.has(normalizedDomain)) {
        const previousRow = seenDomainsInFile.get(normalizedDomain);
        errors.push({
          rowNumber,
          field: "normalizedDomain",
          message: `Tên miền '${normalizedDomain}' bị trùng lặp với dòng ${previousRow} trong tệp CSV này.`,
          rawValue: websiteUrl,
        });
        hasRowError = true;
      } else {
        seenDomainsInFile.set(normalizedDomain, rowNumber);
      }
    }

    // Validate Email format if present
    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        errors.push({
          rowNumber,
          field: "email",
          message: `Định dạng email '${email}' không hợp lệ.`,
          rawValue: email,
        });
        hasRowError = true;
      }
    }

    if (!hasRowError) {
      validRows.push({
        rowNumber,
        name,
        websiteUrl: websiteUrl.startsWith("http://") || websiteUrl.startsWith("https://") ? websiteUrl : `https://${websiteUrl}`,
        normalizedDomain,
        industry,
        city,
        district,
        phone,
        email,
        dataSource: "CSV_IMPORT",
        notes,
      });
    }
  });

  return {
    totalRows: dataLines.length,
    validCount: validRows.length,
    invalidCount: errors.length,
    validRows,
    errors,
  };
}

import { z } from "zod";
import { normalizeDomain } from "@/lib/domain-normalizer";
import { BusinessError } from "@/lib/business-error";
import { createBusinessSchema, type CsvRowError, type CsvValidationResult, type ValidatedCsvRow } from "@/types/business";

export const MAX_CSV_SIZE_BYTES = 2 * 1024 * 1024;
export const MAX_CSV_ROWS = 200;

type CsvRecord = { cells: string[]; line: number };

/** RFC 4180 records, including quoted newlines; reject malformed quoting. */
function parseRecords(content: string, delimiter = ","): CsvRecord[] {
  const records: CsvRecord[] = [];
  let cells: string[] = [];
  let field = "";
  let state: "start" | "plain" | "quoted" | "closed" = "start";
  let line = 1;
  let recordLine = 1;
  const endField = () => { cells.push(field.trim()); field = ""; state = "start"; };
  const endRecord = () => {
    endField();
    if (cells.some(Boolean)) records.push({ cells, line: recordLine });
    cells = [];
    if (records.length > MAX_CSV_ROWS + 1) throw new Error(`Số dòng vượt quá giới hạn tối đa ${MAX_CSV_ROWS} dòng.`);
  };
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    if (state === "quoted") {
      if (char === '"') {
        if (content[i + 1] === '"') { field += '"'; i++; }
        else state = "closed";
      } else if (char === "\r" || char === "\n") {
        if (char === "\r" && content[i + 1] === "\n") i++;
        field += "\n";
        line++;
      } else field += char;
    } else if (char === delimiter) endField();
    else if (char === "\r" || char === "\n") {
      endRecord();
      if (char === "\r" && content[i + 1] === "\n") i++;
      line++;
      recordLine = line;
    } else if (char === '"' && state === "start") state = "quoted";
    else if (char === '"' || (state === "closed" && char.trim())) throw new Error(`Dấu ngoặc kép không hợp lệ tại dòng ${line}.`);
    else if (state !== "closed") { field += char; state = "plain"; }
  }
  if (state === "quoted") throw new Error(`Thiếu dấu ngoặc kép đóng tại dòng ${recordLine}.`);
  if (field || cells.length || state !== "start") endRecord();
  return records;
}

export function parseCsvLine(line: string, delimiter = ","): string[] {
  return parseRecords(line, delimiter)[0]?.cells ?? [];
}

function mapHeaderToKey(header: string): string | null {
  const key = header.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/g, "d").replace(/[\s_\-/]+/g, "");
  const aliases: Record<string, string[]> = {
    name: ["name", "businessname", "company", "companyname", "ten", "tendoanhnghiep", "tencty"],
    websiteUrl: ["website", "websiteurl", "url", "trangweb", "domain", "domainname", "web"],
    industry: ["industry", "category", "nganhnghe", "nganh", "linhvuc"],
    city: ["city", "location", "khuvuc", "thanhpho", "tinhthanh"],
    address: ["address", "diachi"],
    district: ["district", "quan", "huyen"],
    phone: ["phone", "hotline", "tel", "sodienthoai", "dienthoai", "sdt"],
    email: ["email", "mail", "thudientu"],
    notes: ["notes", "note", "ghichu", "mota"],
  };
  return Object.keys(aliases).find((field) => aliases[field].includes(key)) ?? null;
}

const importRowSchema = createBusinessSchema.extend({ rowNumber: z.number().int().min(2).max(1000000) });

/** Preview data is untrusted on confirmation: revalidate and derive domain again. */
export function validateImportRows(input: unknown): ValidatedCsvRow[] {
  if (!Array.isArray(input) || input.length > MAX_CSV_ROWS) throw new BusinessError(`Chỉ được nhập tối đa ${MAX_CSV_ROWS} dòng.`);
  let serialized: string;
  try { serialized = JSON.stringify(input); } catch { throw new BusinessError("Dữ liệu nhập không hợp lệ."); }
  if (new TextEncoder().encode(serialized).length > MAX_CSV_SIZE_BYTES) throw new BusinessError("Dữ liệu nhập vượt quá giới hạn 2MB.", 413);
  return z.array(importRowSchema).parse(input).map((row) => ({ ...row, normalizedDomain: normalizeDomain(row.websiteUrl), dataSource: "CSV_IMPORT" }));
}

export function parseAndValidateCsv(csvContent: string): CsvValidationResult {
  const failure = (message: string, field = "file", rowNumber = 0): CsvValidationResult => ({ totalRows: 0, validCount: 0, invalidCount: 1, validRows: [], errors: [{ rowNumber, field, message }] });
  if (typeof csvContent !== "string" || !csvContent.trim()) return failure("Nội dung tệp CSV rỗng hoặc không hợp lệ.");
  if (new TextEncoder().encode(csvContent).length > MAX_CSV_SIZE_BYTES) return failure("Kích thước tệp vượt quá giới hạn tối đa 2MB.");
  let records: CsvRecord[];
  try { records = parseRecords(csvContent.replace(/^\uFEFF/, "")); }
  catch (error) { return failure(error instanceof Error ? error.message : "Tệp CSV không hợp lệ."); }
  if (!records.length) return failure("Tệp CSV không chứa dữ liệu.");
  const keys = records[0].cells.map(mapHeaderToKey);
  if (!keys.includes("name") || !keys.includes("websiteUrl")) return failure("Tiêu đề cột CSV phải chứa Tên doanh nghiệp và Website/URL.", "header", 1);
  const knownKeys = keys.filter((key) => key !== null);
  if (new Set(knownKeys).size !== knownKeys.length) return failure("Tiêu đề cột CSV bị trùng. Mỗi trường chỉ được khai báo một lần.", "header", 1);
  const data = records.slice(1);
  const validRows: ValidatedCsvRow[] = [];
  const errors: CsvRowError[] = [];
  const seen = new Map<string, number>();
  for (const { cells, line } of data) {
    if (cells.length !== keys.length) { errors.push({ rowNumber: line, field: "row", message: "Số cột không khớp với tiêu đề." }); continue; }
    const raw: Record<string, string | number> = { rowNumber: line, industry: "Dịch vụ địa phương", city: "Đà Nẵng", dataSource: "CSV_IMPORT" };
    keys.forEach((key, index) => { if (key && cells[index]) raw[key] = cells[index]; });
    const parsed = importRowSchema.safeParse(raw);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) errors.push({ rowNumber: line, field: issue.path.join("."), message: issue.message });
      continue;
    }
    const normalizedDomain = normalizeDomain(parsed.data.websiteUrl);
    const previous = seen.get(normalizedDomain);
    if (previous) { errors.push({ rowNumber: line, field: "normalizedDomain", message: `Tên miền '${normalizedDomain}' bị trùng lặp với dòng ${previous} trong tệp CSV.` }); continue; }
    seen.set(normalizedDomain, line);
    validRows.push({ ...parsed.data, normalizedDomain, dataSource: "CSV_IMPORT" });
  }
  return { totalRows: data.length, validCount: validRows.length, invalidCount: new Set(errors.map((error) => error.rowNumber)).size, validRows, errors };
}

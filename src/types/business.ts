import { z } from "zod";

export const LeadStatusEnum = z.enum([
  "NEW_DISCOVERED",
  "AUDITED",
  "QUALIFIED",
  "CONTACT_READY",
  "OUTREACH_SENT",
  "IN_DISCUSSION",
  "CONVERTED",
  "UNQUALIFIED",
  "DO_NOT_CONTACT",
]);

export type LeadStatus = z.infer<typeof LeadStatusEnum>;

export const LEAD_STATUS_LABELS: Record<LeadStatus, { label: string; tone: "neutral" | "green" | "amber" | "red" | "blue" }> = {
  NEW_DISCOVERED: { label: "Mới phát hiện", tone: "blue" },
  AUDITED: { label: "Đã phân tích", tone: "amber" },
  QUALIFIED: { label: "Tiềm năng", tone: "green" },
  CONTACT_READY: { label: "Sẵn sàng liên hệ", tone: "green" },
  OUTREACH_SENT: { label: "Đã tiếp cận", tone: "blue" },
  IN_DISCUSSION: { label: "Đang trao đổi", tone: "green" },
  CONVERTED: { label: "Đã hợp tác", tone: "green" },
  UNQUALIFIED: { label: "Không phù hợp", tone: "neutral" },
  DO_NOT_CONTACT: { label: "Không liên hệ", tone: "red" },
};

export const createBusinessSchema = z.object({
  name: z.string().trim().min(2, "Tên doanh nghiệp phải có ít nhất 2 ký tự"),
  websiteUrl: z.string().trim().min(3, "Địa chỉ website không được để trống"),
  industry: z.string().trim().min(2, "Vui lòng chọn hoặc nhập ngành nghề"),
  category: z.string().trim().optional(),
  city: z.string().trim().default("Đà Nẵng"),
  district: z.string().trim().optional(),
  address: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  email: z.string().trim().email("Định dạng email không hợp lệ").optional().or(z.literal("")),
  dataSource: z.string().trim().default("Thủ công"),
  notes: z.string().trim().optional(),
});

export type CreateBusinessInput = z.infer<typeof createBusinessSchema>;

export const updateBusinessSchema = createBusinessSchema.partial().extend({
  id: z.string(),
  leadStatus: LeadStatusEnum.optional(),
  opportunityScore: z.number().int().min(0).max(100).nullable().optional(),
});

export type UpdateBusinessInput = z.infer<typeof updateBusinessSchema>;

export interface BusinessItem {
  id: string;
  name: string;
  industry: string;
  category: string | null;
  address: string | null;
  city: string;
  district: string | null;
  websiteUrl: string;
  normalizedDomain: string;
  phone: string | null;
  email: string | null;
  dataSource: string | null;
  collectedAt: string;
  leadStatus: LeadStatus;
  opportunityScore: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BusinessQueryOptions {
  search?: string;
  area?: string;
  sector?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export interface BusinessQueryResult {
  items: BusinessItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  stats: {
    totalCount: number;
    prioritizeAuditCount: number;
    outreachSentCount: number;
    inDiscussionCount: number;
  };
}

export interface CsvRowError {
  rowNumber: number;
  field: string;
  message: string;
  rawValue?: string;
}

export interface ValidatedCsvRow {
  rowNumber: number;
  name: string;
  websiteUrl: string;
  normalizedDomain: string;
  industry: string;
  city: string;
  district?: string;
  phone?: string;
  email?: string;
  dataSource: string;
  notes?: string;
}

export interface CsvValidationResult {
  totalRows: number;
  validCount: number;
  invalidCount: number;
  validRows: ValidatedCsvRow[];
  errors: CsvRowError[];
}

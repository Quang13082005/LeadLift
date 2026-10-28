import { z } from "zod";
import { parseBusinessWebsite } from "@/lib/domain-normalizer";

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
  name: z.string().trim().min(2, "Tên doanh nghiệp phải có ít nhất 2 ký tự").max(200),
  websiteUrl: z.string().trim().max(2048).refine((value) => !!parseBusinessWebsite(value), "Địa chỉ website HTTP/HTTPS hoặc tên miền không hợp lệ").transform((value) => parseBusinessWebsite(value)!.url),
  industry: z.string().trim().min(2, "Vui lòng chọn hoặc nhập ngành nghề").max(100),
  category: z.string().trim().max(200).optional(),
  city: z.string().trim().min(1).max(100).default("Đà Nẵng"),
  district: z.string().trim().max(100).optional(),
  address: z.string().trim().max(500).optional(),
  phone: z.string().trim().max(50).optional(),
  email: z.string().trim().max(254).email("Định dạng email không hợp lệ").optional().or(z.literal("")),
  dataSource: z.string().trim().min(1).max(200).default("Thủ công"),
  notes: z.string().trim().max(5000).optional(),
});

export type CreateBusinessInput = z.infer<typeof createBusinessSchema>;

export const updateBusinessSchema = createBusinessSchema.omit({ city: true, dataSource: true }).partial().extend({
  id: z.string().min(1).max(100),
  city: z.string().trim().min(1).max(100).optional(),
  dataSource: z.string().trim().min(1).max(200).optional(),
  leadStatus: LeadStatusEnum.optional(),
  opportunityScore: z.number().int().min(0).max(100).nullable().optional(),
});

export type UpdateBusinessInput = z.infer<typeof updateBusinessSchema>;

export const businessQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  area: z.string().trim().max(100).optional(),
  sector: z.string().trim().max(100).optional(),
  status: LeadStatusEnum.or(z.literal("Tất cả")).optional(),
  page: z.number().int().min(1).max(1000000).default(1),
  limit: z.number().int().min(1).max(50).default(10),
});

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
  error?: string;
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
  address?: string;
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

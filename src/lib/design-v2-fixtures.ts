import type { BusinessItem } from "@/types/business";
import type { PipelineOpportunity } from "@/components/business/pipeline-view";

export const previewBusinesses: BusinessItem[] = [
  {
    id: "demo-moc", name: "Công ty Du lịch Mộc", industry: "Du lịch & Tour", category: "Tour địa phương",
    address: "56 Nguyễn Thái Học", city: "Đà Nẵng", district: "Hải Châu", websiteUrl: "https://moc-tour.example",
    normalizedDomain: "moc-tour.example", phone: "0236 555 0188", email: "hello@moc-tour.example", dataSource: "DEMO · Fixture",
    collectedAt: "2026-10-28T03:00:00.000Z", leadStatus: "AUDITED", opportunityScore: 58, notes: "Dữ liệu minh họa, không phải hồ sơ thật.",
    createdAt: "2026-10-28T03:00:00.000Z", updatedAt: "2026-10-28T03:00:00.000Z",
  },
  {
    id: "demo-hai-van", name: "Nhà hàng Hải Vân", industry: "Nhà hàng", category: "Ẩm thực địa phương",
    address: "12 Trần Phú", city: "Đà Nẵng", district: "Sơn Trà", websiteUrl: "https://haivan.example",
    normalizedDomain: "haivan.example", phone: null, email: null, dataSource: "DEMO · Fixture",
    collectedAt: "2026-10-27T03:00:00.000Z", leadStatus: "NEW_DISCOVERED", opportunityScore: null, notes: null,
    createdAt: "2026-10-27T03:00:00.000Z", updatedAt: "2026-10-27T03:00:00.000Z",
  },
];

export const previewPipelineOpportunity: PipelineOpportunity = {
  businessName: "Công ty Du lịch Mộc", domain: "moc-tour.example", score: 58, owner: "Chưa phân công",
};

import type { Metadata } from "next";
import { FeatureBanner, FoundationNotice, PageHeading, PendingBadge } from "@/components/page-foundation";
import { EmptyState, Panel, StatCard } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Website Audit" };

export default function AuditPage() {
  return <>
    <PageHeading title="Website Audit" description="Phát hiện vấn đề, xem bằng chứng và xác minh trước khi đưa vào đề xuất."><PendingBadge /></PageHeading>
    <FeatureBanner kicker="PHÂN TÍCH · XÁC MINH · ĐỀ XUẤT" title="Kiểm tra website có bằng chứng" description="Ưu tiên kết quả có thể giải thích cho người kinh doanh, không chỉ là điểm SEO." />
    <div className="stats">{["Sức khỏe website", "URL đã kiểm tra", "Nhóm tín hiệu cần xem", "Đã xác minh"].map((label) => <StatCard key={label} label={label} />)}</div>
    <FoundationNotice />
    <div className="split"><Panel title="Các vấn đề & bằng chứng"><EmptyState icon="⌕" title="Chưa có kết quả kiểm tra" description="Website Audit chưa được triển khai. Kết quả và phạm vi kiểm tra sẽ hiển thị tại đây khi có dữ liệu thật." /></Panel>
    <Panel title="Chi tiết vấn đề"><EmptyState icon="⌕" title="Chưa có bằng chứng để xem" description="Chi tiết URL, bằng chứng và hướng cải thiện sẽ được bổ sung trong giai đoạn sau." /></Panel></div>
  </>;
}

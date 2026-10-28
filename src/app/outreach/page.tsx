import type { Metadata } from "next";
import { FeatureBanner, FoundationNotice, PageHeading, PendingBadge } from "@/components/page-foundation";
import { EmptyState, Panel } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Tiếp cận & Đề xuất" };

export default function OutreachPage() {
  return <>
    <PageHeading title="Tiếp cận & Đề xuất" description="Một nơi chuẩn bị đề xuất cá nhân hóa, duyệt kênh gửi và theo dõi phản hồi."><PendingBadge /></PageHeading>
    <FeatureBanner kicker="TỪ KẾT QUẢ AUDIT ĐẾN CƠ HỘI HỢP TÁC" title="Chuẩn bị đúng đề xuất cho đúng doanh nghiệp" description="Bạn kiểm soát tính chính xác của bằng chứng, nội dung và điều kiện liên hệ." />
    <FoundationNotice />
    <div className="split"><Panel title="Nội dung đề xuất cá nhân hóa"><EmptyState icon="✉" title="Chưa triển khai soạn đề xuất" description="Khu vực này sẽ hỗ trợ chuẩn bị nội dung dựa trên các phát hiện đã xác minh." /></Panel>
    <Panel title="Điều kiện gửi & Theo dõi"><EmptyState icon="✉" title="Chưa kết nối kênh liên hệ" description="Tích hợp kênh liên hệ, phản hồi và bàn giao hội thoại chưa được triển khai." /></Panel></div>
  </>;
}

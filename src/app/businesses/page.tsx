import type { Metadata } from "next";
import { FoundationNotice, PageHeading, PendingBadge } from "@/components/page-foundation";
import { EmptyState, Panel, StatCard } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Khách hàng & Cơ hội" };

export default function BusinessesPage() {
  return <>
    <PageHeading title="Khách hàng & Cơ hội" description="Quản lý cùng một hồ sơ từ đầu mối liên hệ đến cơ hội hợp tác."><PendingBadge /></PageHeading>
    <div className="stats">{["Doanh nghiệp phát hiện", "Cần ưu tiên audit", "Đã tiếp cận", "Khách quan tâm"].map((label) => <StatCard key={label} label={label} />)}</div>
    <FoundationNotice />
    <div className="split"><Panel title="Danh sách doanh nghiệp" description="Khu vực dành cho hồ sơ khách hàng."><EmptyState title="Chưa kết nối danh sách doanh nghiệp" description="Danh sách, tìm kiếm và nhập dữ liệu sẽ được phát triển trong giai đoạn sau." /></Panel>
    <Panel title="Hồ sơ khách hàng"><EmptyState title="Chưa có hồ sơ để hiển thị" description="Thông tin doanh nghiệp và các cơ hội liên quan sẽ được hiển thị tại đây khi chức năng sẵn sàng." /></Panel></div>
  </>;
}

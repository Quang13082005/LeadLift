import type { Metadata } from "next";
import { FoundationNotice, PageHeading, PendingBadge } from "@/components/page-foundation";
import { Badge, EmptyState, Panel } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Cài đặt & Tích hợp" };

export default function SettingsPage() {
  return <>
    <PageHeading title="Cài đặt & Tích hợp" description="Quản lý không gian làm việc và kết nối các dịch vụ."><PendingBadge /></PageHeading>
    <FoundationNotice />
    <div className="dual"><Panel title="Kênh liên hệ" description="Các kết nối sẽ được bổ sung ở giai đoạn sau."><dl className="panel-body integration-list">{["✉ Email", "◈ Zalo Official Account", "▧ Facebook Messenger", "☏ Điện thoại"].map((name) => <div className="integration-row" key={name}><dt>{name}</dt><dd><Badge>Chưa triển khai</Badge></dd></div>)}</dl></Panel>
    <Panel title="Không gian làm việc"><EmptyState icon="⚙" title="Chưa triển khai cài đặt" description="Các tùy chọn cấu hình và quản lý quyền truy cập sẽ xuất hiện khi chức năng sẵn sàng." /></Panel></div>
  </>;
}

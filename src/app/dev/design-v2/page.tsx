import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeading, FeatureBanner } from "@/components/page-foundation";

export default function DesignV2PreviewIndex() {
  if (process.env.NODE_ENV !== "development") notFound();
  const screens = [["home", "Tổng quan"], ["businesses", "Khách hàng & Cơ hội"], ["audit", "Website Audit"], ["outreach", "Tiếp cận & Đề xuất"], ["settings", "Cài đặt & Tích hợp"]];
  return <><PageHeading title="Design V2 · Bản xem trước" description="Các fixture chỉ dùng để kiểm tra giao diện và tương tác trong development local." /><FeatureBanner kicker="DEMO · DESIGN V2" title="Chọn màn hình để xem thử" description="Dữ liệu mô phỏng; không ghi cơ sở dữ liệu và không gửi tin nhắn." /><div className="dual preview-gallery">{screens.map(([path, name]) => <Link key={path} className="panel panPad" href={`/dev/design-v2/${path}`}><b>{name} →</b><p className="hint">Mở màn hình preview</p></Link>)}</div></>;
}

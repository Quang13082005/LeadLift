import Link from "next/link";
import { navigation } from "@/components/navigation";
import { FoundationNotice, PageHeading } from "@/components/page-foundation";
import { EmptyState, Panel, StatCard } from "@/components/ui/primitives";

export default function Home() {
  return <>
    <PageHeading title="Tổng quan" description="Theo dõi khách hàng, hoạt động kiểm tra website và cơ hội hợp tác." />
    <FoundationNotice />
    <div className="stats">{["Doanh nghiệp", "Website đã kiểm tra", "Đề xuất", "Cơ hội hợp tác"].map((label) => <StatCard key={label} label={label} />)}</div>
    <div className="stack"><Panel title="Không gian làm việc" description="Đi đến các khu vực của LeadLift."><div className="panel-body section-links">{navigation.slice(1).map((item) => <Link className="panel section-link" key={item.href} href={item.href}><strong><span aria-hidden="true">{item.icon} </span>{item.title} →</strong><p>{item.description}</p></Link>)}</div></Panel>
    <Panel title="Hoạt động gần đây"><EmptyState icon="◷" title="Chưa kết nối hoạt động" description="Lịch sử hoạt động sẽ xuất hiện khi các chức năng nghiệp vụ được triển khai." /></Panel></div>
  </>;
}

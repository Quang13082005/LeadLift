import type { ReactNode } from "react";
import { Badge, Card } from "./ui/primitives";

export function PageHeading({ title, description, children }: { title: string; description: string; children?: ReactNode }) {
  return <header className="page-heading"><div><h1>{title}</h1><p>{description}</p></div>{children && <div className="actions">{children}</div>}</header>;
}

export function FoundationNotice() {
  return <div className="notice"><strong>Giao diện nền tảng — chưa triển khai nghiệp vụ.</strong> Các khu vực bên dưới chưa kết nối dữ liệu; dấu “—” biểu thị chưa có số liệu.</div>;
}

export function FeatureBanner({ kicker, title, description }: { kicker: string; title: string; description: string }) {
  return <Card className="banner"><span className="kicker">{kicker}</span><h2>{title}</h2><p>{description}</p></Card>;
}

export function PendingBadge() { return <Badge tone="amber">Chưa triển khai</Badge>; }

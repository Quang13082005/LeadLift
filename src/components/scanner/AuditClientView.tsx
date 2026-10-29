"use client";

import { useState } from "react";
import Link from "next/link";
import { PageHeading, FeatureBanner } from "@/components/page-foundation";
import { MultiUrlAuditPanel } from "@/components/scanner/MultiUrlAuditPanel";
import { parseBusinessWebsite } from "@/lib/domain-normalizer";
import type { BusinessItem } from "@/types/business";

export function AuditClientView({ initialBusinesses, initialBusinessId }: { initialBusinesses: BusinessItem[]; initialBusinessId?: string }) {
  const business = initialBusinessId
    ? initialBusinesses.find((item) => item.id === initialBusinessId) ?? null
    : null;
  const normalizedWebsite = business ? parseBusinessWebsite(business.websiteUrl)?.url ?? "" : "";

  return (
    <AuditWorkspace
      key={`${business?.id ?? `unselected:${initialBusinessId ?? "none"}`}:${normalizedWebsite}`}
      business={business}
      websiteUrl={normalizedWebsite}
      invalidBusinessId={Boolean(initialBusinessId && !business)}
    />
  );
}

function AuditWorkspace({ business, websiteUrl, invalidBusinessId }: { business: BusinessItem | null; websiteUrl: string; invalidBusinessId: boolean }) {
  const [running, setRunning] = useState(false);
  const [hasRun, setHasRun] = useState(false);

  return <>
    <PageHeading title="Website Audit" description="Phát hiện vấn đề, xem bằng chứng và xác minh trước khi đưa vào đề xuất.">
      <button type="submit" form="website-audit-form" className="button button-primary" disabled={running || !business || !websiteUrl}>
        {running ? "Đang quét…" : hasRun ? "↻ Quét lại" : "Quét website"}
      </button>
      <Link href="/outreach" className="button">Xem đề xuất →</Link>
    </PageHeading>
    <FeatureBanner kicker="PHÂN TÍCH · XÁC MINH · ĐỀ XUẤT" title="Kiểm tra website có bằng chứng" description="Ưu tiên kết quả có thể giải thích cho người kinh doanh, không chỉ là điểm SEO." />
    <div className="panel panPad audit-context">
      <div>
        <strong>{business?.name || "Chưa chọn doanh nghiệp"}</strong>{" "}
        <span className="statusnote">{websiteUrl || "Chưa có website hợp lệ trong hồ sơ"}{business?.city ? ` · ${business.city}` : ""}</span>
        <div className="sub">Kết quả và xác minh tạm thời trong phiên.</div>
      </div>
      <Link href="/businesses" className="button button-small">
        {business ? "Đổi doanh nghiệp" : "Chọn doanh nghiệp"}
      </Link>
    </div>

    {!business ? (
      <section className="panel panPad audit-business-empty" aria-label="Chưa chọn doanh nghiệp">
        <h2>{invalidBusinessId ? "Không tìm thấy hồ sơ doanh nghiệp" : "Chọn doanh nghiệp để bắt đầu"}</h2>
        <p>{invalidBusinessId ? "Hồ sơ được yêu cầu không còn khả dụng. Hãy chọn doanh nghiệp khác trong danh sách." : "Website Audit chỉ quét website được lưu trong hồ sơ doanh nghiệp. Mở danh sách để chọn một hồ sơ thật."}</p>
        <Link href="/businesses" className="button button-primary">Mở Khách hàng & Cơ hội</Link>
      </section>
    ) : !websiteUrl ? (
      <section className="panel panPad audit-business-empty" aria-label="Website doanh nghiệp chưa hợp lệ">
        <h2>Hồ sơ chưa có website hợp lệ</h2>
        <p>Cập nhật địa chỉ website HTTP/HTTPS trong hồ sơ doanh nghiệp tại Khách hàng & Cơ hội trước khi quét.</p>
        <Link href={`/businesses?businessId=${encodeURIComponent(business.id)}`} className="button button-primary">Mở hồ sơ doanh nghiệp</Link>
      </section>
    ) : (
      <MultiUrlAuditPanel key={`${business.id}:${websiteUrl}`} initialUrl={websiteUrl} onRunningChange={setRunning} onRun={() => setHasRun(true)} />
    )}
  </>;
}

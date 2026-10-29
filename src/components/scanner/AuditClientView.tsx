"use client";

import { useState } from "react";
import Link from "next/link";
import { PageHeading } from "@/components/page-foundation";
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
    <div className={`panel audit-context${business ? "" : " audit-context-empty"}`}>
      {business ? (
        <>
          <div className="audit-business-context">
            <strong>{business.name}</strong>
            <div className="audit-business-meta">
              <span>{websiteUrl || "Chưa có website hợp lệ trong hồ sơ"}</span>
              {business.city && <span className="audit-business-location">{business.city}</span>}
            </div>
            <div className="sub">
              {websiteUrl
                ? "Kết quả và xác minh tạm thời trong phiên."
                : "Hồ sơ chưa có website hợp lệ. Cập nhật địa chỉ HTTP/HTTPS trong Khách hàng & Cơ hội trước khi quét."}
            </div>
          </div>
          <Link href="/businesses" className="button button-primary audit-business-select">Chọn doanh nghiệp</Link>
        </>
      ) : (
        <>
          <div className="audit-business-empty-copy">
            <strong>{invalidBusinessId ? "Hồ sơ doanh nghiệp không khả dụng" : "Chưa chọn doanh nghiệp"}</strong>
            <p>{invalidBusinessId
              ? "Hồ sơ được yêu cầu không còn khả dụng. Chọn một hồ sơ khác để tiếp tục."
              : "Chọn hồ sơ doanh nghiệp có website hợp lệ để bắt đầu."}</p>
          </div>
          <Link href="/businesses" className="button button-primary audit-business-select">Chọn doanh nghiệp</Link>
        </>
      )}
    </div>

    {business && websiteUrl && (
      <MultiUrlAuditPanel key={`${business.id}:${websiteUrl}`} initialUrl={websiteUrl} onRunningChange={setRunning} onRun={() => setHasRun(true)} />
    )}
  </>;
}

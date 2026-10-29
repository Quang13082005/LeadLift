"use client";

import { useState } from "react";
import Link from "next/link";
import { PageHeading, FeatureBanner } from "@/components/page-foundation";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/primitives";
import { MultiUrlAuditPanel } from "@/components/scanner/MultiUrlAuditPanel";
import type { BusinessItem } from "@/types/business";

export function AuditClientView({ initialBusinesses, initialBusinessId }: { initialBusinesses: BusinessItem[]; initialBusinessId?: string }) {
  const defaultBiz = initialBusinesses.find((b) => b.id === initialBusinessId) || initialBusinesses[0];
  const [businessId, setBusinessId] = useState(defaultBiz?.id || "custom");
  const [url, setUrl] = useState(defaultBiz?.websiteUrl || "");
  const [draftUrl, setDraftUrl] = useState(url);
  const [draftBusiness, setDraftBusiness] = useState(businessId);
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [hasRun, setHasRun] = useState(false);
  const business = initialBusinesses.find((b) => b.id === businessId);
  return <>
    <PageHeading title="Website Audit" description="Phát hiện vấn đề, xem bằng chứng và xác minh trước khi đưa vào đề xuất.">
      <button type="submit" form="website-audit-form" className="button button-primary" disabled={running || !url.trim()}>{running ? "Đang quét…" : hasRun ? "↻ Quét lại" : "Quét website"}</button>
      <Link href="/outreach" className="button">Xem đề xuất →</Link>
    </PageHeading>
    <FeatureBanner kicker="PHÂN TÍCH · XÁC MINH · ĐỀ XUẤT" title="Kiểm tra website có bằng chứng" description="Ưu tiên kết quả có thể giải thích cho người kinh doanh, không chỉ là điểm SEO." />
    <div className="panel panPad audit-context">
      <div><strong>{business?.name || "Website tùy chọn"}</strong> <span className="statusnote">{url || "Chưa chọn website"}{business?.city ? ` · ${business.city}` : ""}</span><div className="sub">Kết quả và xác minh tạm thời trong phiên.</div></div>
      <Button small disabled={running} onClick={() => {setDraftUrl(url); setDraftBusiness(businessId); setOpen(true);}}>Đổi doanh nghiệp / URL</Button>
    </div>
    <MultiUrlAuditPanel key={`${businessId}:${url}`} initialUrl={url} onRunningChange={setRunning} onRun={() => setHasRun(true)} />
    <Dialog id="target-select-dialog" open={open} onClose={() => setOpen(false)} title="Chọn doanh nghiệp / URL để kiểm tra" description="Chỉ quét website bạn sở hữu hoặc được phép kiểm tra.">
      <form onSubmit={(event) => {event.preventDefault(); setBusinessId(draftBusiness); setUrl(draftUrl.trim()); setHasRun(false); setOpen(false);}} className="biz-form">
        <label className="form-field">Doanh nghiệp<select className="form-select" value={draftBusiness} onChange={(event) => {setDraftBusiness(event.target.value); const b=initialBusinesses.find((item)=>item.id===event.target.value); if(b) setDraftUrl(b.websiteUrl);}}>{initialBusinesses.map((b)=><option key={b.id} value={b.id}>{b.name}</option>)}<option value="custom">Website khác</option></select></label>
        <label className="form-field">Địa chỉ website<input className="form-input" type="url" required value={draftUrl} onChange={(event)=>{setDraftUrl(event.target.value);setDraftBusiness("custom");}} /></label>
        <div className="modal-actions"><Button onClick={()=>setOpen(false)}>Hủy</Button><Button type="submit" variant="primary">Áp dụng website</Button></div>
      </form>
    </Dialog>
  </>;
}

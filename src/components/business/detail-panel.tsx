"use client";

import Link from "next/link";
import { Button, Badge, EmptyState } from "@/components/ui/primitives";
import { LEAD_STATUS_LABELS, type BusinessItem } from "@/types/business";

interface BusinessDetailPanelProps {
  business: BusinessItem | null;
  onEdit: (business: BusinessItem) => void;
}

export function BusinessDetailPanel({ business, onEdit }: BusinessDetailPanelProps) {
  if (!business) {
    return (
      <section className="panel">
        <header className="panel-heading">
          <h2>Hồ sơ khách hàng</h2>
          <p className="hint">Chọn một doanh nghiệp từ danh sách bên trái để xem chi tiết.</p>
        </header>
        <EmptyState
          icon="📋"
          title="Chưa chọn doanh nghiệp"
          description="Bấm vào bất kỳ doanh nghiệp nào trong danh sách để xem hồ sơ, lộ trình tiếp cận và thông tin liên hệ."
        />
      </section>
    );
  }

  const statusConfig = LEAD_STATUS_LABELS[business.leadStatus] || { label: business.leadStatus, tone: "neutral" };
  const formattedDate = new Date(business.collectedAt).toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Ho_Chi_Minh",
  });

  // Calculate roadmap step highlights
  const isAudited =
    ["AUDITED", "QUALIFIED", "CONTACT_READY", "OUTREACH_SENT", "IN_DISCUSSION", "CONVERTED"].includes(business.leadStatus);
  const isOutreachPrepared =
    business.leadStatus === "CONTACT_READY" ||
    business.leadStatus === "OUTREACH_SENT" ||
    business.leadStatus === "IN_DISCUSSION" ||
    business.leadStatus === "CONVERTED";
  const isOutreachSent =
    business.leadStatus === "OUTREACH_SENT" ||
    business.leadStatus === "IN_DISCUSSION" ||
    business.leadStatus === "CONVERTED";
  const isInterested =
    business.leadStatus === "IN_DISCUSSION" || business.leadStatus === "CONVERTED";

  return (
    <section className="panel detail-panel" aria-label="Chi tiết hồ sơ doanh nghiệp">
      <header className="panel-heading detail-header">
        <div className="header-meta">
          <span className="kicker">HỒ SƠ KHÁCH HÀNG</span>
          <Badge tone={statusConfig.tone}>{statusConfig.label}</Badge>
        </div>
        <div className="header-actions">
          <Button variant="quiet" small onClick={() => onEdit(business)} title="Chỉnh sửa thông tin hồ sơ">
            ✏ Sửa
          </Button>
        </div>
      </header>

      <div className="panel-body detail-body">
        <h3 className="biz-title">{business.name}</h3>

        <div className="website-link-wrap">
          <a
            href={/^https?:\/\//i.test(business.websiteUrl) ? business.websiteUrl : undefined}
            target="_blank"
            rel="noopener noreferrer"
            className="external-link"
            title="Mở website trong tab mới"
          >
            {business.websiteUrl} <span aria-hidden="true">↗</span>
          </a>
          <span className="domain-subtag">({business.normalizedDomain})</span>
        </div>

        <hr className="divider" />

        {/* Key-Value metadata */}
        <div className="kv-grid">
          <div className="kv-item">
            <span className="kv-label">Ngành nghề</span>
            <strong className="kv-val">{business.industry}</strong>
          </div>

          <div className="kv-item">
            <span className="kv-label">Khu vực / Địa chỉ</span>
            <strong className="kv-val">
              {business.district ? `${business.district}, ` : ""}
              {business.city}
              {business.address ? ` (${business.address})` : ""}
            </strong>
          </div>

          <div className="kv-item">
            <span className="kv-label">Điểm cơ hội (Audit)</span>
            <div className="kv-val">
              {business.opportunityScore !== null ? (
                <span
                  className={`score-badge ${
                    business.opportunityScore < 60
                      ? "score-bad"
                      : business.opportunityScore < 75
                      ? "score-warn"
                      : "score-good"
                  }`}
                >
                  {business.opportunityScore}/100
                </span>
              ) : (
                <span className="score-unrated">— Chưa phân tích</span>
              )}
            </div>
          </div>

          <div className="kv-item">
            <span className="kv-label">Nguồn dữ liệu</span>
            <strong className="kv-val">{business.dataSource || "Thủ công"}</strong>
          </div>

          <div className="kv-item">
            <span className="kv-label">Ngày thu thập</span>
            <strong className="kv-val">{formattedDate}</strong>
          </div>

          <div className="kv-item">
            <span className="kv-label">Số điện thoại</span>
            <strong className="kv-val">{business.phone || "—"}</strong>
          </div>

          <div className="kv-item">
            <span className="kv-label">Email liên hệ</span>
            <strong className="kv-val">{business.email || "—"}</strong>
          </div>

          {business.notes && (
            <div className="kv-item full">
              <span className="kv-label">Ghi chú</span>
              <p className="kv-notes">{business.notes}</p>
            </div>
          )}
        </div>

        {/* Roadmap Progress */}
        <div className="roadmap-box">
          <div className="roadmap-title">LỘ TRÌNH HỒ SƠ</div>
          <div className="roadmap-steps">
            <span className="step done">✓ Tìm thấy</span>
            <span className={`step ${isAudited ? "done" : "now"}`}>
              {isAudited ? "✓ Audit" : "Audit"}
            </span>
            <span className={`step ${isOutreachPrepared ? "done" : ""}`}>
              {isOutreachPrepared ? "✓ Đề xuất" : "Đề xuất"}
            </span>
            <span className={`step ${isOutreachSent ? "done" : ""}`}>
              {isOutreachSent ? "✓ Tiếp cận" : "Tiếp cận"}
            </span>
            <span className={`step ${isInterested ? "done" : ""}`}>
              {isInterested ? "✓ Quan tâm" : "Quan tâm"}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="detail-action-buttons">
          <Link href={`/audit?businessId=${business.id}`} className="button button-primary">
            ⌕ Mở Website Audit
          </Link>
          <Link href={`/outreach?businessId=${business.id}`} className="button button-secondary">
            ✉ Chuẩn bị đề xuất
          </Link>
        </div>
        <p className="hint">Website Audit và soạn đề xuất chưa triển khai; các nút mở trang nền tảng.</p>

        {/* Discussion Alert if client replied */}
        {isInterested && (
          <div className="alert-box alert-green mt-16">
            <strong>✓ Khách hàng quan tâm hợp tác</strong>
            <p>Doanh nghiệp đã phản hồi tích cực. Bạn có thể tiến hành trao đổi trực tiếp và ký kết hợp đồng.</p>
          </div>
        )}
      </div>
    </section>
  );
}

"use client";

import { useState, useCallback, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { PageHeading, FeatureBanner } from "@/components/page-foundation";
import { Button, Badge } from "@/components/ui/primitives";
import { Dialog } from "@/components/ui/dialog";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { scanWebsiteAction } from "@/app/actions/scanner";
import { MultiUrlAuditPanel } from "@/components/scanner/MultiUrlAuditPanel";
import type { BusinessItem } from "@/types/business";
import type { ScanResult, ScanFinding, RuleId } from "@/types/scanner";

interface AuditClientViewProps {
  initialBusinesses: BusinessItem[];
  initialBusinessId?: string;
}

export function AuditClientView({ initialBusinesses, initialBusinessId }: AuditClientViewProps) {
  const showToast = useToast();

  // Selected business & URL state
  const defaultBiz = initialBusinesses.find((business) => business.id === initialBusinessId) || initialBusinesses[0] || null;
  const [selectedBizId, setSelectedBizId] = useState<string>(defaultBiz?.id || "custom");
  const [draftBizId, setDraftBizId] = useState<string>(defaultBiz?.id || "custom");
  const [targetUrl, setTargetUrl] = useState<string>(defaultBiz?.websiteUrl || "");
  const [modalUrlInput, setModalUrlInput] = useState<string>(targetUrl);

  // Scan state
  const [auditMode, setAuditMode] = useState<"single" | "multi">("single");
  const [isCrawlRunning, setIsCrawlRunning] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [scanError, setScanError] = useState<{ message: string; code?: string } | null>(null);
  const [scanTimestamp, setScanTimestamp] = useState<string>("");

  // Tab & Filters
  const [activeTab, setActiveTab] = useState<"issues" | "pages" | "history">("issues");
  const [filterMode, setFilterMode] = useState<"all" | "high" | "medium" | "pass" | "unknown">("all");
  const [selectedRuleId, setSelectedRuleId] = useState<RuleId | null>(null);
  const [verifiedMap, setVerifiedMap] = useState<Record<string, boolean>>({});

  // Modals
  const [isTargetDialogOpen, setIsTargetDialogOpen] = useState<boolean>(false);
  const [isUrlModalOpen, setIsUrlModalOpen] = useState<boolean>(false);

  const executeScan = useCallback(
    (urlToScan: string) => {
      if (!urlToScan.trim() || isPending) return;

      setScanError(null);
      setScanResult(null);
      setScanTimestamp("");
      setSelectedRuleId(null);
      setVerifiedMap({});
      startTransition(async () => {
        try {
          const res = await scanWebsiteAction(urlToScan.trim());
          if (!res.success || !res.data) {
            setScanError({
              message: res.error || "Quá trình quét website thất bại.",
              code: res.code,
            });
            showToast(`Lỗi quét: ${res.error || "Không thể phân tích website"}`);
            return;
          }

          setScanResult(res.data);
          const now = new Date();
          setScanTimestamp(
            `${now.toLocaleDateString("vi-VN")} · ${now.toLocaleTimeString("vi-VN", {
              hour: "2-digit",
              minute: "2-digit",
            })}`
          );

          // By default, select first FAIL finding, or first PASS if none fail
          const firstFail = res.data.findings.find((f) => f.status === "FAIL");
          setSelectedRuleId(firstFail ? firstFail.ruleId : res.data.findings[0]?.ruleId || null);
          showToast("Đã hoàn tất phân tích an toàn website.");
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Đã xảy ra lỗi không xác định.";
          setScanError({ message: msg });
          showToast(`Lỗi: ${msg}`);
        }
      });
    },
    [isPending, showToast]
  );

  const currentBiz = initialBusinesses.find((b) => b.id === selectedBizId);
  const currentBizName = currentBiz?.name || "Doanh nghiệp tùy chọn";
  const currentBizCity = currentBiz?.city || "Đà Nẵng";

  // Categorize findings
  const allFindings = scanResult?.findings || [];
  const failFindings = allFindings.filter((f) => f.status === "FAIL");
  const passFindings = allFindings.filter((f) => f.status === "PASS");
  const urlFindings = allFindings.filter((finding) => finding.status === "FAIL" || finding.status === "UNKNOWN");

  const highCount = failFindings.filter(
    (f) => f.severity === "CRITICAL" || f.severity === "HIGH"
  ).length;
  const medCount = failFindings.filter((f) => f.severity === "MEDIUM").length;
  const verifiedCount = failFindings.filter((finding) => verifiedMap[finding.ruleId]).length;

  // Filtered issues to display in Tab 1
  const displayedFindings = allFindings.filter((f) => {
    if (filterMode === "all") return f.status === "FAIL";
    if (filterMode === "high") {
      return f.status === "FAIL" && (f.severity === "CRITICAL" || f.severity === "HIGH");
    }
    if (filterMode === "medium") {
      return f.status === "FAIL" && f.severity === "MEDIUM";
    }
    if (filterMode === "pass") return f.status === "PASS";
    if (filterMode === "unknown") return f.status === "UNKNOWN";
    return true;
  });

  const activeFinding: ScanFinding | undefined =
    displayedFindings.find((f) => f.ruleId === selectedRuleId) ||
    displayedFindings[0];

  const isCurrentActiveVerified = activeFinding ? Boolean(verifiedMap[activeFinding.ruleId]) : false;

  const toggleVerify = (ruleId: string) => {
    const nextVal = !verifiedMap[ruleId];
    setVerifiedMap((prev) => ({ ...prev, [ruleId]: nextVal }));
    showToast(nextVal ? "Đã ghi nhận xác minh (phiên làm việc hiện tại)." : "Đã hủy xác minh.");
  };

  const handleApplyTargetDialog = (e: FormEvent) => {
    e.preventDefault();
    setIsTargetDialogOpen(false);
    setAuditMode("single");
    setSelectedBizId(draftBizId);
    if (draftBizId !== "custom") {
      const found = initialBusinesses.find((b) => b.id === draftBizId);
      if (found) {
        setTargetUrl(found.websiteUrl);
        executeScan(found.websiteUrl);
        return;
      }
    }
    if (modalUrlInput.trim()) {
      setTargetUrl(modalUrlInput.trim());
      executeScan(modalUrlInput.trim());
    }
  };

  return (
    <>
      <PageHeading
        title="Website Audit"
        description="Phát hiện vấn đề, xem bằng chứng và xác minh trước khi đưa vào đề xuất."
      >
        <button
          type="button"
          className={`button ${auditMode === "single" ? "button-primary" : ""}`}
          onClick={() => {
            if (auditMode !== "single") {
              setAuditMode("single");
              return;
            }
            executeScan(targetUrl);
          }}
          disabled={isPending || isCrawlRunning || (auditMode === "single" && !targetUrl.trim())}
          aria-label={auditMode === "single" ? scanResult ? "Quét lại website" : "Bắt đầu quét website" : "Quay lại kiểm toán một URL"}
        >
          {auditMode === "multi" ? "Quét 1 URL" : isPending ? "Đang quét…" : scanResult ? "↻ Quét lại URL" : "Quét 1 URL"}
        </button>
        <button
          type="button"
          className={`button ${auditMode === "multi" ? "button-primary" : ""}`}
          onClick={() => setAuditMode("multi")}
          disabled={isCrawlRunning}
          aria-pressed={auditMode === "multi"}
        >
          Quét nhiều URL
        </button>
        <Link href="/outreach" className="button button-primary">
          Xem đề xuất →
        </Link>
      </PageHeading>

      <FeatureBanner
        kicker="PHÂN TÍCH · XÁC MINH · ĐỀ XUẤT"
        title="Kiểm tra website có bằng chứng"
        description="Ưu tiên kết quả có thể giải thích cho người kinh doanh, không chỉ là điểm SEO."
      />

      {/* Business Context Bar */}
      <div
        className="panel panPad"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <strong>{currentBizName}</strong>{" "}
          <span className="statusnote">
            {targetUrl} · {currentBizCity}
          </span>
          <div className="sub" style={{ marginTop: 3 }}>
            {auditMode === "multi" ? (
              "Crawl giới hạn chạy trực tiếp trong phiên; không lưu lịch sử."
            ) : scanTimestamp ? (
              <>
                Lượt quét: {scanTimestamp} • HTTP {scanResult?.httpStatus} • Safe Fetcher (OWASP SSRF Protected)
              </>
            ) : isPending ? (
              "Đang kết nối và kiểm tra bảo mật…"
            ) : (
              "Chưa có kết quả quét"
            )}
          </div>
        </div>
        <div className="actions" style={{ flexShrink: 0 }}>
          <button
            type="button"
            className="button button-small"
            disabled={isCrawlRunning}
            onClick={() => {
              setModalUrlInput(targetUrl);
              setIsTargetDialogOpen(true);
            }}
          >
            Đổi doanh nghiệp / URL
          </button>
          {auditMode === "multi" ? (
            <Badge tone="blue">MULTI-URL</Badge>
          ) : isPending ? (
            <Badge tone="amber">ĐANG PHÂN TÍCH</Badge>
          ) : scanError ? (
            <Badge tone="red">QUÉT THẤT BẠI</Badge>
          ) : scanResult ? (
            <Badge tone="green">ĐÃ QUÉT XONG</Badge>
          ) : (
            <Badge tone="blue">CHƯA QUÉT</Badge>
          )}
        </div>
      </div>

      {auditMode === "multi" ? (
        <MultiUrlAuditPanel initialUrl={targetUrl} onUrlChange={setTargetUrl} onRunningChange={setIsCrawlRunning} />
      ) : (
        <>
      {/* 4 Stat Cards */}
      <div className="stats">
        <div className="stat">
          <div className="stat-label">Sức khỏe website</div>
          <div className="stat-value">—</div>
          <div className="stat-note">Chưa có điểm tổng hợp</div>
        </div>

        <div className="stat">
          <div className="stat-label">URL đã kiểm tra</div>
          <div className="stat-value">{scanResult ? 1 : 0}</div>
          <div className="stat-note">Phạm vi Phase 03A: 1 URL</div>
        </div>

        <div className="stat">
          <div className="stat-label">Nhóm tín hiệu cần xem</div>
          <div className="stat-value" style={{ color: "#c34a45" }}>
            {scanResult ? failFindings.length : "—"}
          </div>
          <div className="stat-note">Vấn đề phát hiện thực tế</div>
        </div>

        <div className="stat">
          <div className="stat-label">Đã xác minh</div>
          <div className="stat-value" style={{ color: "#00765a" }}>
            {scanResult ? verifiedCount : "—"}
          </div>
          <div className="stat-note">Tạm thời (client-side)</div>
        </div>
      </div>

      {/* Scope Disclaimer Banner */}
      <div className="bannerMini">
        <span aria-hidden="true" style={{ fontWeight: "bold", fontSize: 14 }}>ⓘ</span>
        <span>
          <b>Phạm vi kiểm toán:</b> Phase 03A phân tích 1 URL độc lập với 10 nhóm kiểm tra kỹ thuật an toàn (SSRF, SSL/TLS, Canonical, Heading H1, Meta Description, Viewport, OpenGraph, Robots, Redirect loop, Content Length). Không tự suy rộng thành toàn bộ website hay PageSpeed.
        </span>
      </div>

      {/* Scan Error Alert if any */}
      {scanError && (
        <div className="alert-box alert-red" style={{ marginBottom: 16 }}>
          <span className="alert-icon">⚠</span>
          <div>
            <strong>Lỗi quét website ({scanError.code || "SCAN_ERROR"}):</strong> {scanError.message}
          </div>
        </div>
      )}

      {/* 3 Tab Navigation */}
      <Tabs label="Các mục kiểm tra website" value={activeTab} onChange={setActiveTab} items={[
        { value: "issues", label: `Các vấn đề & bằng chứng${scanResult ? ` (${failFindings.length})` : ""}` },
        { value: "pages", label: `URL đã quét (${scanResult ? 1 : 0})` },
        { value: "history", label: "Lịch sử & so sánh" },
      ]} />
      {/* TAB 1: Các vấn đề & bằng chứng (Issue-first SEO Layout) */}
      {activeTab === "issues" && (
        <>
          {!scanResult ? (
            <section
              className="panel panPad"
              style={{ textAlign: "center", padding: "52px 24px" }}
              aria-label="Kết quả kiểm tra website"
            >
              <div
                className="empty-icon"
                style={{ fontSize: 28, width: 52, height: 52, margin: "0 auto 16px" }}
              >
                {scanResult ? "✓" : "◷"}
              </div>
              <h2
                style={{
                  fontSize: 20,
                  fontWeight: 750,
                  color: "var(--fg)",
                  marginBottom: 8,
                  letterSpacing: "-.3px",
                }}
              >
                {scanError ? "Chưa có kết quả phân tích" : "Chưa quét website"}
              </h2>
              <p
                style={{
                  maxWidth: 580,
                  margin: "0 auto 20px",
                  color: "var(--text-secondary)",
                  fontSize: 13.5,
                  lineHeight: 1.6,
                }}
              >
                {scanResult ? "Không có tiêu chí FAIL trong lần quét này. Bạn có thể xem các tiêu chí PASS hoặc UNKNOWN riêng." : "Chọn doanh nghiệp hoặc URL rồi bắt đầu quét. Chưa có kết quả nên chưa thể kết luận website có vấn đề hay đã đạt chuẩn."}
              </p>
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  justifyContent: "center",
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <button
                  type="button"
                  className="button button-primary"
                  onClick={() => {
                    setFilterMode("pass");
                    setSelectedRuleId(passFindings[0]?.ruleId || null);
                  }}
                  disabled={!scanResult || passFindings.length === 0}
                >
                  Xem tiêu chí đạt chuẩn ({passFindings.length}) →
                </button>
                <button
                  type="button"
                  className="button"
                  onClick={() => executeScan(targetUrl)}
                  disabled={isPending || !targetUrl.trim()}
                >
                  {isPending ? "Đang quét…" : scanResult ? "↻ Quét lại website" : "Quét website"}
                </button>
              </div>
            </section>
          ) : (
            <div className="split">
              {/* Left Column: Issue List */}
              <section className="panel" aria-label="Danh sách vấn đề">
                <div className="panelHead" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                  <div style={{ minWidth: 0 }}>
                    <h3>{filterMode === "pass" ? "Tiêu chí đạt chuẩn kỹ thuật" : "Vấn đề cần ưu tiên xử lý"}</h3>
                    <p className="hint">
                      {filterMode === "pass" ? "Danh sách 10 tiêu chí kỹ thuật đã vượt qua kiểm tra." : "Chọn một mục để kiểm tra phạm vi và hướng dẫn."}
                    </p>
                  </div>
                  <select
                    className="form-select"
                    style={{ width: "auto", minWidth: 150 }}
                    value={filterMode}
                    onChange={(e) => {
                      const mode = e.target.value as "all" | "high" | "medium" | "pass" | "unknown";
                      setFilterMode(mode);
                      const matching = allFindings.filter((f) => {
                        if (mode === "all") return f.status === "FAIL";
                        if (mode === "high") return f.status === "FAIL" && (f.severity === "CRITICAL" || f.severity === "HIGH");
                        if (mode === "medium") return f.status === "FAIL" && f.severity === "MEDIUM";
                        if (mode === "pass") return f.status === "PASS";
                        if (mode === "unknown") return f.status === "UNKNOWN";
                        return true;
                      });
                      setSelectedRuleId(matching[0]?.ruleId || null);
                    }}
                    aria-label="Lọc mức độ vấn đề"
                  >
                    <option value="all">Tất cả vấn đề ({failFindings.length})</option>
                    <option value="high">Mức cao ({highCount})</option>
                    <option value="medium">Trung bình ({medCount})</option>
                    <option value="pass">Đạt chuẩn ({passFindings.length})</option>
                    <option value="unknown">Chưa xác định ({allFindings.filter((finding) => finding.status === "UNKNOWN").length})</option>
                  </select>
                </div>

                {displayedFindings.length === 0 ? (
                  <div className="empty-state" style={{ padding: "36px 20px" }}>
                    <div className="empty-icon">✓</div>
                    <h3>Chưa phát hiện vấn đề</h3>
                    <p>
                      Không có vấn đề nào trong bộ lọc này. Bạn có thể chuyển sang xem các tiêu chí đạt chuẩn.
                    </p>
                    <div className="actions" style={{ justifyContent: "center", marginTop: 16 }}>
                      <button
                        type="button"
                        className="button button-small"
                        onClick={() => {
                          setFilterMode("pass");
                          setSelectedRuleId(passFindings[0]?.ruleId || null);
                        }}
                      >
                        Xem 10 tiêu chí đạt chuẩn ({passFindings.length})
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    {displayedFindings.map((finding) => {
                      const isSelected = activeFinding?.ruleId === finding.ruleId;
                      const isVerified = Boolean(verifiedMap[finding.ruleId]);
                      const isPass = finding.status === "PASS";
                      const isUnknown = finding.status === "UNKNOWN";
                      const isHigh = finding.severity === "CRITICAL" || finding.severity === "HIGH";

                      return (
                        <div
                          key={finding.ruleId}
                          className={`issueRow ${isSelected ? "sel" : ""} ${isPass ? "pass-row" : ""}`}
                          onClick={() => setSelectedRuleId(finding.ruleId)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setSelectedRuleId(finding.ruleId);
                            }
                          }}
                          aria-current={isSelected ? "true" : undefined}
                        >
                          <span
                            className="ic"
                            aria-hidden="true"
                            style={isPass ? { background: "var(--mint)", color: "var(--green)" } : undefined}
                          >
                            {isPass ? "✓" : isUnknown ? "?" : isHigh ? "!" : "•"}
                          </span>
                          <div style={{ minWidth: 0 }}>
                            <strong>{finding.ruleName}</strong>
                            <small>{finding.description}</small>
                          </div>
                          <b style={{ fontSize: 12 }}>1 URL</b>
                          <span className="hideMob">
                            <span
                              className={`chip ${
                                isPass ? "green" : isUnknown ? "blue" : isHigh ? "bad" : "warn"
                              }`}
                            >
                              {isPass ? "Đạt chuẩn" : isUnknown ? "Chưa rõ" : isHigh ? "Cao" : finding.severity === "MEDIUM" ? "Trung bình" : finding.severity === "LOW" ? "Thấp" : "Thông tin"}
                            </span>
                          </span>
                          <span className="hideMob">
                            {isPass ? (
                              <span className="chip green">Hợp lệ</span>
                            ) : isUnknown ? (
                              <span className="chip blue">Chưa xác định</span>
                            ) : (
                              <span className={`chip ${isVerified ? "green" : "warn"}`}>
                                {isVerified ? "Đã xác minh" : "Chưa xác minh"}
                              </span>
                            )}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* Right Column: Evidence & Detail Panel */}
              <section className="panel panPad detail" aria-label="Chi tiết bằng chứng">
                {activeFinding ? (
                  <>
                    {activeFinding.status === "PASS" ? (
                      /* PASS Finding Detail: Informative, NO verify/outreach buttons */
                      <>
                        <div className="row space" style={{ marginBottom: 8 }}>
                          <span className="kicker">TIÊU CHÍ ĐẠT CHUẨN KỸ THUẬT</span>
                          <span className="chip green">Đạt chuẩn (PASS)</span>
                        </div>

                        <h2>{activeFinding.ruleName}</h2>
                        <p>{activeFinding.description}</p>

                        <div className="miniTitle">Bằng chứng từ lần quét</div>
                        <div className="evidence">
                          <div className="evrow">
                            <span>Phương pháp phát hiện</span>
                            <strong>Kiểm tra an toàn (OWASP SSRF & Safe Fetcher)</strong>
                          </div>
                          <div className="evrow">
                            <span>URL kiểm tra</span>
                            <strong>{activeFinding.sourceUrl || scanResult?.finalUrl || targetUrl} (1 trang)</strong>
                          </div>
                          <div className="evrow">
                            <span>Mức độ ưu tiên</span>
                            <strong>Thông tin / Đạt chuẩn (PASS)</strong>
                          </div>
                          <div className="evrow">
                            <span>Trạng thái kiểm tra</span>
                            <strong>Đạt chuẩn kỹ thuật (PASS)</strong>
                          </div>

                          <div className="divider" />

                          <div className="sub" style={{ marginBottom: 6 }}>
                            URL điển hình được kiểm tra:
                          </div>
                          <div
                            className="kv"
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              padding: "6px 0",
                              borderBottom: "1px solid #edf1ed",
                              fontSize: 12,
                              marginBottom: 8,
                            }}
                          >
                            <span className="linkish">{targetUrl}</span>
                            <span className="chip blue">Kiểm tra HTML & Headers</span>
                          </div>

                          <div className="sub" style={{ marginBottom: 6 }}>
                            Dữ liệu bằng chứng kỹ thuật:
                          </div>
                          <div className="evidence-snippet">
                            {typeof activeFinding.evidence === "string"
                              ? activeFinding.evidence
                              : JSON.stringify(activeFinding.evidence, null, 2)}
                          </div>
                        </div>

                        <div className="miniTitle">Đánh giá kỹ thuật</div>
                        <div className="alert green">
                          <b>✓ Tiêu chí đạt chuẩn:</b> Cấu hình hiện tại của website đáp ứng tốt tiêu chuẩn kỹ thuật và khuyến nghị SEO cơ bản.
                        </div>

                        <div className="alert blue" style={{ marginTop: 14 }}>
                          <b>Không cần đưa vào đề xuất:</b> Tiêu chí đã đạt chuẩn kỹ thuật thì không cần xác minh hay tạo bản nháp liên hệ doanh nghiệp.
                        </div>
                      </>
                    ) : activeFinding.status === "UNKNOWN" ? (
                      <>
                        <div className="row space" style={{ marginBottom: 8 }}><span className="kicker">CẦN ĐỐI CHIẾU THÊM</span><span className="chip blue">UNKNOWN</span></div>
                        <h2>{activeFinding.ruleName}</h2>
                        <p>{activeFinding.description}</p>
                        <div className="miniTitle">Bằng chứng hiện có</div>
                        <div className="evidence"><div className="evrow"><span>URL nguồn</span><strong>{activeFinding.sourceUrl || scanResult?.finalUrl || targetUrl}</strong></div><div className="evidence-snippet">{activeFinding.evidence}</div></div>
                        <div className="alert blue" style={{ marginTop: 14 }}>Kết quả chưa đủ dữ liệu để kết luận PASS hoặc FAIL. Không đưa mục này vào đề xuất như một lỗi đã xác nhận.</div>
                      </>
                    ) : (
                      /* FAIL Finding Detail: Actionable with Verify checkbox & Add to outreach */
                      <>
                        <div className="row space" style={{ marginBottom: 8 }}>
                          <span className="kicker">CHI TIẾT VẤN ĐỀ</span>
                          <span className={`chip ${isCurrentActiveVerified ? "green" : "warn"}`}>
                            {isCurrentActiveVerified ? "Đã xác minh" : "Chưa xác minh"}
                          </span>
                        </div>

                        <h2>{activeFinding.ruleName}</h2>
                        <p>{activeFinding.description}</p>

                        <div className="miniTitle">Bằng chứng từ lần quét</div>
                        <div className="evidence">
                          <div className="evrow">
                            <span>Phương pháp phát hiện</span>
                            <strong>Kiểm tra an toàn (OWASP SSRF & Safe Fetcher)</strong>
                          </div>
                          <div className="evrow">
                            <span>URL ảnh hưởng</span>
                            <strong>{activeFinding.sourceUrl || scanResult?.finalUrl || targetUrl} (1 trang)</strong>
                          </div>
                          <div className="evrow">
                            <span>Mức độ ưu tiên</span>
                            <strong>
                              {activeFinding.severity === "CRITICAL" || activeFinding.severity === "HIGH"
                                ? "Mức cao"
                                : activeFinding.severity === "MEDIUM"
                                ? "Trung bình"
                                : activeFinding.severity === "LOW" ? "Thấp" : "Thông tin"}
                            </strong>
                          </div>
                          <div className="evrow">
                            <span>Trạng thái kiểm tra</span>
                            <strong>Phát hiện vấn đề (FAIL)</strong>
                          </div>

                          <div className="divider" />

                          <div className="sub" style={{ marginBottom: 6 }}>
                            URL điển hình được kiểm tra:
                          </div>
                          <div
                            className="kv"
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              padding: "6px 0",
                              borderBottom: "1px solid #edf1ed",
                              fontSize: 12,
                              marginBottom: 8,
                            }}
                          >
                            <span className="linkish">{targetUrl}</span>
                            <span className="chip blue">Kiểm tra HTML & Headers</span>
                          </div>

                          <div className="sub" style={{ marginBottom: 6 }}>
                            Dữ liệu bằng chứng kỹ thuật:
                          </div>
                          <div className="evidence-snippet">
                            {typeof activeFinding.evidence === "string"
                              ? activeFinding.evidence
                              : JSON.stringify(activeFinding.evidence, null, 2)}
                          </div>
                        </div>

                        <div className="miniTitle">Đề xuất cải thiện</div>
                        <div className="alert green">
                          <b>{activeFinding.recommendation || "Tiếp tục duy trì cấu hình hiện tại."}</b>
                        </div>

                        <label className="toggle" style={{ marginTop: 16 }}>
                          <input
                            type="checkbox"
                            checked={isCurrentActiveVerified}
                            onChange={() => toggleVerify(activeFinding.ruleId)}
                            aria-label="Xác nhận đối chiếu bằng chứng"
                          />
                          <span>Tôi đã xem và đối chiếu bằng chứng (phiên làm việc hiện tại)</span>
                        </label>

                        <div className="btnline">
                          <button
                            type="button"
                            className={`button ${isCurrentActiveVerified ? "" : "button-primary"}`}
                            onClick={() => toggleVerify(activeFinding.ruleId)}
                          >
                            {isCurrentActiveVerified ? "✓ Đã xác minh" : "✓ Xác minh vấn đề"}
                          </button>
                          <button
                            type="button"
                            className="button button-primary"
                            disabled
                            title="Chức năng lưu đề xuất chưa được triển khai"
                          >
                            Đưa vào đề xuất · Chưa hỗ trợ
                          </button>
                        </div>

                        <p className="hint" style={{ marginTop: 14 }}>
                          Hệ thống thật sẽ lưu người xác minh, thời điểm và URL bằng chứng ở Phase 03B/04.
                        </p>
                      </>
                    )}
                  </>
                ) : (
                  <div className="empty-state">
                    <p>Chọn một mục ở danh sách bên trái để xem chi tiết.</p>
                  </div>
                )}
              </section>
            </div>
          )}
        </>
      )}

      {/* TAB 2: URL đã quét (Single-URL Scanned Table + Detail Modal) */}
      {activeTab === "pages" && (
        <section className="panel" aria-label="Danh sách URL đã quét">
          <div className="panelHead" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <div>
              <h3>Danh sách URL đã quét</h3>
              <p className="hint">
                Nhấn vào URL để mở popup xem <b>tất cả các vấn đề</b>, bằng chứng và cách khắc phục theo từng trang.
              </p>
            </div>
            <span className="chip green">DỮ LIỆU THỰC TẾ (PHASE 03A)</span>
          </div>

          <div className="tableWrap">
            <table className="table">
              <thead>
                <tr>
                  <th>URL</th>
                  <th>HTTP</th>
                  <th>Số vấn đề</th>
                  <th>Mức ưu tiên</th>
                  <th>Hành động</th>
                </tr>
              </thead>
              <tbody>
                {scanResult ? <tr
                  className="table-row-selectable"
                  onClick={() => setIsUrlModalOpen(true)}
                  title="Nhấn để xem toàn bộ vấn đề của URL này"
                >
                  <td>
                    <div className="url-line">
                      <button
                        type="button"
                        className="linkbutton"
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsUrlModalOpen(true);
                        }}
                      >
                        {scanResult.finalUrl}
                      </button>
                      <span style={{ color: "#80a394" }} aria-hidden="true">↗</span>
                    </div>
                  </td>
                  <td>
                    <span className={`chip ${scanResult?.httpStatus === 200 ? "green" : "bad"}`}>
                      {scanResult.httpStatus}
                    </span>
                  </td>
                  <td>
                    <b>{failFindings.length}</b> vấn đề
                  </td>
                  <td>
                    <span
                      className={`chip ${
                        failFindings.length >= 3
                          ? "bad"
                          : failFindings.length > 0
                          ? "warn"
                          : "green"
                      }`}
                    >
                      {failFindings.length >= 3
                        ? "Cao"
                        : failFindings.length > 0
                        ? "Trung bình"
                        : "Không có"}
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="button button-small"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsUrlModalOpen(true);
                      }}
                    >
                      Xem chi tiết →
                    </button>
                  </td>
                </tr> : <tr><td colSpan={5} className="empty-state">Chưa có URL hoàn tất quét.</td></tr>}
              </tbody>
            </table>
          </div>

          <div className="alert-box alert-blue" style={{ margin: 14 }}>
            <span className="alert-icon">ⓘ</span>
            <div>
              Phase 03A phân tích đúng 1 URL ở phiên hiện tại. Kết quả hiển thị đúng bằng chứng thực tế từ backend scanner an toàn, không giả lập danh sách hàng trăm URL.
            </div>
          </div>
        </section>
      )}

      {/* TAB 3: Lịch sử & so sánh */}
      {activeTab === "history" && (
        <div className="dual">
          <section className="panel panPad" aria-label="Lịch sử kiểm tra">
            <h3>Lịch sử kiểm tra</h3>
            <div className="kv" style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #edf1ed", fontSize: 13 }}>
              <span>{scanTimestamp || "Chưa lưu lịch sử"}</span>
              <b>{scanResult ? "1 lượt trong phiên hiện tại" : "Chưa có lượt quét"}</b>
            </div>
            <div className="alert-box alert-amber" style={{ marginTop: 16 }}>
              <span className="alert-icon">⚠</span>
              <div>
                Không vẽ biểu đồ thay đổi khi chưa có ít nhất hai lượt quét thật có phạm vi tương ứng.
              </div>
            </div>
          </section>

          <section className="panel panPad" aria-label="So sánh giữa các lần quét">
            <h3>So sánh giữa các lần quét</h3>
            <div className="empty-state" style={{ padding: "28px 16px" }}>
              <div className="empty-icon">◷</div>
              <h3>Chưa lưu lịch sử kiểm tra</h3>
              <p>Tính năng đối sánh lịch sử nhiều lần quét sẽ hoàn thiện ở Phase 03B.</p>
            </div>
          </section>
        </div>
      )}

      {/* Modal 1: URL Detail Modal (matches 01_Popup_URL_Nhieu_Van_De.png & Demo line 68) */}
      <Dialog
        id="url-detail-modal"
        className="dialog-wide"
        open={isUrlModalOpen}
        onClose={() => setIsUrlModalOpen(false)}
        title={
          <div className="modalTopline" style={{ width: "100%" }}>
            <div>
              <div className="kicker">WEBSITE AUDIT / CHI TIẾT URL</div>
              <h2 className="url-modal-heading">{scanResult?.finalUrl || "Chưa có kết quả quét"}</h2>
              <div className="hint">
                {scanResult ? `${scanResult.finalUrl} · Lượt quét trong phiên hiện tại` : "Chưa có bằng chứng để hiển thị."}
              </div>
            </div>
          </div>
        }
      >
        <div className="page-status-line">
          {scanResult && <span className={`chip ${scanResult.httpStatus >= 200 && scanResult.httpStatus < 400 ? "green" : "bad"}`}>HTTP {scanResult.httpStatus}</span>}
          <span className={`chip ${failFindings.length ? "bad" : "green"}`}>
            {failFindings.length} vấn đề
          </span>
          <span className="status-caption">
            Một URL có thể xuất hiện trong nhiều nhóm kiểm tra độc lập.
          </span>
        </div>

        {urlFindings.length > 0 ? (
          <>
            <div className="url-summary">
              ⚠ Phát hiện {failFindings.length} tín hiệu trên cùng URL. Mở từng mục bên dưới để xem giải thích, bằng chứng và hướng sửa.
            </div>

            {urlFindings.map((finding, idx) => (
              <details key={finding.ruleId} className="url-issue" open={idx === 0}>
                <summary>
                  <span className="ic" style={{ flex: "none" }}>
                    {finding.status === "UNKNOWN" ? "?" : finding.severity === "CRITICAL" || finding.severity === "HIGH" ? "!" : "•"}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <b>{finding.ruleName}</b>
                    <div className="status-caption">
                      {finding.category} · {finding.status === "UNKNOWN" ? "Chưa đủ dữ liệu để kết luận" : "FAIL cần người dùng đối chiếu"}
                    </div>
                  </div>
                  <span
                    className={`chip ${
                      finding.status === "UNKNOWN" ? "blue" : finding.severity === "CRITICAL" || finding.severity === "HIGH" ? "bad" : "warn"
                    }`}
                  >
                    {finding.status === "UNKNOWN" ? "Chưa xác định" : finding.severity === "CRITICAL" || finding.severity === "HIGH"
                      ? "Cao"
                      : "Trung bình"}
                  </span>
                </summary>
                <div className="body">
                  <div>{finding.description}</div>
                  <div className="url-evidence">
                    <b>Bằng chứng thực tế:</b>
                    <div style={{ marginTop: 4, fontFamily: "monospace" }}>
                      {typeof finding.evidence === "string"
                        ? finding.evidence
                        : JSON.stringify(finding.evidence)}
                    </div>
                  </div>
                  <div className="fix">
                    <b>Hướng cải thiện:</b>
                    <div style={{ marginTop: 4 }}>
                      {finding.recommendation || "Cần kiểm tra thêm trước khi đưa ra kết luận."}
                    </div>
                  </div>
                  <div style={{ marginTop: 12 }}>
                    <button
                      type="button"
                      className="button button-small"
                      onClick={() => {
                        setSelectedRuleId(finding.ruleId);
                        setFilterMode(finding.status === "UNKNOWN" ? "unknown" : "all");
                        setActiveTab("issues");
                        setIsUrlModalOpen(false);
                      }}
                    >
                      Mở vấn đề tổng thể & xác minh →
                    </button>
                  </div>
                </div>
              </details>
            ))}
          </>
        ) : (
          <div className="alert-box alert-green">
            <span className="alert-icon">✓</span>
            <div>
              {scanResult ? "Không có FAIL hoặc UNKNOWN tại URL này trong phạm vi lần quét." : "Chưa có kết quả quét cho URL này."}
            </div>
          </div>
        )}

        <div className="alert-box alert-amber" style={{ marginTop: 14 }}>
          <span className="alert-icon">⚠</span>
          <div>
            Không xác minh tự động chỉ bằng việc mở popup. Cần kiểm tra bằng chứng trên trang trước khi đưa lỗi vào đề xuất.
          </div>
        </div>

        <div className="modal-actions">
          <Button variant="quiet" onClick={() => setIsUrlModalOpen(false)}>
            Đóng
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              setIsUrlModalOpen(false);
              const firstFinding = urlFindings[0] || passFindings[0];
              setSelectedRuleId(firstFinding?.ruleId || null);
              setFilterMode(firstFinding?.status === "UNKNOWN" ? "unknown" : firstFinding?.status === "PASS" ? "pass" : "all");
              setActiveTab("issues");
            }}
          >
            Đến danh sách vấn đề →
          </Button>
        </div>
      </Dialog>

      </>
      )}

      {/* Modal 2: Target Business / Custom URL Dialog */}
      <Dialog
        id="target-select-dialog"
        open={isTargetDialogOpen}
        onClose={() => setIsTargetDialogOpen(false)}
        title="Chọn doanh nghiệp / URL để kiểm tra"
        description="Chọn từ danh sách khách hàng tiềm năng hoặc nhập URL website độc lập."
      >
        <form onSubmit={handleApplyTargetDialog} className="biz-form">
          <div className="form-field">
            <label htmlFor="modal-biz-select" className="form-label">
              Chọn doanh nghiệp có sẵn
            </label>
            <select
              id="modal-biz-select"
              className="form-select"
              value={draftBizId}
              onChange={(e) => {
                const bId = e.target.value;
                setDraftBizId(bId);
                if (bId !== "custom") {
                  const found = initialBusinesses.find((b) => b.id === bId);
                  if (found) {
                    setModalUrlInput(found.websiteUrl);
                  }
                }
              }}
            >
              {initialBusinesses.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.normalizedDomain})
                </option>
              ))}
              <option value="custom">── Nhập URL website khác ──</option>
            </select>
          </div>

          <div className="form-field">
            <label htmlFor="modal-url-input" className="form-label">
              Địa chỉ URL website <span className="req">*</span>
            </label>
            <input
              id="modal-url-input"
              type="url"
              className="form-input"
              value={modalUrlInput}
              onChange={(e) => {
                setModalUrlInput(e.target.value);
                setDraftBizId("custom");
              }}
              placeholder="https://example.com"
              required
            />
            <p className="field-hint">Chỉ chấp nhận giao thức http:// hoặc https:// hợp lệ.</p>
          </div>

          <div className="modal-actions">
            <Button variant="quiet" onClick={() => setIsTargetDialogOpen(false)}>
              Hủy
            </Button>
            <Button type="submit" variant="primary" disabled={!modalUrlInput.trim()}>
              Bắt đầu quét ngay
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

"use client";

import { useState, useTransition } from "react";
import { PageHeading, FeatureBanner, PendingBadge } from "@/components/page-foundation";
import { Button, Panel, StatCard, EmptyState, LoadingState, Badge } from "@/components/ui/primitives";
import { scanWebsiteAction } from "@/app/actions/scanner";
import type { BusinessItem } from "@/types/business";
import type { ScanResult, RuleId } from "@/types/scanner";

interface AuditClientViewProps {
  initialBusinesses: BusinessItem[];
}

export function AuditClientView({ initialBusinesses }: AuditClientViewProps) {
  const [selectedBizId, setSelectedBizId] = useState<string>(
    initialBusinesses.length > 0 ? initialBusinesses[0].id : "custom"
  );
  const [urlInput, setUrlInput] = useState<string>(
    initialBusinesses.length > 0 ? initialBusinesses[0].websiteUrl : "https://lacadanang.quangdev.id.vn"
  );
  const [isPending, startTransition] = useTransition();
  const [progressMsg, setProgressMsg] = useState<string>("");
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [scanError, setScanError] = useState<{ message: string; code?: string } | null>(null);

  // Tab & Filters
  const [activeTab, setActiveTab] = useState<"issues" | "technical">("issues");
  const [filterMode, setFilterMode] = useState<"ALL" | "FAIL" | "PASS">("ALL");
  const [selectedRuleId, setSelectedRuleId] = useState<RuleId | null>(null);
  const [verifiedMap, setVerifiedMap] = useState<Record<string, boolean>>({});

  const handleSelectBusiness = (bizId: string) => {
    setSelectedBizId(bizId);
    if (bizId === "custom") {
      return;
    }
    const found = initialBusinesses.find((b) => b.id === bizId);
    if (found) {
      setUrlInput(found.websiteUrl);
    }
  };

  const handleScan = () => {
    if (!urlInput.trim()) return;

    setScanError(null);
    setProgressMsg("Đang kiểm tra bảo mật SSRF và xác minh URL...");

    startTransition(async () => {
      try {
        setProgressMsg("Đang kết nối HTTP an toàn và tải dữ liệu trang web...");
        const res = await scanWebsiteAction(urlInput.trim());

        if (!res.success || !res.data) {
          setScanError({
            message: res.error || "Quá trình quét website thất bại.",
            code: res.code,
          });
          setProgressMsg("");
          return;
        }

        setScanResult(res.data);
        setProgressMsg("");

        // Select first issue finding by default if exists
        const firstFail = res.data.findings.find((f) => f.status === "FAIL");
        setSelectedRuleId(firstFail ? firstFail.ruleId : res.data.findings[0]?.ruleId || null);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Đã xảy ra lỗi không xác định.";
        setScanError({ message: msg });
        setProgressMsg("");
      }
    });
  };

  const selectedBiz = initialBusinesses.find((b) => b.id === selectedBizId);

  // Filtered findings
  const displayedFindings = (scanResult?.findings || []).filter((f) => {
    if (filterMode === "FAIL") return f.status === "FAIL";
    if (filterMode === "PASS") return f.status === "PASS";
    return true;
  });

  const activeFinding = scanResult?.findings.find((f) => f.ruleId === selectedRuleId) || displayedFindings[0];

  const toggleVerify = (ruleId: string) => {
    setVerifiedMap((prev) => ({
      ...prev,
      [ruleId]: !prev[ruleId],
    }));
  };

  return (
    <>
      <PageHeading
        title="Website Audit"
        description="Phát hiện vấn đề kỹ thuật có bằng chứng và xác minh trước khi đưa vào đề xuất hợp tác."
      >
        <Badge tone="green">PHASE 03A CORE</Badge>
      </PageHeading>

      <FeatureBanner
        kicker="PHÂN TÍCH · XÁC MINH · ĐỀ XUẤT"
        title="Kiểm tra website có bằng chứng kỹ thuật"
        description="Ưu tiên kết quả có thể giải thích rõ ràng cho chủ doanh nghiệp, không dùng điểm số giả lập."
      />

      {/* Target Selector & Scan Controller */}
      <div className="audit-control-card">
        <form
          className="audit-form"
          onSubmit={(e) => {
            e.preventDefault();
            handleScan();
          }}
        >
          <select
            className="audit-biz-select"
            value={selectedBizId}
            onChange={(e) => handleSelectBusiness(e.target.value)}
            disabled={isPending}
            aria-label="Chọn doanh nghiệp"
          >
            {initialBusinesses.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} ({b.normalizedDomain})
              </option>
            ))}
            <option value="custom">── Nhập URL website khác ──</option>
          </select>

          <input
            type="text"
            className="audit-url-input"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="https://example.com"
            disabled={isPending}
            required
            aria-label="Địa chỉ URL website"
          />

          <Button
            type="submit"
            variant="primary"
            disabled={isPending || !urlInput.trim()}
          >
            {isPending ? "Đang quét…" : scanResult ? "↻ Quét lại" : "⌕ Quét Website"}
          </Button>
        </form>

        {isPending && (
          <div style={{ marginTop: "14px" }}>
            <LoadingState label={progressMsg || "Đang phân tích cấu trúc website…"} />
          </div>
        )}
      </div>

      {/* Scan Error Display */}
      {scanError && (
        <div className="alert-box alert-red" style={{ marginBottom: "16px" }} role="alert">
          <span className="alert-icon">⚠</span>
          <div>
            <strong>Không thể hoàn tất lượt quét:</strong>
            <p style={{ margin: "4px 0 0" }}>{scanError.message}</p>
            {scanError.code && (
              <small style={{ color: "var(--text-secondary)" }}>
                Mã lỗi bảo mật: <code>{scanError.code}</code>
              </small>
            )}
          </div>
        </div>
      )}

      {/* Real Scan Metadata Bar */}
      {scanResult && (
        <div className="audit-meta-bar">
          <div className="audit-target-info">
            <div className="audit-target-title">
              <span>{selectedBiz ? selectedBiz.name : scanResult.targetUrl}</span>
              <a
                href={scanResult.finalUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="external-link"
                style={{ fontSize: "12px" }}
              >
                {scanResult.finalUrl} ↗
              </a>
            </div>
            <div className="audit-target-sub">
              Lượt quét: {new Date(scanResult.scannedAt).toLocaleString("vi-VN")} • Di động / Máy tính • Không chạy JavaScript
            </div>
          </div>

          <div className="audit-target-tags">
            <span
              className={`finding-status-badge ${
                scanResult.httpStatus === 200 ? "status-pass" : "status-fail"
              }`}
            >
              HTTP {scanResult.httpStatus} {scanResult.statusText}
            </span>
            <span className="chip green">
              {scanResult.responseTimeMs}ms
            </span>
            <span className="chip">
              {(scanResult.contentLength / 1024).toFixed(1)} KB
            </span>
            {scanResult.redirectCount > 0 && (
              <span className="chip bad">
                {scanResult.redirectCount} lần chuyển hướng
              </span>
            )}
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="stats">
        <StatCard
          label="Tổng tiêu chí kiểm tra"
          value={scanResult ? scanResult.summary.totalRules : null}
          note="10 chỉ số kỹ thuật thật"
        />
        <StatCard
          label="Đạt chuẩn (PASS)"
          value={scanResult ? scanResult.summary.passCount : null}
          note={scanResult ? "Hoạt động đúng chuẩn" : "Chờ kết quả"}
        />
        <StatCard
          label="Vấn đề phát hiện (FAIL)"
          value={scanResult ? scanResult.summary.failCount : null}
          note={scanResult ? "Cần đối chiếu bằng chứng" : "Chờ kết quả"}
        />
        <StatCard
          label="Đã xác minh thủ công"
          value={
            scanResult
              ? Object.values(verifiedMap).filter(Boolean).length
              : null
          }
          note="Sẵn sàng đưa vào đề xuất"
        />
      </div>

      {/* Scope Disclaimer Banner */}
      <div className="bannerMini" style={{ marginBottom: "16px" }}>
        ⓘ <span>
          <b>Phạm vi kiểm toán (Phase 03A):</b> Quét URL đơn lập có bằng chứng kỹ thuật thực tế. Chưa crawl sitemap hoặc lưu cơ sở dữ liệu Neon.
        </span>
      </div>

      {/* Navigation Tabs */}
      <div className="module-tabs">
        <button
          type="button"
          className={`module-tab ${activeTab === "issues" ? "active" : ""}`}
          onClick={() => setActiveTab("issues")}
        >
          Các vấn đề & bằng chứng {scanResult ? `(${scanResult.findings.length})` : ""}
        </button>
        <button
          type="button"
          className={`module-tab ${activeTab === "technical" ? "active" : ""}`}
          onClick={() => setActiveTab("technical")}
        >
          Chi tiết kỹ thuật & Headers
        </button>
      </div>

      {/* Content based on Active Tab */}
      {!scanResult ? (
        <div className="split">
          <Panel title="Các vấn đề & bằng chứng">
            <EmptyState
              icon="⌕"
              title="Chưa có kết quả kiểm tra website"
              description="Chọn một doanh nghiệp từ danh sách hoặc nhập địa chỉ URL được phép, sau đó nhấn 'Quét Website' để thực hiện phân tích an toàn."
            />
          </Panel>
          <Panel title="Chi tiết bằng chứng">
            <EmptyState
              icon="▤"
              title="Chưa có chi tiết để hiển thị"
              description="Nội dung thẻ HTML, mã trạng thái và đề xuất tối ưu sẽ hiển thị tại đây sau khi hoàn tất lượt quét."
            />
          </Panel>
        </div>
      ) : activeTab === "issues" ? (
        <div className="split">
          {/* Left Column: Findings List */}
          <Panel
            title="Danh sách tiêu chí kiểm tra"
            description="Chọn một mục để xem bằng chứng chi tiết trích xuất từ trang web."
          >
            {/* Filter pills */}
            <div style={{ display: "flex", gap: "8px", padding: "10px 16px", borderBottom: "1px solid var(--edge)" }}>
              <button
                type="button"
                className={`button button-small ${filterMode === "ALL" ? "button-primary" : "button-secondary"}`}
                onClick={() => setFilterMode("ALL")}
              >
                Tất cả ({scanResult.findings.length})
              </button>
              <button
                type="button"
                className={`button button-small ${filterMode === "FAIL" ? "button-primary" : "button-secondary"}`}
                onClick={() => setFilterMode("FAIL")}
              >
                Vấn đề phát hiện ({scanResult.summary.failCount})
              </button>
              <button
                type="button"
                className={`button button-small ${filterMode === "PASS" ? "button-primary" : "button-secondary"}`}
                onClick={() => setFilterMode("PASS")}
              >
                Đạt chuẩn ({scanResult.summary.passCount})
              </button>
            </div>

            <div style={{ maxHeight: "580px", overflowY: "auto" }}>
              {displayedFindings.map((finding) => {
                const isSelected = activeFinding?.ruleId === finding.ruleId;
                const isVerified = !!verifiedMap[finding.ruleId];

                return (
                  <div
                    key={finding.ruleId}
                    className={`finding-item ${isSelected ? "active" : ""}`}
                    onClick={() => setSelectedRuleId(finding.ruleId)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        setSelectedRuleId(finding.ruleId);
                      }
                    }}
                  >
                    <span
                      className={`finding-status-badge ${
                        finding.status === "PASS"
                          ? "status-pass"
                          : finding.status === "FAIL"
                          ? "status-fail"
                          : "status-unknown"
                      }`}
                    >
                      {finding.status === "PASS" ? "✓" : "✕"}
                    </span>

                    <div className="finding-content">
                      <div className="finding-title" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span>{finding.ruleName}</span>
                        <span
                          className={`severity-pill ${
                            finding.severity === "CRITICAL"
                              ? "sev-critical"
                              : finding.severity === "HIGH"
                              ? "sev-high"
                              : finding.severity === "MEDIUM"
                              ? "sev-medium"
                              : finding.severity === "LOW"
                              ? "sev-low"
                              : "sev-info"
                          }`}
                        >
                          {finding.severity}
                        </span>
                      </div>
                      <p className="finding-desc">{finding.description}</p>
                      {isVerified && (
                        <small style={{ color: "var(--green)", fontWeight: "bold" }}>
                          ✓ Đã đối chiếu bằng chứng
                        </small>
                      )}
                    </div>
                  </div>
                );
              })}

              {displayedFindings.length === 0 && (
                <div style={{ padding: "24px", textAlign: "center", color: "var(--text-secondary)" }}>
                  Không có tiêu chí nào thuộc bộ lọc này.
                </div>
              )}
            </div>
          </Panel>

          {/* Right Column: Finding Details & Evidence */}
          <Panel title="Chi tiết tiêu chí & Bằng chứng">
            {activeFinding ? (
              <div style={{ padding: "18px 20px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                  <span className="kicker">{activeFinding.category} · KIỂM TOÁN KỸ THUẬT</span>
                  <span
                    className={`finding-status-badge ${
                      activeFinding.status === "PASS"
                        ? "status-pass"
                        : activeFinding.status === "FAIL"
                        ? "status-fail"
                        : "status-unknown"
                    }`}
                  >
                    {activeFinding.status}
                  </span>
                </div>

                <h3 style={{ fontSize: "17px", fontWeight: "800", margin: "4px 0 8px" }}>
                  {activeFinding.ruleName}
                </h3>
                <p style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.5, margin: "0 0 14px" }}>
                  {activeFinding.description}
                </p>

                {/* Evidence Box */}
                <div className="evidence-card">
                  <div className="evidence-label">Bằng chứng trích xuất từ lượt quét thật</div>
                  <pre className="evidence-text">{activeFinding.evidence}</pre>
                </div>

                {/* Recommendation if Fail */}
                {activeFinding.recommendation && (
                  <div className="recommendation-card">
                    <strong>Đề xuất cải thiện kỹ thuật:</strong>
                    {activeFinding.recommendation}
                  </div>
                )}

                {/* Verification Checkbox */}
                <label className="check-verify-label">
                  <input
                    type="checkbox"
                    checked={!!verifiedMap[activeFinding.ruleId]}
                    onChange={() => toggleVerify(activeFinding.ruleId)}
                  />
                  <span>
                    Tôi đã kiểm tra đối chiếu bằng chứng này (xác minh thủ công trước khi lập đề xuất)
                  </span>
                </label>

                <div style={{ marginTop: "16px", paddingTop: "14px", borderTop: "1px solid var(--edge)" }}>
                  <small style={{ color: "var(--text-secondary)", display: "block" }}>
                    URL nguồn: <code>{activeFinding.sourceUrl}</code>
                  </small>
                  <small style={{ color: "var(--text-secondary)", display: "block" }}>
                    Thời điểm: {new Date(activeFinding.timestamp).toLocaleString("vi-VN")}
                  </small>
                </div>
              </div>
            ) : (
              <div style={{ padding: "30px", textAlign: "center", color: "var(--text-secondary)" }}>
                Chọn một tiêu chí từ danh sách bên trái để xem bằng chứng.
              </div>
            )}
          </Panel>
        </div>
      ) : (
        /* Technical Details Tab */
        <div className="stack">
          {/* Redirect Chain */}
          {scanResult.redirectChain.length > 0 && (
            <Panel title="Chuỗi chuyển hướng (Redirect Chain)">
              <div style={{ padding: "16px 20px" }}>
                <p className="hint" style={{ marginBottom: "12px" }}>
                  Website đã thực hiện {scanResult.redirectCount} lần chuyển hướng trước khi tới URL đích cuối cùng:
                </p>
                {scanResult.redirectChain.map((hop, idx) => (
                  <div key={idx} className="redirect-hop">
                    <span>[{idx + 1}] HTTP {hop.status}</span>
                    <span className="hop-arrow">→</span>
                    <span style={{ color: "var(--fg)" }}>{hop.from}</span>
                    <span className="hop-arrow">↳</span>
                    <span style={{ color: "var(--green)" }}>{hop.to}</span>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          {/* Parsed Metadata Table */}
          <Panel title="Thuộc tính thẻ HTML trích xuất">
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: "25%" }}>Thẻ HTML</th>
                    <th>Nội dung trích xuất</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>&lt;title&gt;</strong></td>
                    <td>{scanResult.pageData.title || <em>(Không có)</em>}</td>
                  </tr>
                  <tr>
                    <td><strong>&lt;meta description&gt;</strong></td>
                    <td>{scanResult.pageData.metaDescription || <em>(Không có)</em>}</td>
                  </tr>
                  <tr>
                    <td><strong>&lt;link canonical&gt;</strong></td>
                    <td>{scanResult.pageData.canonical || <em>(Không có)</em>}</td>
                  </tr>
                  <tr>
                    <td><strong>&lt;meta robots&gt;</strong></td>
                    <td>{scanResult.pageData.robotsMeta || <em>(Không có)</em>}</td>
                  </tr>
                  <tr>
                    <td><strong>&lt;meta viewport&gt;</strong></td>
                    <td>{scanResult.pageData.viewport || <em>(Không có)</em>}</td>
                  </tr>
                  <tr>
                    <td><strong>&lt;h1&gt; (Số lượng: {scanResult.pageData.h1List.length})</strong></td>
                    <td>
                      {scanResult.pageData.h1List.length > 0 ? (
                        <ul style={{ margin: 0, paddingLeft: "18px" }}>
                          {scanResult.pageData.h1List.map((h, i) => (
                            <li key={i}>{h}</li>
                          ))}
                        </ul>
                      ) : (
                        <em>(Không có)</em>
                      )}
                    </td>
                  </tr>
                  <tr>
                    <td><strong>Open Graph (og:title)</strong></td>
                    <td>{scanResult.pageData.ogTitle || <em>(Không có)</em>}</td>
                  </tr>
                  <tr>
                    <td><strong>Open Graph (og:image)</strong></td>
                    <td>{scanResult.pageData.ogImage || <em>(Không có)</em>}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Panel>

          {/* Response Headers Table */}
          <Panel title="HTTP Response Headers">
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: "30%" }}>Header</th>
                    <th>Giá trị</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(scanResult.headers).map(([key, val]) => (
                    <tr key={key}>
                      <td><code>{key}</code></td>
                      <td style={{ wordBreak: "break-all", fontFamily: "monospace", fontSize: "12px" }}>
                        {val}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      )}
    </>
  );
}

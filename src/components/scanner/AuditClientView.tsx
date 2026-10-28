"use client";

import { useState, useEffect, useRef, useCallback, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { PageHeading, FeatureBanner } from "@/components/page-foundation";
import { Button, Badge } from "@/components/ui/primitives";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { scanWebsiteAction } from "@/app/actions/scanner";
import type { BusinessItem } from "@/types/business";
import type { ScanResult, ScanFinding, RuleId } from "@/types/scanner";

interface AuditClientViewProps {
  initialBusinesses: BusinessItem[];
}

export function AuditClientView({ initialBusinesses }: AuditClientViewProps) {
  const showToast = useToast();

  // Selected business & URL state
  const defaultBiz = initialBusinesses.length > 0 ? initialBusinesses[0] : null;
  const [selectedBizId, setSelectedBizId] = useState<string>(defaultBiz ? defaultBiz.id : "custom");
  const [targetUrl, setTargetUrl] = useState<string>(
    defaultBiz?.websiteUrl || "https://lacadanang.quangdev.id.vn"
  );
  const [modalUrlInput, setModalUrlInput] = useState<string>(targetUrl);

  // Scan state
  const [isPending, startTransition] = useTransition();
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [scanError, setScanError] = useState<{ message: string; code?: string } | null>(null);
  const [scanTimestamp, setScanTimestamp] = useState<string>("");

  // Tab & Filters
  const [activeTab, setActiveTab] = useState<"issues" | "pages" | "history">("issues");
  const [filterMode, setFilterMode] = useState<"all" | "high" | "medium" | "pass">("all");
  const [selectedRuleId, setSelectedRuleId] = useState<RuleId | null>(null);
  const [verifiedMap, setVerifiedMap] = useState<Record<string, boolean>>({});

  // Modals
  const [isTargetDialogOpen, setIsTargetDialogOpen] = useState<boolean>(false);
  const [isUrlModalOpen, setIsUrlModalOpen] = useState<boolean>(false);

  // Initial scan trigger (once)
  const initialScanTriggered = useRef(false);

  const executeScan = useCallback(
    (urlToScan: string) => {
      if (!urlToScan.trim() || isPending) return;

      setScanError(null);
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

  useEffect(() => {
    if (!initialScanTriggered.current && targetUrl) {
      initialScanTriggered.current = true;
      executeScan(targetUrl);
    }
  }, [targetUrl, executeScan]);

  const currentBiz = initialBusinesses.find((b) => b.id === selectedBizId);
  const currentBizName = currentBiz?.name || "Doanh nghiệp tùy chọn";
  const currentBizCity = currentBiz?.city || "Đà Nẵng";

  // Categorize findings
  const allFindings = scanResult?.findings || [];
  const failFindings = allFindings.filter((f) => f.status === "FAIL");
  const passFindings = allFindings.filter((f) => f.status === "PASS");

  const highCount = failFindings.filter(
    (f) => f.severity === "CRITICAL" || f.severity === "HIGH"
  ).length;
  const medCount = failFindings.filter((f) => f.severity === "MEDIUM").length;
  const verifiedCount = Object.values(verifiedMap).filter(Boolean).length;

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
    return true;
  });

  const activeFinding: ScanFinding | undefined =
    allFindings.find((f) => f.ruleId === selectedRuleId) ||
    displayedFindings[0] ||
    allFindings[0];

  const isCurrentActiveVerified = activeFinding ? Boolean(verifiedMap[activeFinding.ruleId]) : false;

  const toggleVerify = (ruleId: string) => {
    setVerifiedMap((prev) => {
      const nextVal = !prev[ruleId];
      showToast(nextVal ? "Đã ghi nhận xác minh (phiên làm việc hiện tại)." : "Đã hủy xác minh.");
      return {
        ...prev,
        [ruleId]: nextVal,
      };
    });
  };

  const handleAddToOutreach = () => {
    showToast("Đã thêm vấn đề vào danh sách đề xuất tiếp cận (phiên làm việc).");
  };

  const handleApplyTargetDialog = (e: FormEvent) => {
    e.preventDefault();
    setIsTargetDialogOpen(false);
    if (selectedBizId !== "custom") {
      const found = initialBusinesses.find((b) => b.id === selectedBizId);
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
          className="button"
          onClick={() => executeScan(targetUrl)}
          disabled={isPending || !targetUrl.trim()}
          aria-label="Quét lại website"
        >
          {isPending ? "Đang quét…" : "↻ Quét lại"}
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
            {scanTimestamp ? (
              <>
                Lượt quét: {scanTimestamp} • HTTP {scanResult?.httpStatus || 200} • Safe Fetcher (OWASP SSRF Protected)
              </>
            ) : isPending ? (
              "Đang kết nối và kiểm tra bảo mật…"
            ) : (
              "Sẵn sàng quét website"
            )}
          </div>
        </div>
        <div className="actions" style={{ flexShrink: 0 }}>
          <button
            type="button"
            className="button button-small"
            onClick={() => {
              setModalUrlInput(targetUrl);
              setIsTargetDialogOpen(true);
            }}
          >
            Đổi doanh nghiệp / URL
          </button>
          {isPending ? (
            <Badge tone="amber">ĐANG PHÂN TÍCH</Badge>
          ) : scanResult ? (
            <Badge tone="green">ĐÃ QUÉT XONG</Badge>
          ) : (
            <Badge tone="blue">CHƯA QUÉT</Badge>
          )}
        </div>
      </div>

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
            {failFindings.length}
          </div>
          <div className="stat-note">Vấn đề phát hiện thực tế</div>
        </div>

        <div className="stat">
          <div className="stat-label">Đã xác minh</div>
          <div className="stat-value" style={{ color: "#00765a" }}>
            {verifiedCount}
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
      <div className="tabs" role="tablist" aria-label="Các mục kiểm tra website">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "issues"}
          className={`tab ${activeTab === "issues" ? "on" : ""}`}
          onClick={() => setActiveTab("issues")}
        >
          Các vấn đề & bằng chứng {failFindings.length > 0 && `(${failFindings.length})`}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "pages"}
          className={`tab ${activeTab === "pages" ? "on" : ""}`}
          onClick={() => setActiveTab("pages")}
        >
          URL đã quét (1)
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "history"}
          className={`tab ${activeTab === "history" ? "on" : ""}`}
          onClick={() => setActiveTab("history")}
        >
          Lịch sử & so sánh
        </button>
      </div>

      {/* TAB 1: Các vấn đề & bằng chứng (Issue-first SEO Layout) */}
      {activeTab === "issues" && (
        <div className="split">
          {/* Left Column: Issue List */}
          <section className="panel" aria-label="Danh sách vấn đề">
            <div className="panelHead" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <h3>Vấn đề cần ưu tiên xử lý</h3>
                <p className="hint">Chọn một mục để kiểm tra phạm vi và hướng dẫn.</p>
              </div>
              <select
                className="form-select"
                style={{ width: "auto", minWidth: 150 }}
                value={filterMode}
                onChange={(e) => setFilterMode(e.target.value as "all" | "high" | "medium" | "pass")}
                aria-label="Lọc mức độ vấn đề"
              >
                <option value="all">Tất cả vấn đề ({failFindings.length})</option>
                <option value="high">Mức cao ({highCount})</option>
                <option value="medium">Trung bình ({medCount})</option>
                <option value="pass">Đạt chuẩn ({passFindings.length})</option>
              </select>
            </div>

            {displayedFindings.length === 0 ? (
              <div className="empty-state" style={{ padding: "36px 20px" }}>
                <div className="empty-icon">✓</div>
                <h3>Chưa phát hiện vấn đề</h3>
                <p>
                  Chưa phát hiện vấn đề trong phạm vi 10 nhóm kiểm tra kỹ thuật của URL này. Kết quả chưa bao gồm toàn bộ website, PageSpeed hoặc phân tích nhiều URL.
                </p>
                <div className="actions" style={{ justifyContent: "center", marginTop: 16 }}>
                  <button
                    type="button"
                    className="button button-small"
                    onClick={() => setFilterMode("pass")}
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
                      <span className="ic" aria-hidden="true">
                        {isPass ? "✓" : isHigh ? "!" : "•"}
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <strong>{finding.ruleName}</strong>
                        <small>{finding.description}</small>
                      </div>
                      <b style={{ fontSize: 12 }}>1 URL</b>
                      <span className="hideMob">
                        <span
                          className={`chip ${
                            isPass ? "green" : isHigh ? "bad" : "warn"
                          }`}
                        >
                          {isPass ? "Đạt chuẩn" : isHigh ? "Cao" : "Trung bình"}
                        </span>
                      </span>
                      <span className="hideMob">
                        <span className={`chip ${isVerified ? "green" : "warn"}`}>
                          {isVerified ? "Đã xác minh" : "Chưa xác minh"}
                        </span>
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
                    <strong>{targetUrl} (1 trang)</strong>
                  </div>
                  <div className="evrow">
                    <span>Mức độ ưu tiên</span>
                    <strong>
                      {activeFinding.severity === "CRITICAL" || activeFinding.severity === "HIGH"
                        ? "Mức cao"
                        : activeFinding.severity === "MEDIUM"
                        ? "Trung bình"
                        : "Thông tin / Đạt chuẩn"}
                    </strong>
                  </div>
                  <div className="evrow">
                    <span>Trạng thái kiểm tra</span>
                    <strong>{activeFinding.status === "FAIL" ? "Phát hiện vấn đề" : "Đạt chuẩn"}</strong>
                  </div>

                  <div className="divider" />

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
                    disabled={!isCurrentActiveVerified}
                    onClick={handleAddToOutreach}
                  >
                    ＋ Đưa vào đề xuất
                  </button>
                </div>

                <p className="hint" style={{ marginTop: 14 }}>
                  Hệ thống thật sẽ lưu người xác minh, thời điểm và URL bằng chứng ở Phase 03B/04.
                </p>
              </>
            ) : (
              <div className="empty-state">
                <p>Chọn một vấn đề ở danh sách bên trái để xem bằng chứng chi tiết.</p>
              </div>
            )}
          </section>
        </div>
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
                <tr
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
                        {targetUrl}
                      </button>
                      <span style={{ color: "#80a394" }} aria-hidden="true">↗</span>
                    </div>
                  </td>
                  <td>
                    <span className={`chip ${scanResult?.httpStatus === 200 ? "green" : "bad"}`}>
                      {scanResult?.httpStatus || 200}
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
                </tr>
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
              <span>{scanTimestamp || "Chưa quét"}</span>
              <b>1 lượt quét thực tế (Phase 03A)</b>
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
              <h2 className="url-modal-heading">{targetUrl}</h2>
              <div className="hint">
                {targetUrl} · Lượt quét thực tế • Phase 03A
              </div>
            </div>
          </div>
        }
      >
        <div className="page-status-line">
          <span className={`chip ${scanResult?.httpStatus === 200 ? "green" : "bad"}`}>
            HTTP {scanResult?.httpStatus || 200}
          </span>
          <span className={`chip ${failFindings.length ? "bad" : "green"}`}>
            {failFindings.length} vấn đề
          </span>
          <span className="status-caption">
            Một URL có thể xuất hiện trong nhiều nhóm kiểm tra độc lập.
          </span>
        </div>

        {failFindings.length > 0 ? (
          <>
            <div className="url-summary">
              ⚠ Phát hiện {failFindings.length} tín hiệu trên cùng URL. Mở từng mục bên dưới để xem giải thích, bằng chứng và hướng sửa.
            </div>

            {failFindings.map((finding, idx) => (
              <details key={finding.ruleId} className="url-issue" open={idx === 0}>
                <summary>
                  <span className="ic" style={{ flex: "none" }}>
                    {finding.severity === "CRITICAL" || finding.severity === "HIGH" ? "!" : "•"}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <b>{finding.ruleName}</b>
                    <div className="status-caption">
                      {finding.category} · Tín hiệu cần đối chiếu tại URL
                    </div>
                  </div>
                  <span
                    className={`chip ${
                      finding.severity === "CRITICAL" || finding.severity === "HIGH" ? "bad" : "warn"
                    }`}
                  >
                    {finding.severity === "CRITICAL" || finding.severity === "HIGH"
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
                      {finding.recommendation || "Tiếp tục duy trì cấu hình hiện tại."}
                    </div>
                  </div>
                  <div style={{ marginTop: 12 }}>
                    <button
                      type="button"
                      className="button button-small"
                      onClick={() => {
                        setSelectedRuleId(finding.ruleId);
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
              Chưa phát hiện tín hiệu bất thường trong phạm vi 10 nhóm kiểm tra kỹ thuật của URL này.
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
              setActiveTab("issues");
            }}
          >
            Đến danh sách vấn đề →
          </Button>
        </div>
      </Dialog>

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
              value={selectedBizId}
              onChange={(e) => {
                const bId = e.target.value;
                setSelectedBizId(bId);
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
                setSelectedBizId("custom");
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

"use client";

import { useRef, useState, type FormEvent } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Badge, Button } from "@/components/ui/primitives";
import { Tabs } from "@/components/ui/tabs";
import { aggregateCrawlFindings } from "@/lib/scanner/crawl-findings";
import type { CrawlFinding, CrawlProgress, CrawlResult, CrawlStreamEvent, CrawlUrlResult } from "@/types/scanner";

type CrawlTab = "issues" | "pages" | "history";
type CrawlRunState = "idle" | "running" | "completed" | "partial" | "cancelled" | "failed";
type FindingFilter = "all" | "fail" | "review" | "unknown" | "pass";
const PAGE_SIZE = 10;

function statusText(status: CrawlRunState): string {
  switch (status) {
    case "running": return "ĐANG QUÉT";
    case "completed": return "HOÀN TẤT";
    case "partial": return "KẾT QUẢ MỘT PHẦN";
    case "cancelled": return "ĐÃ HỦY";
    case "failed": return "QUÉT THẤT BẠI";
    default: return "CHƯA QUÉT";
  }
}

function statusTone(status: CrawlRunState): "neutral" | "green" | "amber" | "red" | "blue" {
  if (status === "completed") return "green";
  if (status === "running" || status === "partial" || status === "cancelled") return "amber";
  if (status === "failed") return "red";
  return "blue";
}

function findingStatusLabel(status: CrawlFinding["status"]): string {
  if (status === "FAIL") return "FAIL · có bằng chứng";
  if (status === "REVIEW_REQUIRED") return "Cần người xem xét";
  if (status === "UNKNOWN") return "Chưa đủ dữ liệu";
  return "Đạt kiểm tra";
}

function upsertRows(rows: CrawlUrlResult[], incoming: CrawlUrlResult): CrawlUrlResult[] {
  const next = rows.filter((row) => row.url !== incoming.url);
  next.push(incoming);
  return next.sort((left, right) => left.depth - right.depth || left.url.localeCompare(right.url));
}

export function MultiUrlAuditPanel({ initialUrl, onUrlChange, onRunningChange }: { initialUrl: string; onUrlChange: (url: string) => void; onRunningChange: (running: boolean) => void }) {
  const [rootUrl, setRootUrl] = useState(initialUrl);
  const [urlLimit, setUrlLimit] = useState("5");
  const [runState, setRunState] = useState<CrawlRunState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [rows, setRows] = useState<CrawlUrlResult[]>([]);
  const [crawlResult, setCrawlResult] = useState<CrawlResult | null>(null);
  const [progress, setProgress] = useState<CrawlProgress | null>(null);
  const [activeTab, setActiveTab] = useState<CrawlTab>("issues");
  const [filter, setFilter] = useState<FindingFilter>("all");
  const [selectedFindingId, setSelectedFindingId] = useState("");
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const abortRef = useRef<AbortController | null>(null);

  const activeRows = crawlResult?.urlResults ?? rows;
  const allFindings = crawlResult?.findings ?? aggregateCrawlFindings(activeRows);
  const failCount = allFindings.filter((finding) => finding.status === "FAIL").length;
  const reviewCount = allFindings.filter((finding) => finding.status === "REVIEW_REQUIRED").length;
  const visibleFindings = allFindings.filter((finding) => {
    if (filter === "all") return finding.status !== "PASS";
    if (filter === "fail") return finding.status === "FAIL";
    if (filter === "review") return finding.status === "REVIEW_REQUIRED";
    if (filter === "unknown") return finding.status === "UNKNOWN";
    return finding.status === "PASS";
  });
  const activeFinding = visibleFindings.find((finding) => finding.id === selectedFindingId)
    ?? visibleFindings[0]
    ?? null;
  const pageCount = Math.max(1, Math.ceil(activeRows.length / PAGE_SIZE));
  const visibleRows = activeRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const selectedPage = selectedUrl ? activeRows.find((row) => row.url === selectedUrl) ?? null : null;
  const progressLimit = progress?.limit ?? (Number(urlLimit) || 5);
  const progressValue = Math.min(progress?.completed ?? activeRows.length, progressLimit);

  const updateRootUrl = (value: string) => {
    setRootUrl(value);
    onUrlChange(value);
    setRows([]);
    setCrawlResult(null);
    setProgress(null);
    setErrorMessage("");
    setRunState("idle");
    setSelectedFindingId("");
    setPage(1);
  };

  const handleEvent = (event: CrawlStreamEvent) => {
    if (event.type === "progress") {
      setProgress(event.progress);
      return;
    }
    if (event.type === "url") {
      setRows((current) => upsertRows(current, event.url));
      return;
    }
    if (event.type === "complete") {
      setCrawlResult(event.result);
      setRows(event.result.urlResults);
      setProgress(event.result.progress);
      setRunState(event.result.status === "COMPLETED" ? "completed" : event.result.status === "CANCELLED" ? "cancelled" : event.result.status === "FAILED" ? "failed" : "partial");
      return;
    }
    setErrorMessage(`${event.error.code}: ${event.error.message}`);
    setRunState("failed");
  };

  const startCrawl = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (runState === "running" || !rootUrl.trim()) return;
    const requestedLimit = Number(urlLimit);
    if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 20) {
      setErrorMessage("Số URL phải là số nguyên từ 1 đến 20.");
      setRunState("failed");
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    onRunningChange(true);
    setRunState("running");
    setErrorMessage("");
    setRows([]);
    setCrawlResult(null);
    setSelectedFindingId("");
    setSelectedUrl(null);
    setPage(1);
    setProgress({ phase: "ROBOTS", discovered: 0, attempted: 0, completed: 0, failed: 0, limit: requestedLimit });

    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    let receivedComplete = false;
    let receivedError = false;
    let receivedRow = false;
    try {
      const response = await fetch("/api/scanner/crawl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: rootUrl.trim(), maxUrls: requestedLimit }),
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string; code?: string } | null;
        throw new Error(`${body?.code ? `${body.code}: ` : ""}${body?.error || `Máy chủ trả HTTP ${response.status}.`}`);
      }
      if (!response.body) throw new Error("Máy chủ không mở luồng kết quả.");
      reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (line.trim().length === 0) continue;
          const parsed = JSON.parse(line) as CrawlStreamEvent;
          if (parsed.type === "complete") receivedComplete = true;
          if (parsed.type === "url") receivedRow = true;
          if (parsed.type === "error") receivedError = true;
          handleEvent(parsed);
        }
      }
      buffer += decoder.decode();
      if (buffer.trim()) {
        const parsed = JSON.parse(buffer) as CrawlStreamEvent;
        if (parsed.type === "complete") receivedComplete = true;
        if (parsed.type === "url") receivedRow = true;
        if (parsed.type === "error") receivedError = true;
        handleEvent(parsed);
      }
      if (!receivedComplete && !receivedError && !controller.signal.aborted) {
        setErrorMessage("Luồng kết quả đóng trước khi máy chủ gửi tổng kết. Các URL đã nhận vẫn được giữ lại.");
        setRunState(receivedRow ? "partial" : "failed");
      }
    } catch (error) {
      if (controller.signal.aborted) {
        setRunState("cancelled");
      } else {
        const message = error instanceof Error ? error.message : "Không thể đọc kết quả crawl.";
        setErrorMessage(message);
        setRunState(receivedRow ? "partial" : "failed");
      }
    } finally {
      reader?.releaseLock();
      if (abortRef.current === controller) abortRef.current = null;
      onRunningChange(false);
    }
  };

  const cancelCrawl = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setRunState("cancelled");
  };

  return (
    <section className="multi-audit" aria-label="Kiểm toán nhiều URL">
      <div className="panel panPad multi-audit-controls">
        <div className="multi-audit-controls-copy">
          <strong>Quét nhiều URL cùng host</strong>
          <Badge tone={statusTone(runState)}>{statusText(runState)}</Badge>
          <p>Thu thập robots.txt, sitemap giới hạn và liên kết nội bộ. Chạy tối đa 20 URL, không lưu dữ liệu.</p>
        </div>
        <form className="multi-audit-form" onSubmit={startCrawl}>
          <label className="form-field multi-audit-url">
            <span className="form-label">URL gốc</span>
            <input
              className="form-input"
              type="url"
              required
              value={rootUrl}
              onChange={(event) => updateRootUrl(event.target.value)}
              placeholder="https://example.com"
              disabled={runState === "running"}
              aria-label="URL gốc cho kiểm toán nhiều URL"
            />
          </label>
          <label className="form-field multi-audit-limit">
            <span className="form-label">Giới hạn URL</span>
            <input
              className="form-input"
              type="number"
              inputMode="numeric"
              min={1}
              max={20}
              step={1}
              value={urlLimit}
              onChange={(event) => setUrlLimit(event.target.value)}
              disabled={runState === "running"}
              aria-label="Giới hạn số URL"
            />
          </label>
          {runState === "running" ? (
            <Button variant="danger" type="button" onClick={cancelCrawl}>Hủy crawl</Button>
          ) : (
            <Button variant="primary" type="submit">Bắt đầu crawl</Button>
          )}
        </form>
      </div>

      <div className="stats multi-audit-stats">
        <div className="stat"><div className="stat-label">URL đã nhận kết quả</div><div className="stat-value">{activeRows.length}</div><div className="stat-note">{progress?.limit ?? (Number(urlLimit) || 5)} URL tối đa</div></div>
        <div className="stat"><div className="stat-label">Nhóm lỗi có bằng chứng</div><div className="stat-value multi-value-danger">{failCount}</div><div className="stat-note">HTTP và rule fail</div></div>
        <div className="stat"><div className="stat-label">Cần người xem xét</div><div className="stat-value multi-value-review">{reviewCount}</div><div className="stat-note">Heuristic hoặc dữ liệu cần xác nhận</div></div>
        <div className="stat"><div className="stat-label">URL tải thành công</div><div className="stat-value">{crawlResult?.successfulUrlCount ?? activeRows.filter((row) => row.status === "SCANNED" && (row.httpStatus ?? 0) < 400).length}</div><div className="stat-note">Không tạo điểm SEO tổng hợp</div></div>
      </div>

      <div className="bannerMini multi-audit-notice">
        <span aria-hidden="true" style={{ fontWeight: "bold", fontSize: 14 }}>ⓘ</span>
        <span>Dev-only. Phạm vi có giới hạn: tối đa 20 URL, độ sâu 3, 2 request đồng thời và khoảng nghỉ theo host. So sánh title/meta, lỗi liên kết nội bộ và các dấu hiệu heuristic cần người xem xét. Không chạy PageSpeed, không ghi lịch sử.</span>
      </div>

      {runState === "running" && (
        <div className="panel panPad multi-progress" role="status" aria-live="polite">
          <div className="row space">
            <strong>{progress?.phase === "ROBOTS" ? "Đang đọc robots.txt" : progress?.phase === "SITEMAP" ? "Đang đọc sitemap giới hạn" : progress?.phase === "AGGREGATE" ? "Đang tổng hợp kết quả" : "Đang kiểm tra URL"}</strong>
            <span>{progress?.completed ?? activeRows.length}/{progress?.limit ?? (Number(urlLimit) || 5)}</span>
          </div>
          <progress max={progressLimit} value={progressValue} aria-label="Tiến độ kiểm tra URL" />
          <p className="hint">{progress?.currentUrl || "Đang chuẩn bị phạm vi crawl"} · Đã phát hiện {progress?.discovered ?? 0}, đã thử {progress?.attempted ?? 0}, lỗi {progress?.failed ?? 0}</p>
        </div>
      )}

      {errorMessage && <div className="alert-box alert-red multi-audit-error" role="alert"><span className="alert-icon">⚠</span><div>{errorMessage}</div></div>}
      {runState === "cancelled" && <div className="alert-box alert-amber multi-audit-error" role="status"><span className="alert-icon">Ⅱ</span><div>Đã dừng theo yêu cầu. Giữ lại {activeRows.length} URL đã nhận được; kết quả có thể chưa được tổng hợp đầy đủ.</div></div>}
      {runState === "partial" && crawlResult && <div className="alert-box alert-amber multi-audit-error" role="status"><span className="alert-icon">ⓘ</span><div>Crawl kết thúc một phần{crawlResult.stopReason ? ` (${crawlResult.stopReason})` : ""}. Các URL đã hoàn thành vẫn có thể xem bên dưới.</div></div>}

      <Tabs label="Kết quả kiểm toán nhiều URL" value={activeTab} onChange={setActiveTab} items={[
        { value: "issues", label: `Vấn đề & bằng chứng (${allFindings.filter((finding) => finding.status !== "PASS").length})` },
        { value: "pages", label: `URL đã quét (${activeRows.length})` },
        { value: "history", label: "Lịch sử" },
      ]} />

      {activeTab === "issues" && (
        activeRows.length === 0 ? (
          <section className="panel panPad multi-empty" aria-label="Kết quả kiểm toán nhiều URL">
            <div className="empty-icon">◷</div>
            <h2>{runState === "failed" ? "Chưa có kết quả crawl" : "Chưa quét website"}</h2>
            <p>{runState === "failed" ? "Kiểm tra URL hoặc môi trường rồi thử lại. Chưa có kết quả nên không thể kết luận website có vấn đề." : "Nhập URL gốc và chọn phạm vi tối đa. Crawl chỉ bắt đầu sau khi bạn bấm nút."}</p>
          </section>
        ) : (
          <div className="split multi-issue-layout">
            <section className="panel" aria-label="Nhóm vấn đề nhiều URL">
              <div className="panelHead">
                <div><h3>Nhóm tín hiệu theo rule</h3><p className="hint">Chọn một nhóm để xem đúng các URL bị ảnh hưởng.</p></div>
                <select className="form-select multi-filter" value={filter} onChange={(event) => setFilter(event.target.value as FindingFilter)} aria-label="Lọc nhóm tín hiệu">
                  <option value="all">Lỗi + cần xem</option>
                  <option value="fail">Lỗi ({failCount})</option>
                  <option value="review">Cần xem ({reviewCount})</option>
                  <option value="unknown">Chưa đủ dữ liệu</option>
                  <option value="pass">Đạt kiểm tra</option>
                </select>
              </div>
              {visibleFindings.length === 0 ? (
                <div className="empty-state multi-empty-compact"><div className="empty-icon">✓</div><h3>Không có nhóm trong bộ lọc này</h3><p>Chuyển bộ lọc để xem trạng thái khác.</p></div>
              ) : visibleFindings.map((finding) => (
                <button
                  type="button"
                  key={finding.id}
                  className={`multi-finding-row ${activeFinding?.id === finding.id ? "is-selected" : ""}`}
                  onClick={() => setSelectedFindingId(finding.id)}
                  aria-pressed={activeFinding?.id === finding.id}
                >
                  <span className={`multi-finding-icon ${finding.status.toLowerCase()}`} aria-hidden="true">{finding.status === "FAIL" ? "!" : finding.status === "PASS" ? "✓" : finding.status === "UNKNOWN" ? "?" : "•"}</span>
                  <span className="multi-finding-copy"><strong>{finding.ruleName}</strong><small>{finding.description}</small></span>
                  <span className="multi-finding-count">{finding.affectedUrls.length} URL</span>
                  <span className="multi-finding-meta"><small>{finding.severity}</small><Badge tone={finding.status === "FAIL" ? "red" : finding.status === "PASS" ? "green" : finding.status === "UNKNOWN" ? "blue" : "amber"}>{findingStatusLabel(finding.status)}</Badge></span>
                </button>
              ))}
            </section>

            <section className="panel panPad detail multi-finding-detail" aria-label="Bằng chứng nhóm được chọn">
              {activeFinding ? (
                <>
                  <span className="kicker">{activeFinding.category} · {activeFinding.severity}</span>
                  <h2>{activeFinding.ruleName}</h2>
                  <p>{activeFinding.description}</p>
                  <div className="url-evidence"><b>Bằng chứng nhóm</b><div>{activeFinding.evidence}</div></div>
                  <div className="fix"><b>Khuyến nghị</b><div>{activeFinding.recommendation || "Đối chiếu dữ liệu trước khi thay đổi."}</div></div>
                  <h3 className="miniTitle">URL bị ảnh hưởng ({activeFinding.affectedUrls.length})</h3>
                  <ul className="multi-affected-list">
                    {activeFinding.affectedUrls.map((affected) => (
                      <li key={affected.url}>
                        <button type="button" className="linkbutton" onClick={() => setSelectedUrl(affected.url)}>{affected.url}</button>
                        <div className="multi-affected-evidence">{affected.evidence}</div>
                      </li>
                    ))}
                  </ul>
                </>
              ) : <p>Chọn nhóm bên trái để xem bằng chứng.</p>}
            </section>
          </div>
        )
      )}

      {activeTab === "pages" && (
        <section className="panel multi-pages-panel" aria-label="Danh sách URL đã quét">
          <div className="panelHead"><div><h3>Kết quả theo URL</h3><p className="hint">Mỗi trang có thể có nhiều finding; mở URL để xem toàn bộ bằng chứng gắn với trang đó.</p></div><span className="status-caption">{activeRows.length} URL nhận được</span></div>
          {activeRows.length === 0 ? (
            <div className="empty-state multi-empty-compact"><div className="empty-icon">◷</div><h3>Chưa có URL để hiển thị</h3><p>Kết quả sẽ xuất hiện khi crawl bắt đầu.</p></div>
          ) : (
            <>
              <div className="multi-table-scroll">
                <table className="table multi-url-table">
                  <thead><tr><th>URL</th><th>HTTP</th><th>Trạng thái</th><th>Độ sâu</th><th>Finding</th><th></th></tr></thead>
                  <tbody>{visibleRows.map((row) => (
                    <tr key={row.url}>
                      <td><span className="multi-table-url">{row.url}</span></td>
                      <td>{row.httpStatus ? <span className={`chip ${row.httpStatus < 400 ? "green" : "bad"}`}>HTTP {row.httpStatus}</span> : "—"}</td>
                      <td>{row.status === "SCANNED" ? "Đã quét" : "Không tải được"}</td>
                      <td>{row.depth}</td>
                      <td>{row.findings.length}</td>
                      <td><button type="button" className="linkbutton" onClick={() => setSelectedUrl(row.url)}>Chi tiết</button></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              <div className="multi-pagination" aria-label="Phân trang URL">
                <span>Trang {Math.min(page, pageCount)} / {pageCount} · Tối đa {PAGE_SIZE} URL mỗi trang</span>
                <div className="actions">
                  <Button small onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1}>Trước</Button>
                  <Button small onClick={() => setPage((current) => Math.min(pageCount, current + 1))} disabled={page >= pageCount}>Tiếp</Button>
                </div>
              </div>
            </>
          )}
        </section>
      )}

      {activeTab === "history" && (
        <section className="panel panPad" aria-label="Lịch sử kiểm toán nhiều URL">
          <div className="empty-state multi-history"><div className="empty-icon">◷</div><h3>Chưa lưu lịch sử kiểm toán</h3><p>Kết quả Phase 03B.1 chỉ tồn tại trong phiên hiện tại. Không có lịch sử hay so sánh giả lập.</p></div>
        </section>
      )}

      <Dialog
        id="multi-url-detail-modal"
        className="dialog-wide"
        open={selectedUrl !== null}
        onClose={() => setSelectedUrl(null)}
        title={<div className="modalTopline"><div><div className="kicker">WEBSITE AUDIT / CHI TIẾT URL</div><h2 className="url-modal-heading">{selectedPage?.url || selectedUrl || ""}</h2><div className="hint">{selectedPage ? `Độ sâu ${selectedPage.depth} · Nhận ${selectedPage.findings.length} finding trong lần crawl này` : "Đang tìm kết quả URL."}</div></div></div>}
        description="Bằng chứng trong popup chỉ gồm các finding được gắn với URL này."
      >
        {selectedPage ? (
          <>
            <div className="page-status-line">
              <span className={`chip ${selectedPage.httpStatus && selectedPage.httpStatus < 400 ? "green" : "bad"}`}>{selectedPage.httpStatus ? `HTTP ${selectedPage.httpStatus}` : selectedPage.status}</span>
              <span className="chip blue">{selectedPage.depth === 0 ? "URL gốc" : `Độ sâu ${selectedPage.depth}`}</span>
              <span className="status-caption">Đã quét lúc {new Date(selectedPage.scannedAt).toLocaleString("vi-VN")}</span>
            </div>
            {selectedPage.findings.length ? selectedPage.findings.map((finding, index) => (
              <details key={`${finding.ruleId}-${index}`} className="url-issue" open={index === 0}>
                <summary><span className="ic" aria-hidden="true">{finding.status === "FAIL" ? "!" : finding.status === "UNKNOWN" ? "?" : finding.status === "PASS" ? "✓" : "•"}</span><div style={{ flex: 1, minWidth: 0 }}><b>{finding.ruleName}</b><div className="status-caption">{finding.category} · {findingStatusLabel(finding.status)}</div></div><Badge tone={finding.status === "FAIL" ? "red" : finding.status === "PASS" ? "green" : finding.status === "UNKNOWN" ? "blue" : "amber"}>{finding.severity}</Badge></summary>
                <div className="body"><p>{finding.description}</p><div className="url-evidence"><b>Bằng chứng</b><div>{finding.evidence}</div></div><div className="fix"><b>Khuyến nghị</b><div>{finding.recommendation || "Đối chiếu bằng chứng trước khi thay đổi."}</div></div><div className="status-caption">Nguồn: {finding.sourceUrl} · {new Date(finding.timestamp).toLocaleString("vi-VN")}</div></div>
              </details>
            )) : <div className="alert-box alert-green"><span className="alert-icon">✓</span><div>Không có finding gắn với URL này trong dữ liệu crawl hiện tại.</div></div>}
            {selectedPage.failureMessage && <div className="alert-box alert-amber" role="status">{selectedPage.failureCode}: {selectedPage.failureMessage}</div>}
            <div className="modal-actions"><Button variant="quiet" onClick={() => setSelectedUrl(null)}>Đóng</Button><Button variant="primary" onClick={() => { setSelectedUrl(null); setActiveTab("pages"); }}>Trở lại danh sách URL</Button></div>
          </>
        ) : <p className="status-caption">URL này chưa có kết quả trong phiên crawl.</p>}
      </Dialog>
    </section>
  );
}

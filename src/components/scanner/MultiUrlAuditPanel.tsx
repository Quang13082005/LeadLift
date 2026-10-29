"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Badge, Button } from "@/components/ui/primitives";
import { Tabs } from "@/components/ui/tabs";
import { actionableUrlFindings, aggregateCrawlFindings, uniqueAffectedUrls } from "@/lib/scanner/crawl-findings";
import type { CrawlFinding, CrawlProgress, CrawlResult, CrawlStreamEvent, CrawlUrlResult } from "@/types/scanner";

type CrawlTab = "issues" | "pages" | "history";
type CrawlRunState = "idle" | "running" | "completed" | "partial" | "cancelled" | "failed";
type FindingFilter = "all" | "fail" | "review";
const PAGE_SIZE = 10;
const SCOPE_OPTIONS = [20, 50, 100] as const;

function statusText(status: CrawlRunState): string {
  switch (status) {
    case "running": return "Đang quét";
    case "completed": return "Hoàn tất";
    case "partial": return "Một phần";
    case "cancelled": return "Đã hủy";
    case "failed": return "Thất bại";
    default: return "Chưa quét";
  }
}

function statusTone(status: CrawlRunState): "neutral" | "green" | "amber" | "red" | "blue" {
  if (status === "completed") return "green";
  if (status === "running" || status === "partial" || status === "cancelled") return "amber";
  if (status === "failed") return "red";
  return "blue";
}

function detectionMethod(finding: CrawlFinding): string {
  if (finding.ruleId === "HTTP_STATUS") return "Đọc mã phản hồi HTTP của URL đã quét.";
  if (finding.ruleId === "SEO_TITLE_DUPLICATE" || finding.ruleId === "SEO_META_DESCRIPTION_DUPLICATE") return "So sánh nội dung title hoặc meta description giữa các URL cùng hostname đã quét.";
  if (finding.ruleId === "SEO_BROKEN_INTERNAL_LINK") return "Đối chiếu liên kết nội bộ với mã HTTP của URL đích trong phạm vi crawl.";
  return "Phân tích HTML đã tải theo tiêu chí tương ứng; với tín hiệu cần xem xét, kết quả không tự đưa ra kết luận thay người dùng.";
}

function compactUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname || "/"}${parsed.search}`;
  } catch {
    return url;
  }
}

function affectedUrlCount(finding: CrawlFinding): number {
  return uniqueAffectedUrls(finding.affectedUrls).length;
}

function upsertRows(rows: CrawlUrlResult[], incoming: CrawlUrlResult): CrawlUrlResult[] {
  const next = rows.filter((row) => row.url !== incoming.url);
  next.push(incoming);
  return next.sort((left, right) => left.depth - right.depth || left.url.localeCompare(right.url));
}

export function MultiUrlAuditPanel({ initialUrl, onRunningChange, onRun }: { initialUrl: string; onRunningChange: (running: boolean) => void; onRun: () => void }) {
  const rootUrl = initialUrl;
  const [urlLimit, setUrlLimit] = useState("100");
  const [scopeOpen, setScopeOpen] = useState(false);
  const [runState, setRunState] = useState<CrawlRunState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [rows, setRows] = useState<CrawlUrlResult[]>([]);
  const [crawlResult, setCrawlResult] = useState<CrawlResult | null>(null);
  const [progress, setProgress] = useState<CrawlProgress | null>(null);
  const [activeTab, setActiveTab] = useState<CrawlTab>("issues");
  const [filter, setFilter] = useState<FindingFilter>("all");
  const [selectedFindingId, setSelectedFindingId] = useState("");
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  const [focusedUrl, setFocusedUrl] = useState<string | null>(null);
  const [urlNavigationMessage, setUrlNavigationMessage] = useState("");
  const [page, setPage] = useState(1);
  const [acknowledged, setAcknowledged] = useState<Record<string, boolean>>({});
  const [verified, setVerified] = useState<Record<string, boolean>>({});
  const [proposed, setProposed] = useState<Record<string, boolean>>({});
  const abortRef = useRef<AbortController | null>(null);
  const scopeMenuRootRef = useRef<HTMLDivElement | null>(null);
  const scopeTriggerRef = useRef<HTMLButtonElement | null>(null);
  const scopeOptionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    if (!scopeOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !scopeMenuRootRef.current?.contains(event.target)) setScopeOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [scopeOpen]);

  const activeRows = crawlResult?.urlResults ?? rows;
  const allFindings = crawlResult?.findings ?? aggregateCrawlFindings(activeRows);
  const failCount = allFindings.filter((finding) => finding.status === "FAIL").length;
  const reviewCount = allFindings.filter((finding) => finding.status === "REVIEW_REQUIRED").length;
  const severityRank = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4 };
  const visibleFindings = [...allFindings].sort((a, b) =>
    Number(a.status !== "FAIL") - Number(b.status !== "FAIL")
    || severityRank[a.severity] - severityRank[b.severity]
    || affectedUrlCount(b) - affectedUrlCount(a)
  ).filter((finding) => {
    if (filter === "all") return finding.status === "FAIL" || finding.status === "REVIEW_REQUIRED";
    if (filter === "fail") return finding.status === "FAIL";
    return finding.status === "REVIEW_REQUIRED";
  });
  const passGroups = allFindings.filter((finding) => finding.status === "PASS");
  const unknownGroups = allFindings.filter((finding) => finding.status === "UNKNOWN");
  const activeFinding = visibleFindings.find((finding) => finding.id === selectedFindingId)
    ?? visibleFindings[0]
    ?? null;
  const pageCount = Math.max(1, Math.ceil(activeRows.length / PAGE_SIZE));
  const visibleRows = activeRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const selectedPage = selectedUrl ? activeRows.find((row) => row.url === selectedUrl) ?? null : null;
  const selectedPageIssues = selectedPage ? actionableUrlFindings(selectedPage.findings) : [];
  const selectedPageUnknown = selectedPage?.findings.filter((finding) => finding.status === "UNKNOWN") ?? [];
  const progressLimit = progress?.limit ?? (Number(urlLimit) || 100);
  const progressValue = Math.min(progress?.completed ?? activeRows.length, progressLimit);
  const selectedScopeIndex = Math.max(0, SCOPE_OPTIONS.findIndex((limit) => String(limit) === urlLimit));

  const focusScopeOption = (index: number) => {
    const safeIndex = (index + SCOPE_OPTIONS.length) % SCOPE_OPTIONS.length;
    scopeOptionRefs.current[safeIndex]?.focus();
  };

  const openScopeMenu = () => {
    setScopeOpen(true);
    window.requestAnimationFrame(() => focusScopeOption(selectedScopeIndex));
  };

  const closeScopeMenu = (restoreFocus = false) => {
    setScopeOpen(false);
    if (restoreFocus) window.requestAnimationFrame(() => scopeTriggerRef.current?.focus());
  };

  const handleScopeMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = scopeOptionRefs.current.findIndex((option) => option === document.activeElement);
    const activeIndex = currentIndex < 0 ? selectedScopeIndex : currentIndex;
    if (event.key === "Escape") {
      event.preventDefault();
      closeScopeMenu(true);
      return;
    }
    if (event.key === "Tab") {
      setScopeOpen(false);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const nextIndex = event.key === "Home"
        ? 0
        : event.key === "End"
          ? SCOPE_OPTIONS.length - 1
          : activeIndex + (event.key === "ArrowDown" ? 1 : -1);
      focusScopeOption(nextIndex);
    }
  };

  useEffect(() => {
    if (activeTab !== "pages" || !focusedUrl) return;
    const visibleUrlRows = Array.from(document.querySelectorAll<HTMLTableRowElement>("[data-crawl-url-row]"));
    const target = visibleUrlRows.find((row) => row.dataset.crawlUrlRow === focusedUrl);
    if (!target) return;
    target.scrollIntoView({ block: "center", behavior: "smooth" });
    target.focus({ preventScroll: true });
  }, [activeTab, activeRows, focusedUrl, page]);

  const openOverallFinding = (ruleId: CrawlFinding["ruleId"], status: CrawlFinding["status"], url: string) => {
    const group = allFindings.find((finding) => finding.ruleId === ruleId && finding.status === status && finding.affectedUrls.some((affected) => affected.url === url));
    setSelectedUrl(null);
    setActiveTab("issues");
    if (status === "FAIL" || status === "REVIEW_REQUIRED") {
      setFilter("all");
      if (group) setSelectedFindingId(group.id);
    }
  };

  const navigateToAffectedUrl = (url: string) => {
    const index = activeRows.findIndex((row) => row.url === url);
    setSelectedUrl(null);
    setActiveTab("pages");
    if (index < 0) {
      setFocusedUrl(null);
      setUrlNavigationMessage(`URL ${compactUrl(url)} không có trong danh sách kết quả đã quét của phiên này.`);
      return;
    }
    setUrlNavigationMessage("");
    setFocusedUrl(url);
    setPage(Math.floor(index / PAGE_SIZE) + 1);
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
    if (!Number.isInteger(requestedLimit) || ![20, 50, 100].includes(requestedLimit)) {
      setErrorMessage("Chọn hạn mức 20, 50 hoặc 100 URL.");
      setRunState("failed");
      return;
    }

    onRun();
    setAcknowledged({}); setVerified({}); setProposed({});
    const controller = new AbortController();
    abortRef.current = controller;
    onRunningChange(true);
    setRunState("running");
    setErrorMessage("");
    setRows([]);
    setCrawlResult(null);
    setSelectedFindingId("");
    setSelectedUrl(null);
    setFocusedUrl(null);
    setUrlNavigationMessage("");
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
      <form id="website-audit-form" className="audit-scope-controls" onSubmit={startCrawl}>
        <div className="audit-scope-menu-wrap" ref={scopeMenuRootRef}>
          <button
            id="audit-scope-trigger"
            ref={scopeTriggerRef}
            type="button"
            className="audit-scope-trigger"
            aria-haspopup="menu"
            aria-expanded={scopeOpen}
            aria-controls="audit-scope-menu"
            disabled={runState === "running"}
            onClick={() => scopeOpen ? setScopeOpen(false) : openScopeMenu()}
            onKeyDown={(event) => {
              if (!scopeOpen && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
                event.preventDefault();
                openScopeMenu();
              }
            }}
          >
            <span className="audit-scope-gear" aria-hidden="true">⚙</span>
            <span>Cài đặt phạm vi quét</span>
            <span className={`audit-scope-chevron${scopeOpen ? " is-open" : ""}`} aria-hidden="true" />
          </button>
          <div id="audit-scope-menu" className="audit-scope-menu" role="menu" aria-label="Giới hạn số URL" hidden={!scopeOpen} onKeyDown={handleScopeMenuKeyDown}>
            {SCOPE_OPTIONS.map((limit, index) => {
              const selected = String(limit) === urlLimit;
              return (
                <button
                  key={limit}
                  ref={(element) => { scopeOptionRefs.current[index] = element; }}
                  type="button"
                  role="menuitemradio"
                  aria-checked={selected}
                  aria-label={`${limit} URL`}
                  tabIndex={selected ? 0 : -1}
                  className={`audit-scope-option${selected ? " is-selected" : ""}`}
                  onClick={() => {
                    setUrlLimit(String(limit));
                    closeScopeMenu(true);
                  }}
                >
                  <span>{limit} URL</span>
                  {selected && <span className="audit-scope-check" aria-hidden="true">✓</span>}
                </button>
              );
            })}
          </div>
        </div>
        <Badge className="audit-scope-status" tone={statusTone(runState)} role="status" aria-live="polite">
          <span className="audit-scope-status-icon" aria-hidden="true">{runState === "completed" ? "✓" : runState === "failed" ? "!" : runState === "running" ? "◌" : runState === "partial" || runState === "cancelled" ? "◐" : "◷"}</span>
          {statusText(runState)}
        </Badge>
      </form>

      {activeRows.length > 0 && <div className="stats multi-audit-stats">
        <div className="stat"><div className="stat-label">URL kiểm tra thành công</div><div className="stat-value">{crawlResult?.successfulUrlCount ?? activeRows.filter((row) => row.status === "SCANNED" && (row.httpStatus ?? 0) < 400).length}</div><div className="stat-note">trong {crawlResult?.requestedUrlLimit ?? progress?.limit ?? Number(urlLimit)} URL tối đa</div></div>
        <div className="stat"><div className="stat-label">Nhóm lỗi có bằng chứng</div><div className="stat-value multi-value-danger">{failCount}</div><div className="stat-note">HTTP và rule fail</div></div>
        <div className="stat"><div className="stat-label">Nhóm cần người xem xét</div><div className="stat-value multi-value-review">{reviewCount}</div><div className="stat-note">Tín hiệu cần đối chiếu</div></div>
        <div className="stat"><div className="stat-label">Đã xác minh</div><div className="stat-value">{Object.values(verified).filter(Boolean).length}</div><div className="stat-note">Tạm thời trong phiên</div></div>
      </div>}

      {crawlResult && runState !== "running" && <div className="bannerMini multi-audit-notice">
        <span aria-hidden="true" style={{ fontWeight: "bold", fontSize: 14 }}>ⓘ</span>
        <span>{crawlResult?.coverage ? <>Phạm vi <b>{crawlResult.targetUrl}</b>: đã phát hiện {crawlResult.coverage.discovered}, đủ điều kiện {crawlResult.coverage.eligible}, xếp hàng {crawlResult.coverage.queued}, đã thử {crawlResult.coverage.attempted}, thành công {crawlResult.coverage.succeeded}, lỗi {crawlResult.coverage.failed}, còn lại {crawlResult.coverage.remaining} URL. Bỏ qua theo lần gặp: robots {crawlResult.coverage.skippedOccurrences.robots}, độ sâu {crawlResult.coverage.skippedOccurrences.depth}, giới hạn ứng viên {crawlResult.coverage.skippedOccurrences.candidateLimit}, ngoài phạm vi {crawlResult.coverage.skippedOccurrences.scope}. {crawlResult.coverage.limitReached ? "Đã chạm hạn mức URL." : "Chưa chạm hạn mức URL."} Giới hạn độ sâu 3; tối đa 2 request đồng thời. Kết quả không đại diện toàn bộ website; chưa chạy PageSpeed, không lưu lịch sử.</> : <>Cùng hostname, tối đa 100 URL, độ sâu 3 và 2 request đồng thời. Không suy rộng kết quả thành toàn bộ website; chưa chạy PageSpeed, không lưu lịch sử.</>}</span>
      </div>}

      {crawlResult?.warnings.map((warning, index) => <div key={`${index}-${warning}`} className="alert-box alert-amber multi-audit-error" role="status">{warning}</div>)}

      {runState === "running" && (
        <div className="panel panPad multi-progress" role="status" aria-live="polite">
          <div className="row space">
            <strong>{progress?.phase === "ROBOTS" ? "Đang đọc robots.txt" : progress?.phase === "SITEMAP" ? "Đang đọc sitemap giới hạn" : progress?.phase === "AGGREGATE" ? "Đang tổng hợp kết quả" : "Đang kiểm tra URL"}</strong>
            <span>Đã thử {progress?.attempted ?? activeRows.length}/{progress?.limit ?? (Number(urlLimit) || 100)} URL</span>
            <Button small type="button" onClick={cancelCrawl}>Hủy quét</Button>
          </div>
          <progress max={progressLimit} value={progressValue} aria-label="Tiến độ kiểm tra URL" />
          <p className="hint">{progress?.currentUrl || "Đang chuẩn bị phạm vi crawl"} · Đã phát hiện {progress?.discovered ?? 0}, đã thử {progress?.attempted ?? 0}, thành công {Math.max(0, (progress?.completed ?? 0) - (progress?.failed ?? 0))}, lỗi {progress?.failed ?? 0}</p>
        </div>
      )}

      {errorMessage && <div className="alert-box alert-red multi-audit-error" role="alert"><span className="alert-icon">⚠</span><div>{errorMessage}</div></div>}
      {runState === "cancelled" && <div className="alert-box alert-amber multi-audit-error" role="status"><span className="alert-icon">Ⅱ</span><div>Đã dừng theo yêu cầu. Giữ lại {activeRows.length} URL đã nhận được; kết quả có thể chưa được tổng hợp đầy đủ.</div></div>}
      {runState === "partial" && crawlResult && <div className="alert-box alert-amber multi-audit-error" role="status"><span className="alert-icon">ⓘ</span><div>Crawl kết thúc một phần{crawlResult.stopReason ? ` (${crawlResult.stopReason})` : ""}. Các URL đã hoàn thành vẫn có thể xem bên dưới.</div></div>}

      <Tabs label="Kết quả kiểm toán nhiều URL" value={activeTab} onChange={setActiveTab} items={[
        { value: "issues", label: `Các vấn đề & bằng chứng (${failCount + reviewCount})` },
        { value: "pages", label: `URL đã quét (${activeRows.length})` },
        { value: "history", label: "Lịch sử" },
      ]} />

      {activeTab === "issues" && (
        activeRows.length === 0 ? (
          <section className="panel panPad multi-empty" aria-label="Kết quả kiểm toán nhiều URL">
            <div className="empty-icon">◷</div>
            <h2>{runState === "failed" ? "Chưa có kết quả crawl" : runState === "running" ? "Đang kiểm tra website" : "Chưa quét website"}</h2>
            <p>{runState === "failed" ? "Kiểm tra địa chỉ website hoặc môi trường rồi thử lại. Chưa có kết quả nên chưa thể kết luận website có vấn đề hay đã đạt chuẩn." : runState === "running" ? "Tiến độ cập nhật phía trên; các URL sẽ xuất hiện khi crawler nhận kết quả." : "Bấm Quét website để kiểm tra website công khai trong phạm vi đã chọn."}</p>
          </section>
        ) : visibleFindings.length === 0 && filter === "all" && runState !== "running" ? (
          <section className="panel panPad multi-empty audit-no-issues" aria-label="Không phát hiện vấn đề cần xử lý">
            <div className="empty-icon">✓</div>
            <h2>{runState === "partial" || runState === "cancelled" ? "Chưa phát hiện vấn đề trong kết quả hiện có" : "Chưa phát hiện vấn đề cần xử lý trong phạm vi các URL đã kiểm tra."}</h2>
            <p>Đã kiểm tra thành công {crawlResult?.successfulUrlCount ?? activeRows.filter((row) => row.status === "SCANNED" && (row.httpStatus ?? 0) < 400).length} URL; không tải được {crawlResult?.failedUrlCount ?? activeRows.filter((row) => row.status === "FAILED").length}. {runState === "partial" || runState === "cancelled" ? "Lượt quét chưa hoàn tất, nên kết quả chỉ phản ánh các URL đã nhận." : "Kết quả chỉ phản ánh các URL đã kiểm tra, không khẳng định toàn bộ website hoàn hảo."} Phạm vi tối đa {crawlResult?.requestedUrlLimit ?? progressLimit} URL cùng hostname, độ sâu 3. Các nhóm kiểm tra gồm title, meta description, canonical, robots, heading, nội dung, HTTP và liên kết nội bộ; PageSpeed chưa được kiểm tra.</p>
            <details className="audit-diagnostics">
              <summary>Chẩn đoán kỹ thuật · {passGroups.length} nhóm tiêu chí đạt · {unknownGroups.length} nhóm chưa đủ dữ liệu</summary>
              {passGroups.length > 0 ? <section><h3>Các kiểm tra đã đạt ({passGroups.length} nhóm)</h3><ul>{passGroups.map((finding) => <li key={finding.id}><b>{finding.ruleName}</b> · {finding.affectedUrls.length} URL · {finding.evidence}</li>)}</ul></section> : <p>Không có nhóm PASS trong dữ liệu lần quét này.</p>}
              {unknownGroups.length > 0 ? <section><h3>Chưa đủ dữ liệu ({unknownGroups.length} nhóm)</h3><ul>{unknownGroups.map((finding) => <li key={finding.id}><b>{finding.ruleName}</b> · {finding.affectedUrls.length} URL · {finding.evidence}</li>)}</ul></section> : null}
            </details>
          </section>
        ) : (
          <div className="split multi-issue-layout">
            <section className="panel audit-issue-list" aria-label="Nhóm vấn đề nhiều URL">
              <div className="panelHead">
                <div><h3>Vấn đề cần ưu tiên xử lý</h3><p className="hint">Chọn một mục để xem bằng chứng và hướng dẫn.</p></div>
                <select className="form-select multi-filter" value={filter} onChange={(event) => setFilter(event.target.value as FindingFilter)} aria-label="Lọc nhóm tín hiệu">
                  <option value="all">Tất cả vấn đề ({failCount + reviewCount})</option>
                  <option value="fail">Lỗi ({failCount})</option>
                  <option value="review">Cần xem ({reviewCount})</option>
                </select>
              </div>
              {visibleFindings.length === 0 ? (
                <div className="empty-state multi-empty-compact"><div className="empty-icon">✓</div><h3>{filter === "fail" ? "Không có lỗi FAIL trong phạm vi đã kiểm tra" : "Không có tín hiệu cần người xem xét"}</h3><p>PASS và UNKNOWN nằm trong chẩn đoán kỹ thuật phụ, không hiển thị như vấn đề SEO.</p></div>
              ) : visibleFindings.map((finding) => (
                <button
                  type="button"
                  key={finding.id}
                  className={`issueRow audit-issue-row ${activeFinding?.id === finding.id ? "sel" : ""}`}
                  onClick={() => setSelectedFindingId(finding.id)}
                  aria-pressed={activeFinding?.id === finding.id}
                >
                  <span className={`ic ${finding.status === "FAIL" || finding.severity === "CRITICAL" || finding.severity === "HIGH" ? "fail" : "review-row"}`} aria-hidden="true">{finding.status === "FAIL" || finding.severity === "CRITICAL" || finding.severity === "HIGH" ? "!" : "•"}</span>
                  <span className="multi-finding-copy"><strong>{finding.ruleName}</strong><small>{finding.description}</small></span>
                  <span className="multi-finding-count">{affectedUrlCount(finding)} URL</span>
                  <span className={`chip ${finding.severity === "CRITICAL" || finding.severity === "HIGH" ? "bad" : finding.severity === "MEDIUM" ? "warn" : "blue"}`}>{finding.severity === "CRITICAL" ? "Nghiêm trọng" : finding.severity === "HIGH" ? "Cao" : finding.severity === "MEDIUM" ? "Trung bình" : "Tham khảo"}</span>
                  <Badge tone={verified[finding.id] ? "green" : "amber"}>{verified[finding.id] ? "Đã xác minh (phiên)" : "Chưa xác minh"}</Badge>
                </button>
              ))}
              {(passGroups.length > 0 || unknownGroups.length > 0) && <details className="audit-diagnostics audit-diagnostics-list">
                <summary>Chẩn đoán kỹ thuật · {passGroups.length} nhóm tiêu chí đạt · {unknownGroups.length} nhóm chưa đủ dữ liệu</summary>
                {passGroups.length > 0 && <section><h3>Các kiểm tra đã đạt ({passGroups.length} nhóm)</h3><ul>{passGroups.map((finding) => <li key={finding.id}><b>{finding.ruleName}</b> · {finding.affectedUrls.length} URL · {finding.evidence}</li>)}</ul></section>}
                {unknownGroups.length > 0 && <section><h3>Chưa đủ dữ liệu ({unknownGroups.length} nhóm)</h3><ul>{unknownGroups.map((finding) => <li key={finding.id}><b>{finding.ruleName}</b> · {finding.affectedUrls.length} URL · {finding.evidence}</li>)}</ul></section>}
              </details>}
            </section>

            <section className="panel panPad detail multi-finding-detail" aria-label="Bằng chứng nhóm được chọn">
              {activeFinding ? (
                <>
                  <div className="audit-evidence-heading">
                    <span className="kicker">CHI TIẾT VẤN ĐỀ</span>
                    <div className="audit-detail-badges">
                      <Badge tone={activeFinding.status === "FAIL" ? "red" : "amber"}>{activeFinding.status === "FAIL" ? "Có bằng chứng" : "Cần đối chiếu"}</Badge>
                      <Badge tone={verified[activeFinding.id] ? "green" : "amber"}>{verified[activeFinding.id] ? "Đã xác minh trong phiên" : "Chưa xác minh"}</Badge>
                    </div>
                  </div>
                  <h2>{activeFinding.ruleName}</h2>
                  <p>{activeFinding.description}</p>
                  <div className="miniTitle">Bằng chứng từ lần quét</div>
                  <div className="evidence audit-evidence-card">
                    <div className="evrow"><span>Nguồn</span><strong>Lượt quét website · {activeFinding.category}</strong></div>
                    <div className="evrow"><span>URL ảnh hưởng</span><strong>{uniqueAffectedUrls(activeFinding.affectedUrls).length} trang đã quét</strong></div>
                    <div className="evrow"><span>Trạng thái</span><strong>{activeFinding.status === "REVIEW_REQUIRED" ? "Tín hiệu cần người đối chiếu" : "Có bằng chứng từ lượt quét"} · {activeFinding.severity}</strong></div>
                    <details className="audit-technical-details">
                      <summary>Bằng chứng kỹ thuật · xem đầy đủ</summary>
                      <div className="evidence-snippet">{activeFinding.evidence}</div>
                      <p>Phương pháp: {detectionMethod(activeFinding)}</p>
                    </details>
                  </div>
                  <h3 className="miniTitle audit-affected-title">URL BỊ ẢNH HƯỞNG ({uniqueAffectedUrls(activeFinding.affectedUrls).length})</h3>
                  <ul className="multi-affected-list">
                    {uniqueAffectedUrls(activeFinding.affectedUrls).map((affected) => (
                      <li key={affected.url}>
                        <button type="button" className="linkbutton" title={affected.url} aria-label={`Tìm URL đã quét ${affected.url}`} onClick={() => navigateToAffectedUrl(affected.url)}>{compactUrl(affected.url)}</button>
                      </li>
                    ))}
                  </ul>
                  <div className="fix audit-recommendation"><b>Đề xuất cải thiện</b><div>{activeFinding.recommendation || "Đối chiếu bằng chứng trước khi thay đổi."}</div></div>
                  <label className="toggle audit-ack"><input type="checkbox" checked={Boolean(acknowledged[activeFinding.id])} onChange={(event) => setAcknowledged((current) => ({ ...current, [activeFinding.id]: event.target.checked }))} />Tôi đã xem và đối chiếu bằng chứng này.</label>
                  {activeFinding.status === "REVIEW_REQUIRED" && <p className="hint audit-review-note">Đây là tín hiệu heuristic. Việc xác minh ghi nhận quyết định của bạn, không biến heuristic thành sự thật khách quan.</p>}
                  <div className="actions audit-evidence-actions">
                    <Button variant="primary" disabled={!acknowledged[activeFinding.id] || Boolean(verified[activeFinding.id]) || (activeFinding.status !== "FAIL" && activeFinding.status !== "REVIEW_REQUIRED")} onClick={() => setVerified((current) => ({ ...current, [activeFinding.id]: true }))}>✓ Xác minh vấn đề</Button>
                    <Button variant="secondary" disabled={!verified[activeFinding.id] || Boolean(proposed[activeFinding.id])} onClick={() => setProposed((current) => ({ ...current, [activeFinding.id]: true }))}>＋ Đưa vào đề xuất</Button>
                  </div>
                  <p className="hint audit-session-note" role="status">{proposed[activeFinding.id] ? "Đã đánh dấu trong phiên để xem xét cho đề xuất. Chưa lưu thành đề xuất thật." : "Xác minh chỉ tồn tại trong phiên hiện tại; chưa tạo hoặc lưu đề xuất thật."}</p>
                </>
              ) : <p>Chọn vấn đề bên trái để xem bằng chứng.</p>}
            </section>
          </div>
        )
      )}

      {activeTab === "pages" && (
        <section className="panel multi-pages-panel" aria-label="Danh sách URL đã quét">
          <div className="panelHead"><div><h3>URL đã quét</h3><p className="hint">Chỉ đếm vấn đề cần sửa hoặc cần người đối chiếu. Mở chi tiết để xem bằng chứng gắn với URL.</p></div><span className="status-caption">{activeRows.length} URL đã nhận</span></div>
          {urlNavigationMessage && <div className="alert-box alert-amber multi-url-navigation-note" role="status">{urlNavigationMessage}</div>}
          {activeRows.length === 0 ? (
            <div className="empty-state multi-empty-compact"><div className="empty-icon">◷</div><h3>Chưa có URL để hiển thị</h3><p>Kết quả sẽ xuất hiện khi crawl bắt đầu.</p></div>
          ) : (
            <>
              <div className="multi-table-scroll">
                <table className="table multi-url-table">
                  <thead><tr><th>URL</th><th>HTTP</th><th>Trạng thái</th><th>Độ sâu</th><th>Số vấn đề</th><th></th></tr></thead>
                  <tbody>{visibleRows.map((row) => (
                    <tr key={row.url} data-crawl-url-row={row.url} tabIndex={-1} className={focusedUrl === row.url ? "is-url-focused" : ""}>
                      <td><span className="multi-table-url">{row.url}</span></td>
                      <td>{row.httpStatus ? <span className={`chip ${row.httpStatus < 400 ? "green" : "bad"}`}>HTTP {row.httpStatus}</span> : "—"}</td>
                      <td>{row.status === "SCANNED" ? "Đã quét" : "Không tải được"}</td>
                      <td>{row.depth}</td>
                      <td><b>{actionableUrlFindings(row.findings).length}</b> vấn đề</td>
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
        title={<div className="modalTopline"><div><div className="kicker">WEBSITE AUDIT / CHI TIẾT URL</div><h2 className="url-modal-heading">{selectedPage?.url || selectedUrl || ""}</h2><div className="hint">{selectedPage ? `Độ sâu ${selectedPage.depth} · ${selectedPageIssues.length} vấn đề cần xử lý/xem xét` : "Đang tìm kết quả URL."}</div></div></div>}
        description="Chỉ hiển thị vấn đề cần xử lý hoặc cần đối chiếu, kèm bằng chứng gắn với đúng URL này."
      >
        {selectedPage ? (
          <>
            <div className="page-status-line">
              <span className={`chip ${selectedPage.httpStatus && selectedPage.httpStatus < 400 ? "green" : selectedPage.httpStatus ? "bad" : "warn"}`}>{selectedPage.httpStatus ? `HTTP ${selectedPage.httpStatus}` : selectedPage.status}</span>
              <span className="chip blue">{selectedPage.depth === 0 ? "URL gốc" : `Độ sâu ${selectedPage.depth}`}</span>
              <span className="status-caption">Đã quét lúc {new Date(selectedPage.scannedAt).toLocaleString("vi-VN")}</span>
            </div>
              {selectedPageIssues.length ? selectedPageIssues.map((finding, index) => {
                const overallFinding = allFindings.find((group) => group.ruleId === finding.ruleId && group.status === finding.status && group.affectedUrls.some((affected) => affected.url === selectedPage.url));
                const isVerified = overallFinding ? Boolean(verified[overallFinding.id]) : false;
                return <details key={finding.ruleId} className="url-issue" open={index === 0}>
                <summary><span className={`ic ${finding.status === "FAIL" ? "fail" : "review-row"}`} aria-hidden="true">{finding.status === "FAIL" ? "!" : "•"}</span><div className="url-issue-title"><b>{finding.ruleName}</b><div className="status-caption">{finding.category} · {finding.status === "FAIL" ? "Có bằng chứng" : "Cần người đối chiếu"}</div></div><div className="url-issue-badges"><Badge tone={finding.severity === "CRITICAL" || finding.severity === "HIGH" ? "red" : finding.severity === "MEDIUM" ? "amber" : "blue"}>{finding.severity}</Badge><Badge tone={isVerified ? "green" : "amber"}>{isVerified ? "Đã xác minh" : "Chưa xác minh"}</Badge></div></summary>
                <div className="body"><p>{finding.description}</p>{finding.status === "REVIEW_REQUIRED" && <p className="url-review-note">Đây là tín hiệu cần người xem xét; chưa phải kết luận chắc chắn về SEO.</p>}<div className="url-evidence"><b>Bằng chứng trên URL này</b><div>{finding.evidence}</div><div className="status-caption">Phương pháp: {detectionMethod({ ...finding, id: `${finding.ruleId}-${index}`, affectedUrls: [{ url: selectedPage.url, evidence: finding.evidence }] })}</div></div><div className="fix"><b>Hướng cải thiện</b><div>{finding.recommendation || "Đối chiếu bằng chứng trước khi thay đổi."}</div></div><div className="status-caption">Nguồn: {selectedPage.url} · {new Date(finding.timestamp).toLocaleString("vi-VN")}</div><Button small className="url-overall-button" onClick={() => openOverallFinding(finding.ruleId, finding.status, selectedPage.url)}>Mở vấn đề tổng thể &amp; xác minh →</Button></div>
              </details>
              }) : <div className="alert-box alert-green"><span className="alert-icon">✓</span><div>Chưa phát hiện vấn đề cần xử lý trên URL này trong phạm vi đã quét.</div></div>}
            {selectedPageUnknown.length > 0 && <details className="audit-diagnostics url-modal-diagnostics"><summary>Thông tin chưa đủ dữ liệu để kết luận ({selectedPageUnknown.length})</summary><ul>{selectedPageUnknown.map((finding, index) => <li key={`${finding.ruleId}-${index}`}><b>{finding.ruleName}</b> · {finding.description}<div>{finding.evidence}</div></li>)}</ul></details>}
            {selectedPage.failureMessage && <div className="alert-box alert-amber" role="status">{selectedPage.failureCode}: {selectedPage.failureMessage}</div>}
            <div className="modal-actions"><Button variant="quiet" onClick={() => setSelectedUrl(null)}>Đóng</Button><Button variant="primary" onClick={() => { setSelectedUrl(null); setActiveTab("pages"); }}>Trở lại danh sách URL</Button></div>
          </>
        ) : <p className="status-caption">URL này chưa có kết quả trong phiên crawl.</p>}
      </Dialog>
    </section>
  );
}

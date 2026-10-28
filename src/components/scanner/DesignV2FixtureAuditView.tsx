"use client";

import { useState } from "react";
import Link from "next/link";
import { PageHeading, FeatureBanner } from "@/components/page-foundation";
import { Button } from "@/components/ui/primitives";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";

// EXACT FIXTURE DATA FROM LeadLift_Demo_V2_URL_Va_Hoi_Thoai.html
interface FixtureProblem {
  id: string;
  title: string;
  n: number;
  level: "Cao" | "Trung bình" | "Tham khảo";
  category: string;
  reason: string;
  fix: string;
  typicalUrls: string[];
}

const FIXTURE_PROBLEMS: FixtureProblem[] = [
  {
    id: "meta",
    title: "Mô tả meta trùng lặp",
    n: 2,
    level: "Cao",
    category: "SEO",
    reason: "Nhiều URL có nội dung thẻ meta description tương tự nhau; cần xem nội dung trang trước khi kết luận.",
    fix: "Viết mô tả riêng cho từng trang quan trọng, diễn đạt đúng mục đích tìm kiếm và giá trị của trang.",
    typicalUrls: ["/places/1820", "/places/169", "/places/1814"],
  },
  {
    id: "ratio",
    title: "Tỷ lệ văn bản / HTML thấp",
    n: 17,
    level: "Trung bình",
    category: "Nội dung",
    reason: "Lượng văn bản nhìn thấy thấp so với mã HTML ở nhiều trang. Đây chỉ là tín hiệu kỹ thuật, không tự chứng minh SEO kém.",
    fix: "Kiểm tra chất lượng nội dung và cấu trúc HTML; chỉ bổ sung nội dung thật sự hữu ích.",
    typicalUrls: ["/places/1820", "/places/169", "/places/1814"],
  },
  {
    id: "short",
    title: "Một số trang có ít từ",
    n: 14,
    level: "Trung bình",
    category: "Nội dung",
    reason: "Các trang có nội dung ngắn cần được xem theo mục đích sử dụng, tránh coi tất cả là lỗi.",
    fix: "Xem từng loại trang, bổ sung hướng dẫn hoặc thông tin thiết yếu nếu phù hợp.",
    typicalUrls: ["/places/1820", "/places/169", "/places/1814"],
  },
  {
    id: "title",
    title: "Tiêu đề trang quá dài",
    n: 13,
    level: "Trung bình",
    category: "SEO",
    reason: "Tiêu đề dài có thể bị rút gọn khi hiển thị trên kết quả tìm kiếm.",
    fix: "Rút gọn tiêu đề, đưa thông tin quan trọng về đầu; tránh sửa hàng loạt chưa kiểm tra.",
    typicalUrls: ["/places/1820", "/places/169", "/places/1814"],
  },
  {
    id: "links",
    title: "Ít liên kết nội bộ trỏ đến",
    n: 7,
    level: "Tham khảo",
    category: "Liên kết",
    reason: "Một số URL nhận ít liên kết từ các trang khác trong phạm vi đã quét.",
    fix: "Bổ sung các liên kết nội bộ hữu ích, đặt tại ngữ cảnh tự nhiên.",
    typicalUrls: ["/places/1820", "/places/169", "/places/1814"],
  },
];

interface FixturePage {
  path: string;
  http: number;
  issueIds: string[];
}

const FIXTURE_PAGES: FixturePage[] = [
  { path: "/", http: 200, issueIds: ["meta", "title"] },
  { path: "/menu", http: 200, issueIds: ["ratio", "short"] },
  { path: "/gioi-thieu", http: 200, issueIds: ["ratio", "links"] },
  { path: "/lien-he", http: 200, issueIds: ["meta", "short"] },
  { path: "/tin-tuc", http: 200, issueIds: ["ratio", "title"] },
];

export function DesignV2FixtureAuditView() {
  const showToast = useToast();

  const [activeTab, setActiveTab] = useState<"issues" | "pages" | "history">("issues");
  const [filterMode, setFilterMode] = useState<"all" | "Cao" | "Trung bình">("all");
  const [selectedProblemId, setSelectedProblemId] = useState<string>("meta");
  const [verifiedMap, setVerifiedMap] = useState<Record<string, boolean>>({});
  const [draftMarked, setDraftMarked] = useState<Record<string, boolean>>({});

  const [selectedPageIndex, setSelectedPageIndex] = useState<number | null>(null);

  const selectedProblem = FIXTURE_PROBLEMS.find((p) => p.id === selectedProblemId) || FIXTURE_PROBLEMS[0];
  const isSelectedVerified = Boolean(verifiedMap[selectedProblem.id]);

  const displayedProblems = FIXTURE_PROBLEMS.filter((p) => {
    if (filterMode === "all") return true;
    return p.level === filterMode;
  });

  const verifiedCount = Object.values(verifiedMap).filter(Boolean).length;

  const toggleVerify = (id: string) => {
    const next = !verifiedMap[id];
    setVerifiedMap((prev) => ({ ...prev, [id]: next }));
    showToast(next ? "Đã ghi nhận xác minh vấn đề (demo)." : "Đã hủy xác minh (demo).");
  };

  const selectedPage = selectedPageIndex !== null ? FIXTURE_PAGES[selectedPageIndex] : null;
  const pageProblems = selectedPage
    ? selectedPage.issueIds.map((id) => FIXTURE_PROBLEMS.find((p) => p.id === id)).filter(Boolean) as FixtureProblem[]
    : [];

  return (
    <>
      {/* Dev-only Watermark Banner */}
      <div
        style={{
          background: "#fff2d6",
          border: "1px solid #ffd480",
          borderRadius: 8,
          padding: "8px 14px",
          marginBottom: 16,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: 12,
          color: "#855400",
        }}
      >
        <span>
          <strong>DEMO / DỮ LIỆU MINH HỌA</strong> — Trang xem trước thị giác Design V2 bằng bộ dữ liệu prototype gốc để đối chiếu visual comparison. Không phải kết quả quét thật.
        </span>
        <Link href="/audit" className="button button-small">
          Mở Audit dữ liệu thật →
        </Link>
      </div>

      <PageHeading
        title="Website Audit"
        description="Phát hiện vấn đề, xem bằng chứng và xác minh trước khi đưa vào đề xuất."
      >
        <button
          type="button"
          className="button"
          onClick={() => { setVerifiedMap({}); setDraftMarked({}); showToast("Đã nạp lại dữ liệu fixture; không gửi yêu cầu quét thật."); }}
        >
          ↻ Tải lại fixture (DEMO)
        </button>
        <Link href="/dev/design-v2/outreach" className="button button-primary">
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
          gap: 10,
          marginBottom: 16,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <strong>La Cà Đà Nẵng</strong>{" "}
          <span className="statusnote">https://lacadanang.quangdev.id.vn · Hải Châu, Đà Nẵng</span>
          <div className="sub" style={{ marginTop: 3 }}>
            Lượt quét mẫu: 27/10/2026 · 23:15 • Di động · JS tắt
          </div>
        </div>
        <div className="actions" style={{ flexShrink: 0 }}>
          <button
            type="button"
            className="button button-small"
            onClick={() => showToast("Đổi doanh nghiệp mẫu trong bản demo.")}
          >
            Đổi doanh nghiệp
          </button>
          <span className="chip green">Kết quả tham khảo</span>
        </div>
      </div>

      {/* 4 Stat Cards */}
      <div className="stats">
        <div className="stat">
          <div className="stat-label">Sức khỏe website</div>
          <div className="stat-value">58/100</div>
          <div className="stat-note">Điểm tham khảo</div>
        </div>

        <div className="stat">
          <div className="stat-label">URL đã kiểm tra</div>
            <div className="stat-value">30</div>
            <div className="stat-note">URL trong fixture tham khảo</div>
        </div>

        <div className="stat">
          <div className="stat-label">Nhóm tín hiệu cần xem</div>
          <div className="stat-value" style={{ color: "#c34a45" }}>
            12
          </div>
          <div className="stat-note">Không phải lỗi đã xác minh</div>
        </div>

        <div className="stat">
          <div className="stat-label">Đã xác minh</div>
          <div className="stat-value" style={{ color: "#00765a" }}>
            {verifiedCount}
          </div>
          <div className="stat-note">Có thể lập đề xuất</div>
        </div>
      </div>

      {/* Scope Disclaimer Banner */}
      <div className="bannerMini">
        <span aria-hidden="true" style={{ fontWeight: "bold", fontSize: 14 }}>ⓘ</span>
        <span>
          <b>Phạm vi kiểm toán:</b> Fixture Design V2 có thống kê tham khảo cho 30 URL; bảng chi tiết mở 5 URL mẫu để thử popup. Đây là dữ liệu minh họa, không phải lần quét thật hay crawler production.
        </span>
      </div>

      {/* 3 Tabs */}
      <div className="tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "issues"}
          className={`tab ${activeTab === "issues" ? "on" : ""}`}
          onClick={() => setActiveTab("issues")}
        >
          Các vấn đề & bằng chứng
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "pages"}
          className={`tab ${activeTab === "pages" ? "on" : ""}`}
          onClick={() => setActiveTab("pages")}
        >
          URL đã quét
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

      {/* Tab 1: Các vấn đề & bằng chứng */}
      {activeTab === "issues" && (
        <div className="split">
          {/* Left: Issue Rows */}
          <section className="panel" aria-label="Danh sách vấn đề ưu tiên">
            <div className="panelHead" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <div>
                <h3>Vấn đề cần ưu tiên xử lý</h3>
                <p className="hint">Chọn một mục để kiểm tra phạm vi và hướng dẫn.</p>
              </div>
              <select
                className="form-select"
                style={{ width: "auto", minWidth: 130 }}
                value={filterMode}
                onChange={(e) => setFilterMode(e.target.value as "all" | "Cao" | "Trung bình")}
              >
                <option value="all">Tất cả</option>
                <option value="Cao">Mức cao</option>
                <option value="Trung bình">Trung bình</option>
              </select>
            </div>

            <div>
              {displayedProblems.map((prob) => {
                const isSelected = prob.id === selectedProblemId;
                const isVerified = Boolean(verifiedMap[prob.id]);

                return (
                  <div
                    key={prob.id}
                    className={`issueRow ${isSelected ? "sel" : ""}`}
                    onClick={() => setSelectedProblemId(prob.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelectedProblemId(prob.id);
                      }
                    }}
                  >
                    <span className="ic" aria-hidden="true">
                      {prob.level === "Cao" ? "!" : "•"}
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <strong>{prob.title}</strong>
                      <small>{prob.reason}</small>
                    </div>
                    <b style={{ fontSize: 12 }}>{prob.n} URL</b>
                    <span className="hideMob">
                      <span
                        className={`chip ${
                          prob.level === "Cao" ? "bad" : prob.level === "Trung bình" ? "warn" : "blue"
                        }`}
                      >
                        {prob.level}
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
          </section>

          {/* Right: Issue Detail & Evidence Panel */}
          <section className="panel panPad detail" aria-label="Chi tiết vấn đề và bằng chứng">
            <div className="row space" style={{ marginBottom: 8 }}>
              <span className="kicker">CHI TIẾT VẤN ĐỀ</span>
              <span className={`chip ${isSelectedVerified ? "green" : "warn"}`}>
                {isSelectedVerified ? "Đã xác minh" : "Chưa xác minh"}
              </span>
            </div>

            <h2>{selectedProblem.title}</h2>
            <p>{selectedProblem.reason}</p>

            <div className="miniTitle">Bằng chứng từ lần quét</div>
            <div className="evidence">
              <div className="evrow">
                <span>Phương pháp phát hiện</span>
                <strong>Kiểm tra HTML tự động (mẫu)</strong>
              </div>
              <div className="evrow">
                <span>URL ảnh hưởng</span>
                <strong>{selectedProblem.n} trang / phạm vi demo</strong>
              </div>
              <div className="evrow">
                <span>Trạng thái</span>
                <strong>{isSelectedVerified ? "Đã đối chiếu thủ công" : "Cần đối chiếu thủ công"}</strong>
              </div>

              <div className="divider" />

              <div className="sub" style={{ marginBottom: 8 }}>
                URL điển hình (mẫu, chưa phải kết quả crawling đầy đủ)
              </div>
              {selectedProblem.typicalUrls.map((url) => (
                <div
                  key={url}
                  className="kv"
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "6px 0",
                    borderBottom: "1px solid #edf1ed",
                    fontSize: 12,
                  }}
                >
                  <span className="linkish">{url}</span>
                  <span className="chip blue">Kiểm tra HTML</span>
                </div>
              ))}
            </div>

            <div className="miniTitle">Đề xuất cải thiện</div>
            <div className="alert green">
              <b>{selectedProblem.fix}</b>
            </div>

            <label className="toggle" style={{ marginTop: 15 }}>
              <input
                type="checkbox"
                checked={isSelectedVerified}
                onChange={() => toggleVerify(selectedProblem.id)}
              />
              <span>Tôi đã xem và đối chiếu bằng chứng (demo)</span>
            </label>

            <div className="btnline">
              <button
                type="button"
                className={`button ${isSelectedVerified ? "" : "button-primary"}`}
                onClick={() => toggleVerify(selectedProblem.id)}
              >
                {isSelectedVerified ? "✓ Đã xác minh" : "✓ Xác minh vấn đề"}
              </button>
              <button
                type="button"
                className="button button-primary"
                disabled={!isSelectedVerified}
                onClick={() => { setDraftMarked((prev) => ({ ...prev, [selectedProblem.id]: true })); showToast("Đã đánh dấu trong phiên DEMO; chưa lưu nháp thật."); }}
              >
                {draftMarked[selectedProblem.id] ? "✓ Đã đánh dấu (DEMO)" : "＋ Đánh dấu đề xuất (DEMO)"}
              </button>
            </div>

            <p className="hint" style={{ marginTop: 14 }}>
              Hệ thống thật phải lưu người xác minh, thời điểm và URL bằng chứng.
            </p>
          </section>
        </div>
      )}

      {/* Tab 2: URL đã quét */}
      {activeTab === "pages" && (
        <section className="panel" aria-label="Danh sách URL đã quét">
          <div className="panelHead" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <div>
              <h3>Danh sách URL đã quét</h3>
              <p className="hint">
                Nhấn vào bất kỳ URL nào để mở popup xem <b>tất cả các vấn đề</b>, bằng chứng và cách khắc phục theo từng trang.
              </p>
            </div>
            <span className="chip blue">DỮ LIỆU MINH HỌA</span>
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
                {FIXTURE_PAGES.map((page, i) => (
                  <tr
                    key={page.path}
                    className="table-row-selectable"
                    onClick={() => setSelectedPageIndex(i)}
                    title="Xem toàn bộ vấn đề của URL"
                  >
                    <td>
                      <div className="url-line">
                        <button
                          type="button"
                          className="linkbutton"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedPageIndex(i);
                          }}
                        >
                          {page.path}
                        </button>
                        <span style={{ color: "#80a394" }} aria-hidden="true">↗</span>
                      </div>
                    </td>
                    <td>
                      <span className={`chip ${page.http === 200 ? "green" : "bad"}`}>
                        {page.http}
                      </span>
                    </td>
                    <td>
                      <b>{page.issueIds.length}</b> vấn đề
                    </td>
                    <td>
                      <span
                        className={`chip ${
                          page.issueIds.length >= 3
                            ? "bad"
                            : page.issueIds.length > 0
                            ? "warn"
                            : "green"
                        }`}
                      >
                        {page.issueIds.length >= 3
                          ? "Cao"
                          : page.issueIds.length > 0
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
                          setSelectedPageIndex(i);
                        }}
                      >
                        Xem chi tiết →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="alert-box alert-amber" style={{ margin: 13 }}>
            <span className="alert-icon">⚠</span>
            <div>
              Số URL, vấn đề và bằng chứng ở đây là dữ liệu mô phỏng theo từng trang. Không khẳng định crawler của LeadLift đã kiểm tra các URL này.
            </div>
          </div>
        </section>
      )}

      {/* Tab 3: Lịch sử & so sánh */}
      {activeTab === "history" && (
        <div className="dual">
          <section className="panel panPad" aria-label="Lịch sử kiểm tra">
            <h3>Lịch sử kiểm tra</h3>
            <div className="kv" style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #edf1ed", fontSize: 13 }}>
              <span>27/10/2026</span>
              <b>1 lượt quét minh họa</b>
            </div>
            <div className="alert-box alert-amber" style={{ marginTop: 15 }}>
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
              <h3>Chưa đủ dữ liệu để so sánh</h3>
              <p>Cần có thêm lượt quét backend có phạm vi tương ứng.</p>
            </div>
          </section>
        </div>
      )}

      {/* Popup URL nhiều vấn đề (Popup_URL_Nhieu_Van_De) */}
      <Dialog
        id="fixture-url-modal"
        className="dialog-wide"
        open={selectedPage !== null}
        onClose={() => setSelectedPageIndex(null)}
        title={
          <div className="modalTopline" style={{ width: "100%" }}>
            <div>
              <div className="kicker">WEBSITE AUDIT / CHI TIẾT URL</div>
              <h2 className="url-modal-heading">{selectedPage?.path}</h2>
              <div className="hint">
                https://lacadanang.quangdev.id.vn{selectedPage?.path} · Lượt quét minh họa
              </div>
            </div>
          </div>
        }
      >
        {selectedPage && (
          <>
            <div className="page-status-line">
              <span className={`chip ${selectedPage.http === 200 ? "green" : "bad"}`}>
                HTTP {selectedPage.http}
              </span>
              <span className={`chip ${selectedPage.issueIds.length ? "bad" : "green"}`}>
                {selectedPage.issueIds.length} vấn đề
              </span>
              <span className="status-caption">
                Một URL có thể xuất hiện trong nhiều nhóm lỗi độc lập.
              </span>
            </div>

            {pageProblems.length > 0 ? (
              <>
                <div className="url-summary">
                  ⚠ Phát hiện {pageProblems.length} tín hiệu trên cùng URL. Mở từng mục bên dưới để xem giải thích, bằng chứng và hướng sửa.
                </div>

                {pageProblems.map((prob, k) => (
                  <details key={prob.id} className="url-issue" open={k === 0}>
                    <summary>
                      <span className="ic" style={{ flex: "none" }}>
                        {prob.level === "Cao" ? "!" : "•"}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <b>{prob.title}</b>
                        <div className="status-caption">
                          {prob.category} · Tín hiệu cần đối chiếu tại URL
                        </div>
                      </div>
                      <span className={`chip ${prob.level === "Cao" ? "bad" : "warn"}`}>
                        {prob.level}
                      </span>
                    </summary>
                    <div className="body">
                      <div>{prob.reason}</div>
                      <div className="url-evidence">
                        <b>Bằng chứng minh họa</b>
                        <div style={{ marginTop: 4 }}>
                          Trình kiểm tra mẫu đã gắn tín hiệu “{prob.title}” với URL {selectedPage.path}. Bản demo chưa có HTML, giá trị thực đo hoặc ảnh chụp từ crawler.
                        </div>
                      </div>
                      <div className="fix">
                        <b>Hướng cải thiện</b>
                        <div style={{ marginTop: 5 }}>{prob.fix}</div>
                      </div>
                      <div style={{ marginTop: 11 }}>
                        <button
                          type="button"
                          className="button button-small"
                          onClick={() => {
                            setSelectedProblemId(prob.id);
                            setSelectedPageIndex(null);
                            setActiveTab("issues");
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
                  Chưa phát hiện tín hiệu trong dữ liệu demo của URL này. Không có nghĩa URL đã được kiểm toán đầy đủ.
                </div>
              </div>
            )}

            <div className="alert-box alert-amber" style={{ marginTop: 13 }}>
              <span className="alert-icon">⚠</span>
              <div>
                Không xác minh tự động chỉ bằng việc mở popup. Cần kiểm tra bằng chứng trên trang trước khi đưa lỗi vào đề xuất.
              </div>
            </div>

            <div className="modal-actions">
              <Button variant="quiet" onClick={() => setSelectedPageIndex(null)}>
                Đóng
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  setSelectedPageIndex(null);
                  setActiveTab("issues");
                }}
              >
                Đến danh sách vấn đề →
              </Button>
            </div>
          </>
        )}
      </Dialog>
    </>
  );
}

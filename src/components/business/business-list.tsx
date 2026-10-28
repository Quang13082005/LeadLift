"use client";

import { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import { Button, Badge, StatCard, EmptyState } from "@/components/ui/primitives";
import { BusinessDetailPanel } from "./detail-panel";
import { CreateBusinessDialog } from "./create-dialog";
import { EditBusinessDialog } from "./edit-dialog";
import { CsvImportDialog } from "./csv-import-dialog";
import { fetchBusinessesAction } from "@/app/actions/business";
import {
  LEAD_STATUS_LABELS,
  type BusinessItem,
  type BusinessQueryResult,
} from "@/types/business";

interface BusinessListPageProps {
  initialData: BusinessQueryResult;
}

export function BusinessListPage({ initialData }: BusinessListPageProps) {
  const [data, setData] = useState<BusinessQueryResult>(initialData);
  const [selectedBusiness, setSelectedBusiness] = useState<BusinessItem | null>(
    initialData.items[0] || null
  );

  // Filters state
  const [search, setSearch] = useState("");
  const [area, setArea] = useState("Tất cả");
  const [sector, setSector] = useState("Tất cả");
  const [status, setStatus] = useState("Tất cả");
  const [page, setPage] = useState(1);

  // Tab state
  const [activeTab, setActiveTab] = useState<"discovery" | "pipeline">("discovery");

  // Dialogs state
  const [openCreate, setOpenCreate] = useState(false);
  const [openEdit, setOpenEdit] = useState(false);
  const [businessToEdit, setBusinessToEdit] = useState<BusinessItem | null>(null);
  const [openCsvImport, setOpenCsvImport] = useState(false);

  const [isPending, startTransition] = useTransition();

  const loadBusinesses = (newPage = page) => {
    startTransition(async () => {
      const res = await fetchBusinessesAction({
        search,
        area: area !== "Tất cả" ? area : undefined,
        sector: sector !== "Tất cả" ? sector : undefined,
        status: status !== "Tất cả" ? status : undefined,
        page: newPage,
        limit: 10,
      });
      setData(res);
      setPage(newPage);

      // If selected business is no longer in items, select first item
      if (res.items.length > 0) {
        const stillSelected = res.items.find((b) => b.id === selectedBusiness?.id);
        setSelectedBusiness(stillSelected || res.items[0]);
      } else {
        setSelectedBusiness(null);
      }
    });
  };

  // Re-fetch when filters change
  useEffect(() => {
    loadBusinesses(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, area, sector, status]);

  const handleEditOpen = (business: BusinessItem) => {
    setBusinessToEdit(business);
    setOpenEdit(true);
  };

  const handleCreateSuccess = (newBiz: BusinessItem) => {
    loadBusinesses(1);
    setSelectedBusiness(newBiz);
  };

  const handleEditSuccess = (updated: BusinessItem) => {
    setData((prev) => ({
      ...prev,
      items: prev.items.map((b) => (b.id === updated.id ? updated : b)),
    }));
    if (selectedBusiness?.id === updated.id) {
      setSelectedBusiness(updated);
    }
  };

  const handleCsvSuccess = () => {
    loadBusinesses(1);
  };

  return (
    <div className="business-module">
      {/* Top action header */}
      <div className="page-heading">
        <div>
          <h1>Khách hàng & Cơ hội</h1>
          <p>Tự động khám phá doanh nghiệp tiềm năng và quản lý cùng một hồ sơ từ đầu mối đến cơ hội hợp tác.</p>
        </div>
        <div className="actions">
          <Button variant="secondary" onClick={() => setOpenCsvImport(true)}>
            ⇧ Nhập CSV
          </Button>
          <Button variant="primary" onClick={() => setOpenCreate(true)}>
            ＋ Thêm doanh nghiệp
          </Button>
        </div>
      </div>

      {/* Stats row */}
      <div className="stats">
        <StatCard
          label="Doanh nghiệp phát hiện"
          value={data.stats.totalCount}
          note="Nguồn công khai & nhập thủ công"
        />
        <StatCard
          label="Cần ưu tiên audit"
          value={data.stats.prioritizeAuditCount}
          note="Chưa audit hoặc điểm tham khảo < 70"
        />
        <StatCard
          label="Đã tiếp cận"
          value={data.stats.outreachSentCount}
          note="Đã gửi đề xuất qua kênh hợp lệ"
        />
        <StatCard
          label="Khách quan tâm"
          value={data.stats.inDiscussionCount}
          note="Phản hồi tích cực, chờ tư vấn"
        />
      </div>

      {/* Tabs */}
      <div className="module-tabs">
        <button
          type="button"
          className={`module-tab ${activeTab === "discovery" ? "active" : ""}`}
          onClick={() => setActiveTab("discovery")}
        >
          Khám phá & danh sách
        </button>
        <button
          type="button"
          className={`module-tab ${activeTab === "pipeline" ? "active" : ""}`}
          onClick={() => setActiveTab("pipeline")}
        >
          Cơ hội hợp tác{" "}
          {data.stats.inDiscussionCount > 0 && (
            <Badge tone="green" className="ml-6">
              {data.stats.inDiscussionCount}
            </Badge>
          )}
        </button>
      </div>

      {activeTab === "discovery" ? (
        <>
          {/* Filter Bar */}
          <div className="filter-bar">
            <div className="search-wrap">
              <span className="search-icon" aria-hidden="true">
                🔍
              </span>
              <input
                type="text"
                placeholder="Tìm tên doanh nghiệp hoặc domain..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="filter-search-input"
              />
              {search && (
                <button
                  type="button"
                  className="clear-search-btn"
                  onClick={() => setSearch("")}
                  aria-label="Xóa tìm kiếm"
                >
                  ×
                </button>
              )}
            </div>

            <select
              value={area}
              onChange={(e) => setArea(e.target.value)}
              className="filter-select"
              aria-label="Lọc theo khu vực"
            >
              <option value="Tất cả">Khu vực: Tất cả</option>
              <option value="Đà Nẵng">Đà Nẵng</option>
              <option value="Hải Châu">Hải Châu</option>
              <option value="Sơn Trà">Sơn Trà</option>
              <option value="Ngũ Hành Sơn">Ngũ Hành Sơn</option>
              <option value="Hội An">Hội An</option>
              <option value="Huế">Huế</option>
            </select>

            <select
              value={sector}
              onChange={(e) => setSector(e.target.value)}
              className="filter-select"
              aria-label="Lọc theo ngành nghề"
            >
              <option value="Tất cả">Ngành nghề: Tất cả</option>
              <option value="Cho thuê xe máy">Cho thuê xe máy</option>
              <option value="Khách sạn">Khách sạn</option>
              <option value="Nhà hàng">Nhà hàng</option>
              <option value="Quán cà phê">Quán cà phê</option>
              <option value="Spa">Spa & Chăm sóc</option>
              <option value="Du lịch & Tour">Du lịch & Tour</option>
              <option value="Dịch vụ địa phương">Dịch vụ địa phương</option>
            </select>

            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="filter-select"
              aria-label="Lọc theo trạng thái"
            >
              <option value="Tất cả">Trạng thái: Tất cả</option>
              {Object.entries(LEAD_STATUS_LABELS).map(([k, item]) => (
                <option key={k} value={k}>
                  {item.label}
                </option>
              ))}
            </select>

            {isPending && <span className="filter-loading-hint">Đang tải...</span>}
          </div>

          {/* Main 2-column split */}
          <div className="split">
            {/* Left Column: Table & Pagination */}
            <section className="panel" aria-label="Danh sách doanh nghiệp">
              <header className="panel-heading table-header">
                <div>
                  <h2>Danh sách doanh nghiệp ({data.total})</h2>
                  <p className="hint">Chọn một dòng để xem chi tiết hồ sơ hoặc chuẩn bị audit website.</p>
                </div>
              </header>

              <div className="table-responsive">
                {data.items.length > 0 ? (
                  <table className="table lead-table">
                    <thead>
                      <tr>
                        <th>Doanh nghiệp / Website</th>
                        <th>Ngành nghề</th>
                        <th>Khu vực</th>
                        <th>Điểm</th>
                        <th>Trạng thái</th>
                        <th className="text-right">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.items.map((b) => {
                        const isSelected = selectedBusiness?.id === b.id;
                        const statusItem = LEAD_STATUS_LABELS[b.leadStatus] || {
                          label: b.leadStatus,
                          tone: "neutral",
                        };

                        return (
                          <tr
                            key={b.id}
                            className={`table-row-selectable ${isSelected ? "row-selected" : ""}`}
                            onClick={() => setSelectedBusiness(b)}
                          >
                            <td>
                              <div className="biz-name-cell">
                                <strong className="biz-name">{b.name}</strong>
                                <span className="biz-domain">{b.normalizedDomain}</span>
                              </div>
                            </td>
                            <td>{b.industry}</td>
                            <td>{b.district ? `${b.district}, ${b.city}` : b.city}</td>
                            <td>
                              {b.opportunityScore !== null ? (
                                <span
                                  className={`score-badge ${
                                    b.opportunityScore < 60
                                      ? "score-bad"
                                      : b.opportunityScore < 75
                                      ? "score-warn"
                                      : "score-good"
                                  }`}
                                >
                                  {b.opportunityScore}/100
                                </span>
                              ) : (
                                <span className="score-unrated" title="Chưa chạy Website Audit">
                                  —
                                </span>
                              )}
                            </td>
                            <td>
                              <Badge tone={statusItem.tone}>{statusItem.label}</Badge>
                            </td>
                            <td className="text-right" onClick={(e) => e.stopPropagation()}>
                              <div className="row-actions">
                                <Button
                                  variant="quiet"
                                  small
                                  onClick={() => setSelectedBusiness(b)}
                                  title="Xem chi tiết"
                                >
                                  Xem
                                </Button>
                                <Link
                                  href={`/audit?businessId=${b.id}`}
                                  className="button button-secondary button-small"
                                  title="Mở Website Audit"
                                >
                                  Audit →
                                </Link>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  <EmptyState
                    icon="⌕"
                    title="Không tìm thấy doanh nghiệp phù hợp"
                    description="Thử thay đổi từ khóa tìm kiếm, bỏ bộ lọc hoặc thêm doanh nghiệp mới vào hệ thống."
                  >
                    <Button variant="primary" small onClick={() => setOpenCreate(true)}>
                      ＋ Thêm doanh nghiệp
                    </Button>
                    <Button variant="secondary" small onClick={() => setOpenCsvImport(true)}>
                      ⇧ Nhập từ CSV
                    </Button>
                  </EmptyState>
                )}
              </div>

              {/* Pagination bar */}
              {data.totalPages > 1 && (
                <div className="pagination-bar">
                  <span className="pagination-info">
                    Trang {data.page} / {data.totalPages} ({data.total} kết quả)
                  </span>
                  <div className="pagination-buttons">
                    <Button
                      variant="secondary"
                      small
                      disabled={data.page <= 1 || isPending}
                      onClick={() => loadBusinesses(data.page - 1)}
                    >
                      ← Trước
                    </Button>
                    <Button
                      variant="secondary"
                      small
                      disabled={data.page >= data.totalPages || isPending}
                      onClick={() => loadBusinesses(data.page + 1)}
                    >
                      Sau →
                    </Button>
                  </div>
                </div>
              )}

              <div className="alert-box alert-amber table-footer-note">
                <strong>Lưu ý:</strong> Điểm số cơ hội là chỉ số kỹ thuật phục vụ sàng lọc ban đầu, không khẳng định
                doanh nghiệp đang thiếu khách hàng hoặc website chắc chắn không hiệu quả.
              </div>
            </section>

            {/* Right Column: Detail Panel */}
            <BusinessDetailPanel business={selectedBusiness} onEdit={handleEditOpen} />
          </div>
        </>
      ) : (
        /* Tab Pipeline placeholder for Phase 06 */
        <div className="split">
          <section className="panel">
            <header className="panel-heading">
              <h2>Pipeline cơ hội hợp tác</h2>
              <p className="hint">Theo dõi các doanh nghiệp đã tiếp cận và chuyển thành cơ hội kinh doanh.</p>
            </header>
            <div className="panel-body">
              <EmptyState
                icon="✉"
                title="Tính năng Pipeline thuộc Phase 06"
                description="Khu vực quản lý luồng cơ hội hợp tác, lịch sử hội thoại và bàn giao phụ trách sẽ được kết nối hoàn chỉnh tại Phase 06."
              >
                <Button variant="primary" onClick={() => setActiveTab("discovery")}>
                  Quay lại Khám phá & Danh sách
                </Button>
              </EmptyState>
            </div>
          </section>

          <section className="panel">
            <header className="panel-heading">
              <h2>Cơ hội cần bạn xử lý</h2>
            </header>
            <div className="panel-body">
              <EmptyState
                icon="🤝"
                title="Chưa có cơ hội cần xử lý"
                description="Khi doanh nghiệp phản hồi quan tâm tới đề xuất, thông báo bàn giao sẽ xuất hiện tại đây."
              />
            </div>
          </section>
        </div>
      )}

      {/* Dialogs */}
      <CreateBusinessDialog
        open={openCreate}
        onClose={() => setOpenCreate(false)}
        onSuccess={handleCreateSuccess}
      />

      <EditBusinessDialog
        business={businessToEdit}
        open={openEdit}
        onClose={() => {
          setOpenEdit(false);
          setBusinessToEdit(null);
        }}
        onSuccess={handleEditSuccess}
      />

      <CsvImportDialog
        open={openCsvImport}
        onClose={() => setOpenCsvImport(false)}
        onSuccess={handleCsvSuccess}
      />
    </div>
  );
}

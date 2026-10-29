"use client";

import { useState, useEffect, useTransition, useCallback, useRef } from "react";
import Link from "next/link";
import { Button, Badge, StatCard, EmptyState } from "@/components/ui/primitives";
import { BusinessDetailPanel } from "./detail-panel";
import { CreateBusinessDialog } from "./create-dialog";
import { EditBusinessDialog } from "./edit-dialog";
import { CsvImportDialog } from "./csv-import-dialog";
import { Tabs } from "@/components/ui/tabs";
import { PipelineView, type PipelineOpportunity } from "./pipeline-view";
import { fetchBusinessesAction } from "@/app/actions/business";
import { parseBusinessWebsite } from "@/lib/domain-normalizer";
import { DomainLabel } from "@/components/ui/domain-label";
import {
  LEAD_STATUS_LABELS,
  type BusinessItem,
  type BusinessQueryResult,
} from "@/types/business";

interface BusinessListPageProps {
  initialData: BusinessQueryResult;
  initialSelectedBusinessId?: string;
  initialTab?: "discovery" | "pipeline";
  demo?: boolean;
  pipelineOpportunity?: PipelineOpportunity;
}

function BusinessWebsiteLink({ websiteUrl, className }: { websiteUrl: string; className: string }) {
  const website = parseBusinessWebsite(websiteUrl);
  return website ? (
    <a
      className={className}
      href={website.url}
      target="_blank"
      rel="noopener noreferrer"
      title={`Mở ${website.domain} trong tab mới`}
      onClick={(event) => event.stopPropagation()}
    >
      <DomainLabel domain={website.domain} /><span aria-hidden="true">↗</span>
    </a>
  ) : <span className="biz-domain">Website chưa hợp lệ</span>;
}

function BusinessOpportunityScore({ score }: { score: number | null }) {
  if (score === null) return <span className="score-unrated" title="Chưa có điểm cơ hội được lưu">—</span>;
  return <span className={`score-badge ${score < 60 ? "score-bad" : score < 75 ? "score-warn" : "score-good"}`}>{score}/100</span>;
}

export function BusinessListPage({ initialData, initialSelectedBusinessId, initialTab = "discovery", demo = false, pipelineOpportunity }: BusinessListPageProps) {
  const [data, setData] = useState<BusinessQueryResult>(initialData);
  const [selectedBusiness, setSelectedBusiness] = useState<BusinessItem | null>(
    initialData.items.find((business) => business.id === initialSelectedBusinessId) || initialData.items[0] || null
  );

  // Filters state
  const [search, setSearch] = useState("");
  const [area, setArea] = useState("Tất cả");
  const [sector, setSector] = useState("Tất cả");
  const [status, setStatus] = useState("Tất cả");
  const [page, setPage] = useState(1);

  // Tab state
  const [activeTab, setActiveTab] = useState<"discovery" | "pipeline">(initialTab);

  // Dialogs state
  const [openCreate, setOpenCreate] = useState(false);
  const [openEdit, setOpenEdit] = useState(false);
  const [businessToEdit, setBusinessToEdit] = useState<BusinessItem | null>(null);
  const [openCsvImport, setOpenCsvImport] = useState(false);

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState(initialData.error ?? null);
  const requestId = useRef(0);
  const skipInitialLoad = useRef(true);
  const visibleItems = demo ? data.items.filter((business) =>
    (!search || `${business.name} ${business.normalizedDomain}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())) &&
    (area === "Tất cả" || business.city === area || business.district === area) &&
    (sector === "Tất cả" || business.industry === sector) &&
    (status === "Tất cả" || business.leadStatus === status)
  ) : data.items;
  const visibleSelection = visibleItems.find((business) => business.id === selectedBusiness?.id) || null;

  const loadBusinesses = useCallback((newPage = 1, preferredId?: string) => {
    const currentRequest = ++requestId.current;
    startTransition(async () => {
      try {
      const res = await fetchBusinessesAction({
        search,
        area: area !== "Tất cả" ? area : undefined,
        sector: sector !== "Tất cả" ? sector : undefined,
        status: status !== "Tất cả" ? status : undefined,
        page: newPage,
        limit: 10,
      });
      if (currentRequest !== requestId.current) return;
      setData(res);
      setError(null);
      setPage(res.page);

      // If selected business is no longer in items, select first item
      if (res.items.length > 0) {
        setSelectedBusiness((selected) => res.items.find((b) => b.id === (preferredId ?? selected?.id)) || res.items[0]);
      } else {
        setSelectedBusiness(null);
      }
      } catch {
        if (currentRequest === requestId.current) setError("Không thể tải danh sách doanh nghiệp. Vui lòng thử lại.");
      }
    });
  }, [search, area, sector, status]);

  // Re-fetch when filters change
  useEffect(() => {
    if (demo) return;
    if (skipInitialLoad.current) {
      skipInitialLoad.current = false;
      return;
    }
    const requests = requestId;
    const timeout = window.setTimeout(() => loadBusinesses(1), 250);
    return () => { window.clearTimeout(timeout); requests.current++; };
  }, [demo, loadBusinesses]);

  const handleEditOpen = (business: BusinessItem) => {
    setBusinessToEdit(business);
    setOpenEdit(true);
  };

  const handleCreateSuccess = (newBiz: BusinessItem) => {
    loadBusinesses(1, newBiz.id);
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
    loadBusinesses(page, updated.id);
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
          <p>{demo ? "Bản xem trước dữ liệu mẫu · Không ghi cơ sở dữ liệu" : "Quản lý hồ sơ doanh nghiệp và nhập dữ liệu thủ công hoặc từ CSV. Khám phá tự động chưa triển khai."}</p>
        </div>
        <div className="actions">
          <Button variant="secondary" onClick={() => setOpenCsvImport(true)} disabled={demo}>
            ⇧ Nhập CSV
          </Button>
          <Button variant="primary" onClick={() => setOpenCreate(true)} disabled={demo}>
            ＋ Thêm doanh nghiệp
          </Button>
        </div>
      </div>

      {/* Stats row */}
      <div className="stats">
        <StatCard
          label="Doanh nghiệp phát hiện"
          value={error ? null : data.stats.totalCount}
          note="Nguồn công khai & nhập thủ công"
        />
        <StatCard
          label="Cần ưu tiên audit"
          value={error ? null : data.stats.prioritizeAuditCount}
          note="Chưa audit hoặc điểm tham khảo < 70"
        />
        <StatCard
          label="Đã tiếp cận"
          value={error ? null : data.stats.outreachSentCount}
          note="Theo trạng thái hồ sơ đã ghi nhận"
        />
        <StatCard
          label="Khách quan tâm"
          value={error ? null : data.stats.inDiscussionCount}
          note="Đang trao đổi hoặc đã hợp tác"
        />
      </div>

      {/* Tabs */}
      <Tabs label="Màn hình Khách hàng & Cơ hội" value={activeTab} onChange={setActiveTab} items={[
        { value: "discovery", label: "Khám phá & danh sách" },
        { value: "pipeline", label: `Cơ hội hợp tác${!error && data.stats.inDiscussionCount > 0 ? ` · ${data.stats.inDiscussionCount}` : ""}` },
      ]} />

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
                aria-label="Tìm tên doanh nghiệp hoặc domain"
                maxLength={200}
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

            {isPending && <span className="filter-loading-hint" role="status">Đang tải...</span>}
          </div>

          {/* Main 2-column split */}
          {error && <div className="alert-box alert-red" role="alert">{error}<Button small onClick={() => loadBusinesses(page)} disabled={isPending}>Thử lại</Button></div>}
          <div className="split" aria-busy={isPending}>
            {/* Left Column: Table & Pagination */}
            <section className="panel business-list-panel" aria-label="Danh sách doanh nghiệp">
              <header className="panel-heading table-header">
                <div>
                  <h2>Danh sách doanh nghiệp ({error ? "—" : demo ? visibleItems.length : data.total})</h2>
                  <p className="hint">Chọn một dòng để xem chi tiết hồ sơ hoặc chuẩn bị audit website.</p>
                </div>
              </header>

              <div className="table-responsive business-table-responsive">
                {error ? <EmptyState title="Không thể tải dữ liệu" description="Chưa thể xác định số lượng doanh nghiệp. Vui lòng thử lại." /> : visibleItems.length > 0 ? (
                  <table className="table lead-table business-table">
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
                      {visibleItems.map((b) => {
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
                            aria-selected={isSelected}
                            tabIndex={0}
                            onKeyDown={(event) => { if (event.target === event.currentTarget && ["Enter", " "].includes(event.key)) { event.preventDefault(); setSelectedBusiness(b); } }}
                          >
                            <td data-label="Doanh nghiệp / Website">
                              <div className="biz-name-cell">
                                <strong className="biz-name">{b.name}</strong>
                                <BusinessWebsiteLink websiteUrl={b.websiteUrl} className="biz-domain-link" />
                              </div>
                            </td>
                            <td data-label="Ngành nghề">{b.industry}</td>
                            <td data-label="Khu vực">{b.district ? `${b.district}, ${b.city}` : b.city}</td>
                            <td data-label="Điểm">
                              <BusinessOpportunityScore score={b.opportunityScore} />
                            </td>
                            <td data-label="Trạng thái">
                              <Badge tone={statusItem.tone}>{statusItem.label}</Badge>
                            </td>
                            <td data-label="Thao tác" className="text-right" onClick={(e) => e.stopPropagation()}>
                              <div className="row-actions">
                                <Button
                                  variant="quiet"
                                  small
                                  onClick={() => setSelectedBusiness(b)}
                                  title="Xem chi tiết"
                                  aria-label={`Xem hồ sơ ${b.name}`}
                                  aria-pressed={isSelected}
                                >
                                  Xem
                                </Button>
                                <Link
                                  href={`${demo ? "/dev/design-v2/audit" : "/audit"}?businessId=${encodeURIComponent(b.id)}`}
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

              {!error && visibleItems.length > 0 && <div className="business-cards" role="list" aria-label="Danh sách doanh nghiệp dạng thẻ">
                {visibleItems.map((business) => {
                  const isSelected = selectedBusiness?.id === business.id;
                  const statusItem = LEAD_STATUS_LABELS[business.leadStatus] || { label: business.leadStatus, tone: "neutral" };
                  return <article
                    key={`card-${business.id}`}
                    className={`business-card ${isSelected ? "row-selected" : ""}`}
                    role="listitem"
                    onClick={() => setSelectedBusiness(business)}
                  >
                    <header className="business-card-heading">
                      <button type="button" className="business-card-name" aria-pressed={isSelected} onClick={() => setSelectedBusiness(business)}>{business.name}</button>
                      <Badge tone={statusItem.tone}>{statusItem.label}</Badge>
                    </header>
                    <div className="business-card-website"><BusinessWebsiteLink websiteUrl={business.websiteUrl} className="biz-domain-link" /></div>
                    <dl className="business-card-meta">
                      <div><dt>Ngành nghề</dt><dd>{business.industry}</dd></div>
                      <div><dt>Khu vực</dt><dd>{business.district ? `${business.district}, ${business.city}` : business.city}</dd></div>
                      <div><dt>Điểm</dt><dd><BusinessOpportunityScore score={business.opportunityScore} /></dd></div>
                    </dl>
                    <div className="business-card-actions">
                      <Button variant="quiet" small onClick={() => setSelectedBusiness(business)} aria-pressed={isSelected}>Xem</Button>
                      <Link
                        href={`${demo ? "/dev/design-v2/audit" : "/audit"}?businessId=${encodeURIComponent(business.id)}`}
                        className="button button-secondary button-small"
                        title={`Mở Website Audit cho ${business.name}`}
                        onClick={(event) => event.stopPropagation()}
                      >
                        Audit →
                      </Link>
                    </div>
                  </article>;
                })}
              </div>}

              {/* Pagination bar */}
              {!error && data.totalPages > 1 && (
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
            <BusinessDetailPanel business={error ? null : demo ? visibleSelection : selectedBusiness} onEdit={handleEditOpen} demo={demo} />
          </div>
        </>
      ) : (
        <PipelineView opportunity={demo ? pipelineOpportunity : undefined} />
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

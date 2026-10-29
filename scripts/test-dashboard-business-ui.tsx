import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BusinessListPage } from "../src/components/business/business-list";
import { DashboardView } from "../src/components/dashboard-view";
import { ToastProvider } from "../src/components/ui/toast";
import type { BusinessItem, BusinessQueryResult } from "../src/types/business";

const date = "2026-10-29T00:00:00.000Z";
const realRecord: BusinessItem = {
  id: "qa-real-record-1",
  name: "Hồ sơ thật trong test",
  industry: "Dịch vụ",
  category: null,
  address: null,
  city: "Đà Nẵng",
  district: null,
  websiteUrl: "https://www.example.com/",
  normalizedDomain: "example.com",
  phone: null,
  email: null,
  dataSource: "Kiểm thử",
  collectedAt: date,
  leadStatus: "NEW_DISCOVERED",
  opportunityScore: null,
  notes: null,
  createdAt: date,
  updatedAt: date,
};
const ratedRecord: BusinessItem = {
  ...realRecord,
  id: "qa-real-record-2",
  name: "Hồ sơ có điểm lưu",
  websiteUrl: "http://long-subdomain.example.com/duong-dan",
  normalizedDomain: "long-subdomain.example.com",
  email: "lien-he-rat-dai+kiem-thu@example.com",
  leadStatus: "AUDITED",
  opportunityScore: 58,
};
const invalidWebsiteRecord: BusinessItem = {
  ...realRecord,
  id: "qa-invalid-website-1",
  name: "Hồ sơ thiếu URL an toàn",
  websiteUrl: "javascript:alert(1)",
  normalizedDomain: "",
};

const dashboard = renderToStaticMarkup(React.createElement(DashboardView, {
  data: { total: 3, audited: 1, prepared: null, replies: null, items: [realRecord, ratedRecord, invalidWebsiteRecord] },
}));
assert.match(dashboard, /href="https:\/\/www\.example\.com\/" target="_blank" rel="noopener noreferrer"/);
assert.match(dashboard, /example<span>\.<\/span><wbr\/>com<\/span><span aria-hidden="true">↗<\/span>/);
assert.match(dashboard, /aria-label="Xem hồ sơ Hồ sơ thật trong test" href="\/businesses\?businessId=qa-real-record-1"/);
assert.match(dashboard, /Mới phát hiện/);
assert.match(dashboard, /Website chưa hợp lệ/);
assert.doesNotMatch(dashboard, /href="javascript:/);
assert.doesNotMatch(dashboard, /Mộc Coffee|An Nhiên Spa|Bếp Xưa|58\/100/);
assert.match(dashboard, /dashboard-action-cards/);
console.log("PASS dashboard action list renders only supplied businesses, truthful status, safe website links, and selected-record navigation");

const businessData: BusinessQueryResult = {
  items: [realRecord, ratedRecord, invalidWebsiteRecord],
  total: 3,
  page: 1,
  limit: 10,
  totalPages: 1,
  stats: { totalCount: 2, prioritizeAuditCount: 1, outreachSentCount: 0, inDiscussionCount: 0 },
};
const businesses = renderToStaticMarkup(React.createElement(ToastProvider, null, React.createElement(BusinessListPage, {
  initialData: businessData,
  initialSelectedBusinessId: ratedRecord.id,
})));
const globalCss = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
const detailHeaderCss = globalCss.match(/\.detail-panel \.detail-header\s*\{([^}]+)\}/)?.[1];
const detailBodyCss = globalCss.match(/\.detail-panel > \.detail-body\s*\{([^}]+)\}/)?.[1];
assert.ok(detailHeaderCss, "Customer profile header must keep a component-scoped layout rule");
assert.ok(detailBodyCss, "Customer profile body must share its horizontal inset token with the header");
assert.match(detailHeaderCss, /padding\s*:\s*var\(--space-4\)\s+var\(--detail-inline-inset\)/);
assert.match(detailBodyCss, /padding\s*:\s*var\(--space-4\)\s+var\(--detail-inline-inset\)/);
assert.doesNotMatch(detailHeaderCss, /border\s*:\s*0|padding\s*:\s*0/);
assert.match(globalCss, /\.detail-panel \.header-meta\s*\{[\s\S]*?flex-wrap\s*:\s*wrap/);
assert.match(globalCss, /\.detail-panel \.header-actions\s*\{[\s\S]*?margin-left\s*:\s*auto/);
assert.match(businesses, /aria-selected="true"/);
assert.match(businesses, /aria-pressed="true"/);
assert.match(businesses, /href="https:\/\/www\.example\.com\/" target="_blank" rel="noopener noreferrer"/);
assert.match(businesses, /href="http:\/\/long-subdomain\.example\.com\/duong-dan" target="_blank" rel="noopener noreferrer"/);
assert.match(businesses, /<span class="domain-link-label">example<span>\.<\/span><wbr\/>com<\/span>/);
assert.match(businesses, /href="\/audit\?businessId=qa-real-record-1"/);
assert.match(businesses, /href="\/audit\?businessId=qa-real-record-2"/);
assert.match(businesses, /Website chưa hợp lệ/);
assert.doesNotMatch(businesses, /href="javascript:/);
assert.match(businesses, /title="Chưa có điểm cơ hội được lưu">—/);
assert.match(businesses, /58\/100/);
assert.match(businesses, /lien-he-rat-dai\+kiem-thu@example\.com/);
assert.match(businesses, /business-cards/);
assert.doesNotMatch(businesses, /Mộc Coffee \(minh họa\)|An Nhiên Spa \(minh họa\)|Bếp Xưa \(minh họa\)/);
console.log("PASS business list preserves selected state, businessId audit links, long-value content, and stored-only scores");
console.log("PASS customer profile header/body share scoped spacing tokens and responsive header controls remain inside the card");

const emptyData: BusinessQueryResult = {
  items: [], total: 0, page: 1, limit: 10, totalPages: 1,
  stats: { totalCount: 0, prioritizeAuditCount: 0, outreachSentCount: 0, inDiscussionCount: 0 },
};
const emptyBusinesses = renderToStaticMarkup(React.createElement(ToastProvider, null, React.createElement(BusinessListPage, { initialData: emptyData })));
assert.match(emptyBusinesses, /Không tìm thấy doanh nghiệp phù hợp/);
assert.doesNotMatch(emptyBusinesses, /dashboard-fixture|DEMO/);
console.log("PASS businesses empty state renders without fixture records");

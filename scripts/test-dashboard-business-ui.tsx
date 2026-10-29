import assert from "node:assert/strict";
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

const dashboard = renderToStaticMarkup(React.createElement(DashboardView, {
  data: { total: 2, audited: 1, prepared: null, replies: null, items: [realRecord, ratedRecord] },
}));
assert.match(dashboard, /href="https:\/\/www\.example\.com\/" target="_blank" rel="noopener noreferrer"/);
assert.match(dashboard, /example\.com<span aria-hidden="true">↗<\/span>/);
assert.match(dashboard, /aria-label="Xem hồ sơ Hồ sơ thật trong test" href="\/businesses\?businessId=qa-real-record-1"/);
assert.match(dashboard, /Mới phát hiện/);
assert.doesNotMatch(dashboard, /Mộc Coffee|An Nhiên Spa|Bếp Xưa|58\/100/);
assert.match(dashboard, /dashboard-action-cards/);
console.log("PASS dashboard action list renders only supplied businesses, truthful status, safe website links, and selected-record navigation");

const businessData: BusinessQueryResult = {
  items: [realRecord, ratedRecord],
  total: 2,
  page: 1,
  limit: 10,
  totalPages: 1,
  stats: { totalCount: 2, prioritizeAuditCount: 1, outreachSentCount: 0, inDiscussionCount: 0 },
};
const businesses = renderToStaticMarkup(React.createElement(ToastProvider, null, React.createElement(BusinessListPage, {
  initialData: businessData,
  initialSelectedBusinessId: ratedRecord.id,
})));
assert.match(businesses, /aria-selected="true"/);
assert.match(businesses, /aria-pressed="true"/);
assert.match(businesses, /href="https:\/\/www\.example\.com\/" target="_blank" rel="noopener noreferrer"/);
assert.match(businesses, /href="http:\/\/long-subdomain\.example\.com\/duong-dan" target="_blank" rel="noopener noreferrer"/);
assert.match(businesses, /href="\/audit\?businessId=qa-real-record-1"/);
assert.match(businesses, /href="\/audit\?businessId=qa-real-record-2"/);
assert.match(businesses, /title="Chưa có điểm cơ hội được lưu">—/);
assert.match(businesses, /58\/100/);
assert.match(businesses, /lien-he-rat-dai\+kiem-thu@example\.com/);
assert.match(businesses, /business-cards/);
assert.doesNotMatch(businesses, /Mộc Coffee \(minh họa\)|An Nhiên Spa \(minh họa\)|Bếp Xưa \(minh họa\)/);
console.log("PASS business list preserves selected state, businessId audit links, long-value content, and stored-only scores");

const emptyData: BusinessQueryResult = {
  items: [], total: 0, page: 1, limit: 10, totalPages: 1,
  stats: { totalCount: 0, prioritizeAuditCount: 0, outreachSentCount: 0, inDiscussionCount: 0 },
};
const emptyBusinesses = renderToStaticMarkup(React.createElement(ToastProvider, null, React.createElement(BusinessListPage, { initialData: emptyData })));
assert.match(emptyBusinesses, /Không tìm thấy doanh nghiệp phù hợp/);
assert.doesNotMatch(emptyBusinesses, /dashboard-fixture|DEMO/);
console.log("PASS businesses empty state renders without fixture records");

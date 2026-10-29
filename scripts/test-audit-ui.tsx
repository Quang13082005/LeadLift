import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AuditClientView } from "../src/components/scanner/AuditClientView";
import type { BusinessItem } from "../src/types/business";

const testBusiness: BusinessItem = {
  id: "audit-ui-test-business",
  name: "Doanh nghiệp kiểm thử",
  industry: "Dịch vụ",
  category: null,
  address: null,
  city: "Đà Nẵng",
  district: null,
  websiteUrl: "https://example.com/",
  normalizedDomain: "example.com",
  phone: null,
  email: null,
  dataSource: "Kiểm thử UI",
  collectedAt: "2026-10-29T00:00:00.000Z",
  leadStatus: "NEW_DISCOVERED",
  opportunityScore: null,
  notes: null,
  createdAt: "2026-10-29T00:00:00.000Z",
  updatedAt: "2026-10-29T00:00:00.000Z",
};

function renderAudit(initialBusinesses: BusinessItem[], initialBusinessId?: string) {
  return renderToStaticMarkup(React.createElement(AuditClientView, { initialBusinesses, initialBusinessId }));
}

function countMatches(value: string, expression: RegExp) {
  return [...value.matchAll(expression)].length;
}

const unselected = renderAudit([]);
assert.equal(countMatches(unselected, /class="button button-primary audit-business-select/g), 1);
assert.match(unselected, /href="\/businesses"[^>]*>Chọn doanh nghiệp<\/a>/);
assert.match(unselected, /audit-business-empty-copy/);
assert.doesNotMatch(unselected, /id="website-audit-form"/);
assert.match(unselected, /form="website-audit-form"[^>]*disabled=""/);
console.log("PASS unselected Audit shows one real-business CTA and keeps scanning disabled");

const selected = renderAudit([testBusiness], testBusiness.id);
assert.match(selected, /Doanh nghiệp kiểm thử/);
assert.match(selected, /https:\/\/example\.com\//);
assert.match(selected, /Đà Nẵng/);
assert.equal(countMatches(selected, /class="button button-primary audit-business-select/g), 1);
assert.match(selected, /href="\/businesses"[^>]*>Chọn doanh nghiệp<\/a>/);
assert.doesNotMatch(selected, /Chọn doanh nghiệp để bắt đầu|Mở Khách hàng &amp; Cơ hội/);
assert.match(selected, /id="audit-scope-trigger"[^>]*aria-haspopup="menu"[^>]*aria-expanded="false"/);
assert.equal(countMatches(selected, /role="menuitemradio"/g), 3);
assert.match(selected, /role="menuitemradio" aria-checked="true" aria-label="100 URL"/);
assert.match(selected, /role="menuitemradio" aria-checked="false" aria-label="20 URL"/);
assert.match(selected, /role="menuitemradio" aria-checked="false" aria-label="50 URL"/);
assert.doesNotMatch(selected, /<select[^>]*class="audit-scope/);
console.log("PASS selected business, CTA navigation, default limit, scope options, and menu semantics");

const invalid = renderAudit([testBusiness], "missing-business");
assert.equal(countMatches(invalid, /class="button button-primary audit-business-select/g), 1);
assert.doesNotMatch(invalid, /id="website-audit-form"/);
assert.match(invalid, /Hồ sơ doanh nghiệp không khả dụng/);
console.log("PASS invalid business ID does not fall back to another business or mount a scanner");

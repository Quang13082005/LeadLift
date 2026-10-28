import { normalizeDomain } from "../src/lib/domain-normalizer";
import { parseCsvLine, parseAndValidateCsv, MAX_CSV_SIZE_BYTES, MAX_CSV_ROWS } from "../src/lib/csv-parser";
import { createBusinessSchema, updateBusinessSchema } from "../src/types/business";
import { enforceDevOnly } from "../src/lib/services/business-service";

async function runBusinessTests() {
  console.log("🧪 ============================================================");
  console.log("🧪 LEADLIFT — PHASE 02B: BUSINESS MANAGEMENT TEST SUITE");
  console.log("🧪 ============================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${testName}${detail ? ` (${detail})` : ""}`);
      failed++;
    }
  }

  // ---------------------------------------------------------------------------
  // SUITE 1: Domain Normalizer & Duplicate Detection Helpers
  // ---------------------------------------------------------------------------
  console.log("--- Suite 1: Domain Normalization & Consistency ---");
  assert(
    normalizeDomain("https://www.thuexemaydanang.vn/bang-gia") === "thuexemaydanang.vn",
    "Strip protocol, www, and URL paths"
  );
  assert(
    normalizeDomain("HTTP://KHACHSAN-BIEN.COM:443/") === "khachsan-bien.com",
    "Lowercase domain and strip port"
  );
  assert(
    normalizeDomain("myhanhseafood.vn") === "myhanhseafood.vn",
    "Handle raw domain without http protocol"
  );
  assert(
    normalizeDomain("   https://sub.domain.vn/path?ref=123#frag   ") === "sub.domain.vn",
    "Strip query params, hash and whitespace"
  );
  assert(normalizeDomain("") === "", "Handle empty string safely without crashing");

  // ---------------------------------------------------------------------------
  // SUITE 2: Zod Validation Schemas
  // ---------------------------------------------------------------------------
  console.log("\n--- Suite 2: Input Validation (Create & Update Schemas) ---");
  const validCreate = createBusinessSchema.safeParse({
    name: "Thuê xe máy Anh Tuấn",
    websiteUrl: "https://thuexemayanhtuan.vn",
    industry: "Cho thuê xe máy",
    city: "Đà Nẵng",
    district: "Sơn Trà",
    phone: "0905123456",
    email: "contact@thuexemayanhtuan.vn",
  });
  assert(validCreate.success, "Valid create input accepted");

  const invalidName = createBusinessSchema.safeParse({
    name: "A", // too short (<2)
    websiteUrl: "https://valid.com",
    industry: "Khách sạn",
  });
  assert(!invalidName.success, "Reject short business name (< 2 chars)");

  const invalidEmail = createBusinessSchema.safeParse({
    name: "Khách sạn Biển Vàng",
    websiteUrl: "https://bienvang.vn",
    industry: "Khách sạn",
    email: "not-an-email",
  });
  assert(!invalidEmail.success, "Reject invalid email format");

  const validEmptyEmail = createBusinessSchema.safeParse({
    name: "Cà phê Gió Mùa",
    websiteUrl: "https://giomua.vn",
    industry: "Quán cà phê",
    email: "", // empty allowed
  });
  assert(validEmptyEmail.success, "Accept empty email string");

  const validScoreUpdate = updateBusinessSchema.safeParse({
    id: "biz_123",
    opportunityScore: 78,
  });
  assert(validScoreUpdate.success, "Accept integer opportunity score in range (0-100)");

  const invalidScoreUpdate = updateBusinessSchema.safeParse({
    id: "biz_123",
    opportunityScore: 105, // > 100
  });
  assert(!invalidScoreUpdate.success, "Reject opportunity score > 100");

  const nullScoreUpdate = updateBusinessSchema.safeParse({
    id: "biz_123",
    opportunityScore: null,
  });
  assert(nullScoreUpdate.success, "Accept null opportunity score (unrated/not audited)");

  // ---------------------------------------------------------------------------
  // SUITE 3: RFC 4180 CSV Line Parsing
  // ---------------------------------------------------------------------------
  console.log("\n--- Suite 3: RFC 4180 CSV Parser Low-Level ---");
  const simpleLine = parseCsvLine("A,B,C");
  assert(simpleLine.length === 3 && simpleLine[0] === "A" && simpleLine[2] === "C", "Parse comma-separated values");

  const quotedLine = parseCsvLine('"Tên, có dấu phẩy",https://domain.vn,"Cho thuê xe máy"');
  assert(
    quotedLine.length === 3 && quotedLine[0] === "Tên, có dấu phẩy",
    "Parse quoted field containing comma without splitting"
  );

  const escapedQuotes = parseCsvLine('"Khách sạn ""Sao Biển"" 4 sao",https://saobien.vn');
  assert(
    escapedQuotes.length === 2 && escapedQuotes[0] === 'Khách sạn "Sao Biển" 4 sao',
    "Parse escaped double quotes inside quoted string"
  );

  // ---------------------------------------------------------------------------
  // SUITE 4: CSV Validation & Business Rules
  // ---------------------------------------------------------------------------
  console.log("\n--- Suite 4: CSV Validation, Size & Row Limits ---");
  assert(MAX_CSV_SIZE_BYTES === 2 * 1024 * 1024, "Max CSV size constant is 2MB");
  const validCsv = `Tên doanh nghiệp,Website,Ngành nghề,Khu vực,Số điện thoại,Email
Thuê xe máy Gia Huy,https://giahuy.vn,Cho thuê xe máy,Đà Nẵng,0905123456,contact@giahuy.vn
Khách sạn Golden Sea,goldensea.com,Khách sạn,Sơn Trà,02363888999,info@goldensea.com`;

  const parsedValid = parseAndValidateCsv(validCsv);
  assert(parsedValid.validCount === 2 && parsedValid.invalidCount === 0, "Valid 2-row CSV parsed with 0 errors");
  assert(parsedValid.validRows[0].normalizedDomain === "giahuy.vn", "First row domain normalized to 'giahuy.vn'");
  assert(parsedValid.validRows[1].normalizedDomain === "goldensea.com", "Second row domain normalized to 'goldensea.com'");

  // Intra-file duplicate domain detection
  const duplicateCsv = `Tên doanh nghiệp,Website,Ngành nghề
Cơ sở 1,https://thuexemaydanang.vn/chinhanh1,Cho thuê xe máy
Cơ sở 2,https://www.thuexemaydanang.vn/chinhanh2,Cho thuê xe máy`;

  const parsedDuplicate = parseAndValidateCsv(duplicateCsv);
  assert(
    parsedDuplicate.validCount === 1 && parsedDuplicate.invalidCount === 1,
    "Detect intra-file duplicate domain and flag second occurrence"
  );
  assert(
    Boolean(parsedDuplicate.errors[0]?.message.includes("trùng lặp với dòng 2")),
    "Error message points explicitly to row 2"
  );

  // Missing required column header
  const badHeaderCsv = `Tên doanh nghiệp,Địa chỉ,Ngành nghề
Cửa hàng A,Hải Châu,Spa`;
  const parsedBadHeader = parseAndValidateCsv(badHeaderCsv);
  assert(
    parsedBadHeader.invalidCount > 0 && parsedBadHeader.validCount === 0,
    "Reject CSV missing required 'Website/URL' column"
  );

  // Missing business name in row
  const missingNameCsv = `Tên doanh nghiệp,Website
,https://noname.vn`;
  const parsedMissingName = parseAndValidateCsv(missingNameCsv);
  assert(
    parsedMissingName.errors.some((e) => e.field === "name" && e.rowNumber === 2),
    "Reject row with empty business name"
  );

  // Row limit check (> MAX_CSV_ROWS)
  const hugeCsvRows = ["Tên doanh nghiệp,Website"];
  for (let i = 1; i <= MAX_CSV_ROWS + 10; i++) {
    hugeCsvRows.push(`Doanh nghiệp ${i},https://example${i}.vn`);
  }
  const parsedHuge = parseAndValidateCsv(hugeCsvRows.join("\n"));
  assert(
    parsedHuge.validCount === 0 && Boolean(parsedHuge.errors[0]?.message.includes("vượt quá giới hạn tối đa")),
    `Enforce max row limit (${MAX_CSV_ROWS} rows)`
  );

  // ---------------------------------------------------------------------------
  // SUITE 5: Security & Production Fail-Closed Guard
  // ---------------------------------------------------------------------------
  console.log("\n--- Suite 5: Security & Fail-Closed Guard ---");
  // Test enforceDevOnly under development (should not throw)
  const env = process.env as Record<string, string | undefined>;
  const originalEnv = env.NODE_ENV;
  try {
    env.NODE_ENV = "development";
    let devPassed = false;
    try {
      enforceDevOnly();
      devPassed = true;
    } catch {
      devPassed = false;
    }
    assert(devPassed, "enforceDevOnly allows execution in development");

    // Test enforceDevOnly under production (MUST throw 403)
    env.NODE_ENV = "production";
    let prodBlocked = false;
    try {
      enforceDevOnly();
    } catch (err) {
      const e = err as Error & { statusCode?: number };
      if (e.statusCode === 403 && e.message.includes("fail-closed")) {
        prodBlocked = true;
      }
    }
    assert(prodBlocked, "enforceDevOnly strictly throws 403 fail-closed in production");
  } finally {
    env.NODE_ENV = originalEnv;
  }

  // ---------------------------------------------------------------------------
  // SUITE 6: Live HTTP Endpoint Verification (Dev Server on 127.0.0.1:3000)
  // ---------------------------------------------------------------------------
  console.log("\n--- Suite 6: Live HTTP Endpoint & Render Verification ---");
  try {
    const healthRes = await fetch("http://127.0.0.1:3000/api/health", { signal: AbortSignal.timeout(2000) });
    if (healthRes.ok) {
      console.log("  ℹ️  Dev server detected on 127.0.0.1:3000. Running live assertions...");

      // 1. GET /api/businesses
      const apiBiz = await fetch("http://127.0.0.1:3000/api/businesses");
      const apiBizData = (await apiBiz.json()) as { items?: unknown[]; total?: number; stats?: unknown };
      assert(apiBiz.status === 200 && Array.isArray(apiBizData.items), "GET /api/businesses returns HTTP 200 with items array");
      assert(typeof apiBizData.total === "number", "GET /api/businesses includes total count number");
      assert(Boolean(apiBizData.stats), "GET /api/businesses includes summary stats object");

      // 2. GET /businesses HTML
      const htmlBiz = await fetch("http://127.0.0.1:3000/businesses");
      assert(htmlBiz.status === 200, "GET /businesses renders successfully (HTTP 200)");

      // 3. GET / (Dashboard)
      const htmlHome = await fetch("http://127.0.0.1:3000/");
      assert(htmlHome.status === 200, "GET / (Dashboard) renders successfully (HTTP 200)");
    } else {
      console.log("  ⚠️  Dev server returned non-200 for health check; skipping live HTTP suite.");
    }
  } catch {
    console.log("  ⚠️  Dev server not running on 127.0.0.1:3000; skipping live HTTP suite (unit tests passed).");
  }

  console.log(`\n============================================================`);
  console.log(`TEST SUMMARY: ${passed + failed} Tests | ✅ Passed: ${passed} | ❌ Failed: ${failed}`);
  console.log(`============================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runBusinessTests().catch((err) => {
  console.error("Fatal test runner error:", err);
  process.exit(1);
});

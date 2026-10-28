import type {
  ParsedHtmlData,
  ScanFinding,
  ScanSummary,
} from "@/types/scanner";

export const SEO_THRESHOLDS = {
  titleMinChars: 10,
  titleMaxChars: 70,
  metaDescriptionMinChars: 50,
  metaDescriptionMaxChars: 160,
  thinContentWordCount: 200,
} as const;

const DEFAULT_RECOMMENDATIONS: Record<string, string> = {
  HTTP_STATUS: "Kiểm tra phản hồi của URL và xác nhận trạng thái với nội dung mong muốn.",
  SECURITY_HTTPS: "Dùng HTTPS cho website công khai và chuyển hướng HTTP sang HTTPS khi phù hợp.",
  SEO_TITLE_EXISTS: "Rà soát tiêu đề để phản ánh chính xác nội dung và mục đích của trang.",
  SEO_TITLE_LENGTH: "Đánh giá tiêu đề theo hướng dẫn độ dài của LeadLift và cách hiển thị thực tế trên kết quả tìm kiếm.",
  SEO_TITLE_DUPLICATE: "Đối chiếu các trang trong nhóm rồi cân nhắc tiêu đề riêng nếu nội dung và mục tiêu tìm kiếm khác nhau.",
  SEO_META_DESCRIPTION: "Rà soát xem trang có cần mô tả tìm kiếm riêng theo mục tiêu hiển thị hay không.",
  SEO_META_DESCRIPTION_LENGTH: "Đánh giá mô tả theo hướng dẫn độ dài của LeadLift và nội dung thực tế của trang.",
  SEO_META_DESCRIPTION_DUPLICATE: "Đối chiếu nội dung các trang và cân nhắc mô tả riêng nếu mục tiêu của chúng khác nhau.",
  SEO_CANONICAL: "Kiểm tra URL canonical và xác nhận nó trỏ tới URL chuẩn dự kiến.",
  SEO_CANONICAL_MISMATCH: "Xác nhận canonical khác URL hiện tại là chủ đích, đặc biệt khi nội dung hai trang khác nhau.",
  SEO_ROBOTS_NOINDEX: "Xác nhận noindex là chủ đích đối với trang này trước khi thay đổi chỉ thị.",
  SEO_H1_COUNT: "Rà soát tiêu đề chính và cấu trúc nội dung của trang.",
  SEO_HEADING_HIERARCHY: "Rà soát thứ tự heading để cấu trúc nội dung dễ theo dõi; không tự động đổi heading nếu cấu trúc có chủ ý.",
  SEO_THIN_CONTENT: "Đối chiếu nội dung với mục đích trang; độ dài đơn lẻ không xác định chất lượng nội dung.",
  SEO_BROKEN_INTERNAL_LINK: "Kiểm tra đường dẫn đích, khôi phục trang hoặc cập nhật liên kết tới nội dung phù hợp.",
  MOBILE_VIEWPORT: "Rà soát cấu hình viewport và kiểm tra trang trên thiết bị di động.",
  SOCIAL_OG_TAGS: "Rà soát thẻ chia sẻ nếu trang cần hiển thị bản xem trước trên mạng xã hội.",
  TECHNICAL_HEALTH: "Đo lại thời gian phản hồi trong điều kiện ổn định trước khi thay đổi hạ tầng.",
};

/**
 * Decodes common HTML entities into plain text.
 */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .trim();
}

/**
 * Strips HTML tags from an inner HTML string to get clean text.
 */
function stripTags(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

/**
 * Extracts attribute value from an HTML tag string safely.
 * Handles both single, double, and unquoted attribute formats.
 */
function getAttribute(tagHtml: string, attrName: string): string | null {
  const pattern = new RegExp(
    `(?:^|\\s)${attrName}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
    "i"
  );
  const match = tagHtml.match(pattern);
  if (!match) return null;
  const raw = match[1] ?? match[2] ?? match[3] ?? "";
  return decodeHtmlEntities(raw);
}

/**
 * Parses raw HTML string and extracts structured metadata.
 */
export function parseHtmlContent(html: string): ParsedHtmlData {
  const pageData: ParsedHtmlData = {
    h1List: [],
    headingLevels: [],
    bodyWordCount: 0,
    canonicalTagPresent: false,
  };

  if (!html || typeof html !== "string") {
    return pageData;
  }

  // 1. Extract <title>
  const titleMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch && titleMatch[1]) {
    pageData.title = stripTags(titleMatch[1]);
  }

  // 2. Extract meta tags
  const metaRegex = /<meta\b[^>]*>/gi;
  let metaMatch: RegExpExecArray | null;

  while ((metaMatch = metaRegex.exec(html)) !== null) {
    const tag = metaMatch[0];
    const name = (getAttribute(tag, "name") || "").toLowerCase();
    const property = (getAttribute(tag, "property") || "").toLowerCase();
    const content = getAttribute(tag, "content") || "";

    if (name === "description" && !pageData.metaDescription) {
      pageData.metaDescription = content.trim();
    } else if (name === "viewport" && !pageData.viewport) {
      pageData.viewport = content.trim();
    } else if ((name === "robots" || /bot$/i.test(name)) && content) {
      pageData.robotsMeta = [pageData.robotsMeta, content.trim()].filter(Boolean).join("; ");
    } else if (property === "og:title" && !pageData.ogTitle) {
      pageData.ogTitle = content.trim();
    } else if (property === "og:description" && !pageData.ogDescription) {
      pageData.ogDescription = content.trim();
    } else if (property === "og:image" && !pageData.ogImage) {
      pageData.ogImage = content.trim();
    } else if (property === "og:url" && !pageData.ogUrl) {
      pageData.ogUrl = content.trim();
    }
  }

  // 3. Extract canonical <link rel="canonical" href="...">
  const linkRegex = /<link\b[^>]*>/gi;
  let linkMatch: RegExpExecArray | null;
  while ((linkMatch = linkRegex.exec(html)) !== null) {
    const tag = linkMatch[0];
    const rel = (getAttribute(tag, "rel") || "").toLowerCase();
    if (rel.split(/\s+/).includes("canonical")) {
      pageData.canonicalTagPresent = true;
      const href = getAttribute(tag, "href");
      if (href && !pageData.canonical) {
        pageData.canonical = href.trim();
      }
    }
  }

  // 4. Extract <h1> tags
  const h1Regex = /<h1\b[^>]*>([\s\S]*?)<\/h1>/gi;
  let h1Match: RegExpExecArray | null;
  while ((h1Match = h1Regex.exec(html)) !== null) {
    const text = stripTags(h1Match[1]);
    if (text) {
      pageData.h1List.push(text);
    }
  }

  const headingRegex = /<h([1-6])\b[^>]*>/gi;
  let headingMatch: RegExpExecArray | null;
  while ((headingMatch = headingRegex.exec(html)) !== null) pageData.headingLevels.push(Number(headingMatch[1]));

  const bodyMatch = html.match(/<body\b[^>]*>([\s\S]*?)<\/body\s*>/i);
  const bodyHtml = bodyMatch?.[1] ?? html.replace(/<head\b[^>]*>[\s\S]*?<\/head\s*>/i, " ");
  const readableHtml = bodyHtml
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|header|nav|footer|aside|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ");
  const visibleText = stripTags(readableHtml);
  pageData.bodyWordCount = visibleText.match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu)?.length || 0;

  return pageData;
}

export interface AnalysisInput {
  targetUrl: string;
  finalUrl: string;
  httpStatus: number;
  statusText: string;
  responseTimeMs: number;
  headers: Record<string, string>;
  htmlBody: string;
}

/**
 * Runs 10 technical checks on the fetched website response and parsed HTML.
 * Generates structured findings with concrete evidence and recommendations.
 */
export function analyzeWebsite({
  finalUrl,
  httpStatus,
  statusText,
  responseTimeMs,
  headers,
  htmlBody,
}: AnalysisInput): {
  findings: ScanFinding[];
  summary: ScanSummary;
  pageData: ParsedHtmlData;
} {
  const timestamp = new Date().toISOString();
  const pageData = parseHtmlContent(htmlBody);
  const findings: ScanFinding[] = [];
  const finish = () => {
    const completedFindings = findings.map((finding) => ({
      ...finding,
      recommendation: finding.recommendation || DEFAULT_RECOMMENDATIONS[finding.ruleId] || "Rà soát bằng chứng và xác nhận thay đổi phù hợp với mục tiêu của trang.",
    }));
    const count = (status: ScanFinding["status"]) => completedFindings.filter((finding) => finding.status === status).length;
    const summary: ScanSummary = {
      totalRules: completedFindings.length,
      passCount: count("PASS"),
      failCount: count("FAIL"),
      unknownCount: count("UNKNOWN"),
      reviewRequiredCount: count("REVIEW_REQUIRED"),
      criticalCount: completedFindings.filter((finding) => finding.severity === "CRITICAL" && finding.status === "FAIL").length,
      highCount: completedFindings.filter((finding) => finding.severity === "HIGH" && finding.status === "FAIL").length,
      mediumCount: completedFindings.filter((finding) => finding.severity === "MEDIUM" && finding.status === "FAIL").length,
      lowCount: completedFindings.filter((finding) => finding.severity === "LOW" && finding.status === "FAIL").length,
      infoCount: completedFindings.filter((finding) => finding.severity === "INFO").length,
    };
    return { findings: completedFindings, summary, pageData };
  };

  // Error documents are not evidence for page-level SEO rules.
  if (httpStatus < 200 || httpStatus >= 300) {
    const transient = httpStatus === 429 || httpStatus === 503;
    const status: ScanFinding["status"] = transient || httpStatus < 400 ? "REVIEW_REQUIRED" : "FAIL";
    findings.push({
      ruleId: "HTTP_STATUS",
      ruleName: "Mã trạng thái phản hồi HTTP",
      category: "TECHNICAL",
      severity: transient ? "HIGH" : httpStatus >= 500 ? "CRITICAL" : [401, 403, 404].includes(httpStatus) ? "HIGH" : "MEDIUM",
      status,
      description: transient
        ? `Máy chủ phản hồi HTTP ${httpStatus}; đây có thể là giới hạn tốc độ hoặc lỗi tạm thời.`
        : httpStatus >= 400 ? `Máy chủ trả về lỗi HTTP ${httpStatus}.` : `Không nhận được phản hồi trang cuối ở dải HTTP 2xx (HTTP ${httpStatus}).`,
      evidence: `HTTP ${httpStatus}${statusText ? ` ${statusText}` : ""} tại ${finalUrl}.`,
      sourceUrl: finalUrl,
      timestamp,
      recommendation: transient
        ? "Xác nhận trạng thái trên trình duyệt thông thường hoặc thử lại sau; không kết luận lỗi nội dung từ phản hồi giới hạn/tạm thời này."
        : "Kiểm tra URL và trạng thái HTTP từ trình duyệt; khôi phục tài nguyên hoặc cập nhật liên kết nếu lỗi được xác nhận.",
    });
    return finish();
  }
  findings.push({
    ruleId: "HTTP_STATUS",
    ruleName: "Mã trạng thái phản hồi HTTP",
    category: "TECHNICAL",
    severity: "INFO",
    status: "PASS",
    description: "Máy chủ trả về phản hồi thành công trong dải HTTP 2xx.",
    evidence: `HTTP ${httpStatus}${statusText ? ` ${statusText}` : ""} tại ${finalUrl}.`,
    sourceUrl: finalUrl,
    timestamp,
  });

  // Check 2: Protocol & HTTPS Security
  const isHttps = finalUrl.toLowerCase().startsWith("https://");
  if (isHttps) {
    findings.push({
      ruleId: "SECURITY_HTTPS",
      ruleName: "Giao thức bảo mật HTTPS / SSL",
      category: "SECURITY",
      severity: "INFO",
      status: "PASS",
      description: "Trang web sử dụng giao thức HTTPS được mã hóa an toàn.",
      evidence: `URL đích sử dụng HTTPS (${finalUrl}). Kết nối giữa người dùng và máy chủ được mã hóa SSL/TLS.`,
      sourceUrl: finalUrl,
      timestamp,
    });
  } else {
    findings.push({
      ruleId: "SECURITY_HTTPS",
      ruleName: "Giao thức bảo mật HTTPS / SSL",
      category: "SECURITY",
      severity: "MEDIUM",
      status: "FAIL",
      description: "Trang web vẫn đang sử dụng giao thức HTTP chưa được mã hóa.",
      evidence: `URL đích là HTTP thông thường (${finalUrl}). Dữ liệu gửi qua mạng có thể bị xem trộm và trình duyệt cảnh báo 'Không bảo mật'.`,
      sourceUrl: finalUrl,
      timestamp,
      recommendation: "Cài đặt chứng chỉ SSL/TLS (ví dụ Let's Encrypt hoặc Cloudflare) và cấu hình tự động chuyển hướng 301 toàn bộ truy cập từ HTTP sang HTTPS.",
    });
  }

  // Title presence is direct evidence; length follows a review-only internal guideline.
  if (!pageData.title) {
    findings.push({
      ruleId: "SEO_TITLE_EXISTS",
      ruleName: "Thẻ tiêu đề trang (HTML Title)",
      category: "SEO",
      severity: "HIGH",
      status: "FAIL",
      description: "Trang web thiếu thẻ <title> hoặc nội dung thẻ rỗng.",
      evidence: "Không tìm thấy thẻ <title> trong mã nguồn HTML của trang.",
      sourceUrl: finalUrl,
      timestamp,
      recommendation: "Thêm tiêu đề mô tả chính xác nội dung trang vào phần head.",
    });
  } else {
    const titleLen = pageData.title.length;
    const withinGuideline = titleLen >= SEO_THRESHOLDS.titleMinChars && titleLen <= SEO_THRESHOLDS.titleMaxChars;
    findings.push({
      ruleId: "SEO_TITLE_EXISTS",
      ruleName: "Thẻ tiêu đề trang (HTML Title)",
      category: "SEO",
      severity: "INFO",
      status: "PASS",
      description: "Tìm thấy nội dung thẻ <title>.",
      evidence: `Tiêu đề: "${pageData.title}" (${titleLen} ký tự).`,
      sourceUrl: finalUrl,
      timestamp,
    });
    findings.push({
      ruleId: "SEO_TITLE_LENGTH",
      ruleName: "Độ dài tiêu đề trang (HTML Title)",
      category: "SEO",
      severity: withinGuideline ? "INFO" : "MEDIUM",
      status: withinGuideline ? "PASS" : "REVIEW_REQUIRED",
      description: withinGuideline
        ? `Độ dài nằm trong hướng dẫn nội bộ ${SEO_THRESHOLDS.titleMinChars}–${SEO_THRESHOLDS.titleMaxChars} ký tự.`
        : `Độ dài nằm ngoài hướng dẫn nội bộ ${SEO_THRESHOLDS.titleMinChars}–${SEO_THRESHOLDS.titleMaxChars} ký tự; đây không phải ngưỡng xếp hạng của công cụ tìm kiếm.`,
      evidence: `Tiêu đề có ${titleLen} ký tự; hướng dẫn nội bộ là ${SEO_THRESHOLDS.titleMinChars}–${SEO_THRESHOLDS.titleMaxChars}.`,
      sourceUrl: finalUrl,
      timestamp,
    });
  }

  // Description presence and length are reported separately; neither proves a ranking outcome.
  if (!pageData.metaDescription) {
    findings.push({
      ruleId: "SEO_META_DESCRIPTION",
      ruleName: "Thẻ mô tả tóm tắt (Meta Description)",
      category: "SEO",
      severity: "MEDIUM",
      status: "REVIEW_REQUIRED",
      description: "Trang web thiếu thẻ <meta name=\"description\">.",
      evidence: "Không tìm thấy thẻ <meta name=\"description\"> trong mã nguồn HTML.",
      sourceUrl: finalUrl,
      timestamp,
      recommendation: "Xác nhận trang có cần mô tả riêng cho kết quả tìm kiếm; nếu có, viết mô tả trung thực với nội dung trang.",
    });
  } else {
    const descLen = pageData.metaDescription.length;
    findings.push({
      ruleId: "SEO_META_DESCRIPTION",
      ruleName: "Thẻ mô tả tóm tắt (Meta Description)",
      category: "SEO",
      severity: "INFO",
      status: "PASS",
      description: "Tìm thấy nội dung meta description.",
      evidence: `Mô tả: "${pageData.metaDescription}" (${descLen} ký tự).`,
      sourceUrl: finalUrl,
      timestamp,
    });
    const withinGuideline = descLen >= SEO_THRESHOLDS.metaDescriptionMinChars && descLen <= SEO_THRESHOLDS.metaDescriptionMaxChars;
    findings.push({
      ruleId: "SEO_META_DESCRIPTION_LENGTH",
      ruleName: "Độ dài meta description",
      category: "SEO",
      severity: withinGuideline ? "INFO" : "LOW",
      status: withinGuideline ? "PASS" : "REVIEW_REQUIRED",
      description: withinGuideline
        ? `Độ dài nằm trong hướng dẫn nội bộ ${SEO_THRESHOLDS.metaDescriptionMinChars}–${SEO_THRESHOLDS.metaDescriptionMaxChars} ký tự.`
        : `Độ dài nằm ngoài hướng dẫn nội bộ ${SEO_THRESHOLDS.metaDescriptionMinChars}–${SEO_THRESHOLDS.metaDescriptionMaxChars} ký tự; nội dung hiển thị có thể được viết lại.`,
      evidence: `Meta description có ${descLen} ký tự; hướng dẫn nội bộ là ${SEO_THRESHOLDS.metaDescriptionMinChars}–${SEO_THRESHOLDS.metaDescriptionMaxChars}.`,
      sourceUrl: finalUrl,
      timestamp,
    });
  }

  // Canonical is optional; validate syntax and target only when declared.
  if (!pageData.canonicalTagPresent) {
    findings.push({
      ruleId: "SEO_CANONICAL",
      ruleName: "Thẻ định danh trang chuẩn (Canonical Tag)",
      category: "SEO",
      severity: "LOW",
      status: "UNKNOWN",
      description: "Không khai báo canonical; sự vắng mặt đơn lẻ không xác định tác động tìm kiếm.",
      evidence: "Không tìm thấy thẻ rel=canonical trong HTML.",
      sourceUrl: finalUrl,
      timestamp,
      recommendation: "Canonical là tùy chọn; chỉ thêm hoặc thay đổi nó khi cần nêu URL chuẩn cho trang này.",
    });
  } else if (!pageData.canonical) {
    findings.push({
      ruleId: "SEO_CANONICAL",
      ruleName: "Thẻ định danh trang chuẩn (Canonical Tag)",
      category: "SEO",
      severity: "HIGH",
      status: "FAIL",
      description: "Thẻ canonical được khai báo nhưng thiếu href có thể dùng.",
      evidence: "Tìm thấy rel=canonical nhưng href rỗng hoặc bị thiếu.",
      sourceUrl: finalUrl,
      timestamp,
      recommendation: "Kiểm tra markup canonical và khai báo href HTTP(S) hợp lệ.",
    });
  } else {
    try {
      const canonicalUrl = new URL(pageData.canonical, finalUrl);
      if (canonicalUrl.protocol !== "http:" && canonicalUrl.protocol !== "https:") throw new Error("unsupported protocol");
      canonicalUrl.hash = "";
      const currentUrl = new URL(finalUrl);
      currentUrl.hash = "";
      const isMatch = canonicalUrl.href === currentUrl.href;
      findings.push({
        ruleId: isMatch ? "SEO_CANONICAL" : "SEO_CANONICAL_MISMATCH",
        ruleName: isMatch ? "Thẻ định danh trang chuẩn (Canonical Tag)" : "Canonical trỏ tới URL khác",
        category: "SEO",
        severity: isMatch ? "INFO" : "MEDIUM",
        status: isMatch ? "PASS" : "REVIEW_REQUIRED",
        description: isMatch
          ? "Canonical trỏ tới URL trang hiện tại."
          : "Canonical trỏ tới URL khác; cần xác nhận đây là lựa chọn có chủ đích.",
        evidence: `Canonical "${pageData.canonical}" phân giải thành "${canonicalUrl.href}"; URL được tải là "${currentUrl.href}".`,
        sourceUrl: finalUrl,
        timestamp,
      });
    } catch {
      findings.push({
        ruleId: "SEO_CANONICAL",
        ruleName: "Thẻ định danh trang chuẩn (Canonical Tag)",
        category: "SEO",
        severity: "HIGH",
        status: "FAIL",
        description: "Href canonical không thể phân giải thành URL HTTP(S) hợp lệ.",
        evidence: `Canonical khai báo "${pageData.canonical}" trên URL "${finalUrl}".`,
        sourceUrl: finalUrl,
        timestamp,
      });
    }
  }

  // Check 6: Robots Meta & Noindex Detection
  const rawRobotsMeta = pageData.robotsMeta || "";
  const rawXRobotsTag = Object.entries(headers).find(([name]) => name.toLowerCase() === "x-robots-tag")?.[1] || "";
  const combinedRobots = `${rawRobotsMeta} ${rawXRobotsTag}`.toLowerCase();
  const hasNoindex = /\b(noindex|none)\b/i.test(combinedRobots);

  if (hasNoindex) {
    findings.push({
      ruleId: "SEO_ROBOTS_NOINDEX",
      ruleName: "Chỉ thị chặn lập chỉ mục tìm kiếm (Robots Noindex)",
      category: "SEO",
      severity: "HIGH",
      status: "REVIEW_REQUIRED",
      description: "Phát hiện chỉ thị noindex; cần xác nhận trang này có nên được lập chỉ mục hay không.",
      evidence: `Chỉ thị phát hiện: meta robots = "${rawRobotsMeta || "—"}", X-Robots-Tag = "${rawXRobotsTag || "—"}".`,
      sourceUrl: finalUrl,
      timestamp,
      recommendation: "Xác nhận noindex là chủ đích trước khi giữ hoặc gỡ chỉ thị này.",
    });
  } else {
    findings.push({
      ruleId: "SEO_ROBOTS_NOINDEX",
      ruleName: "Chỉ thị chặn lập chỉ mục tìm kiếm (Robots Noindex)",
      category: "SEO",
      severity: "INFO",
      status: "PASS",
      description: "Không phát hiện chỉ thị noindex trong các nguồn robots được kiểm tra.",
      evidence: `meta robots="${rawRobotsMeta || "(không có)"}", X-Robots-Tag="${rawXRobotsTag || "(không có)"}".`,
      sourceUrl: finalUrl,
      timestamp,
    });
  }

  // H1 count and heading sequence are heuristics; unusual structures require review.
  const h1Count = pageData.h1List.length;
  if (h1Count === 0) {
    findings.push({
      ruleId: "SEO_H1_COUNT",
      ruleName: "Số lượng thẻ tiêu đề cấp 1 (H1 Count)",
      category: "SEO",
      severity: "MEDIUM",
      status: "REVIEW_REQUIRED",
      description: "Trang web không có thẻ <h1> nào.",
      evidence: "Tìm thấy 0 thẻ <h1> trong tài liệu HTML. Cấu trúc trang thiếu tiêu đề chính.",
      sourceUrl: finalUrl,
      timestamp,
      recommendation: "Rà soát xem trang có cần một heading chính rõ ràng hay không.",
    });
  } else if (h1Count === 1) {
    findings.push({
      ruleId: "SEO_H1_COUNT",
      ruleName: "Số lượng thẻ tiêu đề cấp 1 (H1 Count)",
      category: "SEO",
      severity: "INFO",
      status: "PASS",
      description: "Trang web có đúng 1 thẻ <h1> chuẩn cấu trúc tài liệu.",
      evidence: `Tìm thấy đúng 1 thẻ <h1>: "${pageData.h1List[0]}" (${pageData.h1List[0].length} ký tự).`,
      sourceUrl: finalUrl,
      timestamp,
    });
  } else {
    findings.push({
      ruleId: "SEO_H1_COUNT",
      ruleName: "Số lượng thẻ tiêu đề cấp 1 (H1 Count)",
      category: "SEO",
      severity: "MEDIUM",
      status: "REVIEW_REQUIRED",
      description: `Trang web sử dụng ${h1Count} thẻ <h1>, làm loãng cấu trúc phân cấp nội dung.`,
      evidence: `Tìm thấy ${h1Count} thẻ <h1>: ${pageData.h1List.map((h, i) => `[${i + 1}] "${h}"`).slice(0, 3).join(", ")}${h1Count > 3 ? "..." : ""}.`,
      sourceUrl: finalUrl,
      timestamp,
      recommendation: "Rà soát cấu trúc H1 theo nội dung trang; nhiều H1 không tự nó chứng minh lỗi tìm kiếm.",
    });
  }

  const skippedHeadingTransitions: string[] = [];
  for (let index = 0; index < pageData.headingLevels.length; index += 1) {
    const current = pageData.headingLevels[index];
    const previous = pageData.headingLevels[index - 1];
    if ((index === 0 && current > 1) || (previous !== undefined && current > previous + 1)) {
      skippedHeadingTransitions.push(index === 0 ? `H${current} xuất hiện trước H1` : `H${previous}→H${current}`);
    }
  }
  findings.push({
    ruleId: "SEO_HEADING_HIERARCHY",
    ruleName: "Thứ tự cấp heading",
    category: "SEO",
    severity: skippedHeadingTransitions.length ? "LOW" : "INFO",
    status: pageData.headingLevels.length === 0 ? "UNKNOWN" : skippedHeadingTransitions.length ? "REVIEW_REQUIRED" : "PASS",
    description: pageData.headingLevels.length === 0
      ? "Không tìm thấy heading để đánh giá thứ tự cấp."
      : skippedHeadingTransitions.length
        ? "Có bước nhảy cấp heading; hãy xem lại cấu trúc nội dung theo ngữ cảnh."
        : "Không phát hiện bước nhảy cấp heading.",
    evidence: pageData.headingLevels.length === 0
      ? "Không tìm thấy thẻ H1–H6."
      : `Thứ tự cấp: ${pageData.headingLevels.map((level) => `H${level}`).join(" → ")}${skippedHeadingTransitions.length ? `; điểm cần xem: ${skippedHeadingTransitions.join(", ")}` : ""}.`,
    sourceUrl: finalUrl,
    timestamp,
  });

  const thinContent = pageData.bodyWordCount < SEO_THRESHOLDS.thinContentWordCount;
  findings.push({
    ruleId: "SEO_THIN_CONTENT",
    ruleName: "Lượng văn bản hiển thị (heuristic)",
    category: "SEO",
    severity: thinContent ? "LOW" : "INFO",
    status: thinContent ? "REVIEW_REQUIRED" : "PASS",
    description: thinContent
      ? `Tìm thấy ít hơn ${SEO_THRESHOLDS.thinContentWordCount} từ; số từ đơn lẻ không xác định chất lượng nội dung.`
      : `Tìm thấy ít nhất ${SEO_THRESHOLDS.thinContentWordCount} từ theo bộ đếm đơn giản.`,
    evidence: `Ước tính ${pageData.bodyWordCount} từ hiển thị; ngưỡng rà soát nội bộ là <${SEO_THRESHOLDS.thinContentWordCount}.`,
    sourceUrl: finalUrl,
    timestamp,
  });

  // Check 8: Meta Viewport (Mobile Responsiveness)
  if (pageData.viewport && /width=device-width/i.test(pageData.viewport)) {
    findings.push({
      ruleId: "MOBILE_VIEWPORT",
      ruleName: "Cấu hình hiển thị di động (Meta Viewport)",
      category: "MOBILE",
      severity: "INFO",
      status: "PASS",
      description: "Thẻ meta viewport được cấu hình đúng chuẩn co giãn di động.",
      evidence: `Thẻ meta viewport: "${pageData.viewport}". Giao diện sẵn sàng thích ứng tốt trên các kích thước màn hình smartphone/tablet.`,
      sourceUrl: finalUrl,
      timestamp,
    });
  } else {
    findings.push({
      ruleId: "MOBILE_VIEWPORT",
      ruleName: "Cấu hình hiển thị di động (Meta Viewport)",
      category: "MOBILE",
      severity: "HIGH",
      status: "FAIL",
      description: "Thiếu thẻ <meta name=\"viewport\"> hoặc không có thuộc tính 'width=device-width'.",
      evidence: pageData.viewport
        ? `Giá trị viewport hiện tại: "${pageData.viewport}" (thiếu width=device-width).`
        : "Không tìm thấy thẻ <meta name=\"viewport\"> trong phần <head>.",
      sourceUrl: finalUrl,
      timestamp,
      recommendation: "Thêm thẻ <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\"> vào <head> để giao diện hiển thị tối ưu trên thiết bị di động.",
    });
  }

  // Check 9: Open Graph Basic Tags (Social Sharing)
  const ogMissing: string[] = [];
  if (!pageData.ogTitle) ogMissing.push("og:title");
  if (!pageData.ogDescription) ogMissing.push("og:description");
  if (!pageData.ogImage) ogMissing.push("og:image");

  if (ogMissing.length === 0) {
    findings.push({
      ruleId: "SOCIAL_OG_TAGS",
      ruleName: "Thẻ chia sẻ mạng xã hội (Open Graph Tags)",
      category: "SOCIAL",
      severity: "INFO",
      status: "PASS",
      description: "Trang web có đầy đủ các thẻ Open Graph cơ bản.",
      evidence: `Đầy đủ og:title ("${pageData.ogTitle}"), og:description và og:image ("${pageData.ogImage}"). Bản xem trước sẽ hiển thị chuyên nghiệp khi chia sẻ qua Zalo, Facebook, v.v.`,
      sourceUrl: finalUrl,
      timestamp,
    });
  } else {
    findings.push({
      ruleId: "SOCIAL_OG_TAGS",
      ruleName: "Thẻ chia sẻ mạng xã hội (Open Graph Tags)",
      category: "SOCIAL",
      severity: "LOW",
      status: "FAIL",
      description: `Thiếu một số thẻ Open Graph quan trọng: ${ogMissing.join(", ")}.`,
      evidence: `Các thẻ còn thiếu: ${ogMissing.join(", ")}. Khi chia sẻ liên kết trên Zalo/Facebook, bài viết có thể không hiển thị đúng hình đại diện hoặc mô tả.`,
      sourceUrl: finalUrl,
      timestamp,
      recommendation: `Bổ sung các thẻ <meta property="${ogMissing[0]}" content="..."> để tối ưu hóa hình ảnh đại diện và thông điệp khi chia sẻ liên kết trên các mạng xã hội.`,
    });
  }

  // Check 10: Technical & Network Health
  if (responseTimeMs <= 1500) {
    findings.push({
      ruleId: "TECHNICAL_HEALTH",
      ruleName: "Thời gian phản hồi máy chủ (TTFB / Response Time)",
      category: "PERFORMANCE",
      severity: "INFO",
      status: "PASS",
      description: "Thời gian phản hồi máy chủ nhanh và ổn định.",
      evidence: `Thời gian phản hồi máy chủ: ${responseTimeMs}ms (đạt chuẩn tốt < 1500ms).`,
      sourceUrl: finalUrl,
      timestamp,
    });
  } else if (responseTimeMs <= 3000) {
    findings.push({
      ruleId: "TECHNICAL_HEALTH",
      ruleName: "Thời gian phản hồi máy chủ (TTFB / Response Time)",
      category: "PERFORMANCE",
      severity: "LOW",
      status: "PASS",
      description: "Thời gian phản hồi máy chủ ở mức chấp nhận được nhưng có thể cải thiện thêm.",
      evidence: `Thời gian phản hồi máy chủ: ${responseTimeMs}ms (nằm trong dải 1500ms - 3000ms).`,
      sourceUrl: finalUrl,
      timestamp,
      recommendation: "Cân nhắc bật bộ nhớ đệm trang (page caching) hoặc dùng CDN để rút ngắn thời gian phản hồi xuống dưới 1500ms.",
    });
  } else {
    findings.push({
      ruleId: "TECHNICAL_HEALTH",
      ruleName: "Thời gian phản hồi máy chủ (TTFB / Response Time)",
      category: "PERFORMANCE",
      severity: "MEDIUM",
      status: "FAIL",
      description: "Thời gian phản hồi máy chủ chậm hơn 3000ms.",
      evidence: `Thời gian phản hồi: ${responseTimeMs}ms (> 3000ms). Tốc độ tải chậm ảnh hưởng tiêu cực đến trải nghiệm người dùng và tỷ lệ chuyển đổi.`,
      sourceUrl: finalUrl,
      timestamp,
      recommendation: "Kiểm tra tài nguyên máy chủ, tối ưu hóa truy vấn cơ sở dữ liệu và triển khai hệ thống lưu đệm (cache) hoặc mạng phân phối nội dung (CDN).",
    });
  }

  return finish();
}

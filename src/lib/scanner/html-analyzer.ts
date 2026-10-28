import type {
  ParsedHtmlData,
  ScanFinding,
  ScanSummary,
} from "@/types/scanner";

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
    } else if (name === "robots" && !pageData.robotsMeta) {
      pageData.robotsMeta = content.trim();
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

  // Check 1: HTTP Response Status
  if (httpStatus === 200) {
    findings.push({
      ruleId: "HTTP_STATUS",
      ruleName: "Mã trạng thái phản hồi HTTP",
      category: "TECHNICAL",
      severity: "INFO",
      status: "PASS",
      description: "Máy chủ phản hồi mã trạng thái 200 OK thành công.",
      evidence: `Mã HTTP ${httpStatus} OK. Trang web phản hồi bình thường và sẵn sàng phục vụ người dùng.`,
      sourceUrl: finalUrl,
      timestamp,
    });
  } else if (httpStatus === 404) {
    findings.push({
      ruleId: "HTTP_STATUS",
      ruleName: "Mã trạng thái phản hồi HTTP",
      category: "TECHNICAL",
      severity: "CRITICAL",
      status: "FAIL",
      description: "Trang web không tồn tại (HTTP 404 Not Found).",
      evidence: `Mã phản hồi HTTP ${httpStatus} Not Found. Đường dẫn URL không tìm thấy tài nguyên.`,
      sourceUrl: finalUrl,
      timestamp,
      recommendation: "Kiểm tra lại tính chính xác của đường dẫn URL hoặc cấu hình chuyển hướng 301 về trang chủ nếu URL đã thay đổi.",
    });
  } else if (httpStatus === 403) {
    findings.push({
      ruleId: "HTTP_STATUS",
      ruleName: "Mã trạng thái phản hồi HTTP",
      category: "TECHNICAL",
      severity: "HIGH",
      status: "FAIL",
      description: "Máy chủ chặn quyền truy cập (HTTP 403 Forbidden).",
      evidence: `Mã phản hồi HTTP ${httpStatus} Forbidden. Máy chủ từ chối phục vụ yêu cầu từ bot hoặc người dùng.`,
      sourceUrl: finalUrl,
      timestamp,
      recommendation: "Kiểm tra cấu hình tường lửa (WAF), quyền thư mục trên máy chủ hoặc các quy tắc chặn bot hợp lệ.",
    });
  } else if (httpStatus >= 500) {
    findings.push({
      ruleId: "HTTP_STATUS",
      ruleName: "Mã trạng thái phản hồi HTTP",
      category: "TECHNICAL",
      severity: "CRITICAL",
      status: "FAIL",
      description: "Lỗi máy chủ nội bộ (HTTP 5xx Server Error).",
      evidence: `Mã phản hồi HTTP ${httpStatus}. Hệ thống máy chủ của website đang gặp sự cố nội bộ.`,
      sourceUrl: finalUrl,
      timestamp,
      recommendation: "Kiểm tra nhật ký lỗi máy chủ (error logs), dịch vụ ứng dụng hoặc cơ sở dữ liệu của website.",
    });
  } else {
    findings.push({
      ruleId: "HTTP_STATUS",
      ruleName: "Mã trạng thái phản hồi HTTP",
      category: "TECHNICAL",
      severity: "MEDIUM",
      status: "FAIL",
      description: `Máy chủ phản hồi mã trạng thái HTTP ${httpStatus}.`,
      evidence: `Mã HTTP ${httpStatus}. Phản hồi không phải là 200 OK thông thường.`,
      sourceUrl: finalUrl,
      timestamp,
      recommendation: "Xem lại cấu hình định tuyến và mã trạng thái phản hồi của trang web.",
    });
  }

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

  // Check 3: HTML Title & Title Length
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
      recommendation: "Thêm thẻ <title> trong phần <head> chứa tên doanh nghiệp và dịch vụ chính (độ dài khuyến nghị 10 - 70 ký tự).",
    });
  } else {
    const titleLen = pageData.title.length;
    if (titleLen < 10) {
      findings.push({
        ruleId: "SEO_TITLE_LENGTH",
        ruleName: "Độ dài tiêu đề trang (HTML Title)",
        category: "SEO",
        severity: "MEDIUM",
        status: "FAIL",
        description: "Tiêu đề trang quá ngắn, chưa đủ thông tin định danh.",
        evidence: `Nội dung: "${pageData.title}" (${titleLen} ký tự). Độ dài khuyến nghị từ 10 đến 70 ký tự.`,
        sourceUrl: finalUrl,
        timestamp,
        recommendation: "Mở rộng tiêu đề bằng cách bổ sung tên dịch vụ, địa điểm hoặc giá trị nổi bật của doanh nghiệp.",
      });
    } else if (titleLen > 70) {
      findings.push({
        ruleId: "SEO_TITLE_LENGTH",
        ruleName: "Độ dài tiêu đề trang (HTML Title)",
        category: "SEO",
        severity: "LOW",
        status: "FAIL",
        description: "Tiêu đề trang vượt quá 70 ký tự, có thể bị cắt ngắn trên kết quả tìm kiếm Google.",
        evidence: `Nội dung: "${pageData.title}" (${titleLen} ký tự). Google thường chỉ hiển thị khoảng 60 - 70 ký tự đầu tiên.`,
        sourceUrl: finalUrl,
        timestamp,
        recommendation: "Rút gọn tiêu đề về dưới 70 ký tự, đưa các từ khóa quan trọng và thương hiệu lên đầu.",
      });
    } else {
      findings.push({
        ruleId: "SEO_TITLE_EXISTS",
        ruleName: "Thẻ tiêu đề trang (HTML Title)",
        category: "SEO",
        severity: "INFO",
        status: "PASS",
        description: "Thẻ <title> tồn tại và có độ dài hợp chuẩn.",
        evidence: `Tiêu đề: "${pageData.title}" (${titleLen} ký tự, nằm trong khoảng tối ưu 10 - 70 ký tự).`,
        sourceUrl: finalUrl,
        timestamp,
      });
    }
  }

  // Check 4: Meta Description
  if (!pageData.metaDescription) {
    findings.push({
      ruleId: "SEO_META_DESCRIPTION",
      ruleName: "Thẻ mô tả tóm tắt (Meta Description)",
      category: "SEO",
      severity: "HIGH",
      status: "FAIL",
      description: "Trang web thiếu thẻ <meta name=\"description\">.",
      evidence: "Không tìm thấy thẻ <meta name=\"description\"> trong mã nguồn HTML.",
      sourceUrl: finalUrl,
      timestamp,
      recommendation: "Bổ sung thẻ meta description dài khoảng 50 - 160 ký tự, tóm tắt nội dung hấp dẫn và có lời kêu gọi hành động để tăng tỷ lệ nhấp (CTR).",
    });
  } else {
    const descLen = pageData.metaDescription.length;
    if (descLen < 50) {
      findings.push({
        ruleId: "SEO_META_DESCRIPTION",
        ruleName: "Thẻ mô tả tóm tắt (Meta Description)",
        category: "SEO",
        severity: "LOW",
        status: "FAIL",
        description: "Thẻ meta description quá ngắn, chưa đủ thông tin thuyết phục người dùng.",
        evidence: `Nội dung: "${pageData.metaDescription}" (${descLen} ký tự). Khuyến nghị độ dài tối ưu từ 50 đến 160 ký tự.`,
        sourceUrl: finalUrl,
        timestamp,
        recommendation: "Viết thêm 1 - 2 câu súc tích mô tả lợi ích và dịch vụ cung cấp để đạt độ dài chuẩn 50 - 160 ký tự.",
      });
    } else if (descLen > 160) {
      findings.push({
        ruleId: "SEO_META_DESCRIPTION",
        ruleName: "Thẻ mô tả tóm tắt (Meta Description)",
        category: "SEO",
        severity: "LOW",
        status: "FAIL",
        description: "Thẻ meta description dài hơn 160 ký tự, sẽ bị cắt bớt bằng dấu '...' trên kết quả tìm kiếm.",
        evidence: `Nội dung: "${pageData.metaDescription.slice(0, 100)}..." (${descLen} ký tự).`,
        sourceUrl: finalUrl,
        timestamp,
        recommendation: "Rút gọn mô tả xuống khoảng 120 - 155 ký tự để hiển thị trọn vẹn trên cả màn hình máy tính và thiết bị di động.",
      });
    } else {
      findings.push({
        ruleId: "SEO_META_DESCRIPTION",
        ruleName: "Thẻ mô tả tóm tắt (Meta Description)",
        category: "SEO",
        severity: "INFO",
        status: "PASS",
        description: "Thẻ meta description tồn tại với độ dài chuẩn SEO.",
        evidence: `Mô tả: "${pageData.metaDescription.slice(0, 90)}..." (${descLen} ký tự, nằm trong dải tối ưu 50 - 160 ký tự).`,
        sourceUrl: finalUrl,
        timestamp,
      });
    }
  }

  // Check 5: Canonical Tag
  if (pageData.canonical) {
    findings.push({
      ruleId: "SEO_CANONICAL",
      ruleName: "Thẻ định danh trang chuẩn (Canonical Tag)",
      category: "SEO",
      severity: "INFO",
      status: "PASS",
      description: "Thẻ canonical tồn tại, giúp ngăn ngừa vấn đề trùng lặp nội dung.",
      evidence: `Thẻ canonical: "${pageData.canonical}". Công cụ tìm kiếm biết rõ trang gốc cần lập chỉ mục.`,
      sourceUrl: finalUrl,
      timestamp,
    });
  } else {
    findings.push({
      ruleId: "SEO_CANONICAL",
      ruleName: "Thẻ định danh trang chuẩn (Canonical Tag)",
      category: "SEO",
      severity: "MEDIUM",
      status: "FAIL",
      description: "Thiếu thẻ <link rel=\"canonical\"> định danh URL chuẩn.",
      evidence: "Không tìm thấy thẻ <link rel=\"canonical\"> trong mã nguồn HTML.",
      sourceUrl: finalUrl,
      timestamp,
      recommendation: `Khai báo thẻ <link rel="canonical" href="${finalUrl}"> để thống nhất thứ hạng URL và tránh chia sẻ sức mạnh SEO khi có tham số truy vấn.`,
    });
  }

  // Check 6: Robots Meta & Noindex Detection
  const rawRobotsMeta = pageData.robotsMeta || "";
  const rawXRobotsTag = headers["x-robots-tag"] || "";
  const combinedRobots = `${rawRobotsMeta} ${rawXRobotsTag}`.toLowerCase();
  const hasNoindex = /\b(noindex|none)\b/i.test(combinedRobots);

  if (hasNoindex) {
    findings.push({
      ruleId: "SEO_ROBOTS_NOINDEX",
      ruleName: "Chỉ thị chặn lập chỉ mục tìm kiếm (Robots Noindex)",
      category: "SEO",
      severity: "CRITICAL",
      status: "FAIL",
      description: "Phát hiện chỉ thị 'noindex', trang web bị chặn hoàn toàn khỏi kết quả tìm kiếm Google.",
      evidence: `Chỉ thị phát hiện: meta robots = "${rawRobotsMeta || "—"}", X-Robots-Tag = "${rawXRobotsTag || "—"}".`,
      sourceUrl: finalUrl,
      timestamp,
      recommendation: "Nếu đây là trang công khai cần tiếp cận khách hàng tiềm năng, hãy gỡ bỏ ngay lập tức giá trị 'noindex' khỏi thẻ meta robots hoặc header HTTP.",
    });
  } else {
    findings.push({
      ruleId: "SEO_ROBOTS_NOINDEX",
      ruleName: "Chỉ thị chặn lập chỉ mục tìm kiếm (Robots Noindex)",
      category: "SEO",
      severity: "INFO",
      status: "PASS",
      description: "Trang web không bị chặn bởi chỉ thị noindex.",
      evidence: "Không phát hiện chỉ thị noindex hay none trong meta robots hoặc header HTTP. Trang cho phép công cụ tìm kiếm thu thập dữ liệu.",
      sourceUrl: finalUrl,
      timestamp,
    });
  }

  // Check 7: Heading H1 Count
  const h1Count = pageData.h1List.length;
  if (h1Count === 0) {
    findings.push({
      ruleId: "SEO_H1_COUNT",
      ruleName: "Số lượng thẻ tiêu đề cấp 1 (H1 Count)",
      category: "SEO",
      severity: "HIGH",
      status: "FAIL",
      description: "Trang web không có thẻ <h1> nào.",
      evidence: "Tìm thấy 0 thẻ <h1> trong tài liệu HTML. Cấu trúc trang thiếu tiêu đề chính.",
      sourceUrl: finalUrl,
      timestamp,
      recommendation: "Bổ sung đúng 1 thẻ <h1> duy nhất thể hiện thông điệp và chủ đề trọng tâm của trang.",
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
      status: "FAIL",
      description: `Trang web sử dụng ${h1Count} thẻ <h1>, làm loãng cấu trúc phân cấp nội dung.`,
      evidence: `Tìm thấy ${h1Count} thẻ <h1>: ${pageData.h1List.map((h, i) => `[${i + 1}] "${h}"`).slice(0, 3).join(", ")}${h1Count > 3 ? "..." : ""}.`,
      sourceUrl: finalUrl,
      timestamp,
      recommendation: "Chỉ giữ lại 1 thẻ <h1> duy nhất cho tiêu đề trang, các tiêu đề mục phụ nên chuyển sang dùng <h2> và <h3>.",
    });
  }

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

  // Compute summary stats
  const passCount = findings.filter((f) => f.status === "PASS").length;
  const failCount = findings.filter((f) => f.status === "FAIL").length;
  const unknownCount = findings.filter((f) => f.status === "UNKNOWN").length;

  const criticalCount = findings.filter((f) => f.severity === "CRITICAL" && f.status === "FAIL").length;
  const highCount = findings.filter((f) => f.severity === "HIGH" && f.status === "FAIL").length;
  const mediumCount = findings.filter((f) => f.severity === "MEDIUM" && f.status === "FAIL").length;
  const lowCount = findings.filter((f) => f.severity === "LOW" && f.status === "FAIL").length;
  const infoCount = findings.filter((f) => f.severity === "INFO").length;

  const summary: ScanSummary = {
    totalRules: findings.length,
    passCount,
    failCount,
    unknownCount,
    criticalCount,
    highCount,
    mediumCount,
    lowCount,
    infoCount,
  };

  return { findings, summary, pageData };
}

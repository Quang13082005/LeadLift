/**
 * Normalizes a website URL or domain into a clean, canonical hostname
 * for duplicate detection and consistent database indexing.
 * 
 * Example:
 * - "https://www.thuexemaydanang.vn/bang-gia/?ref=123" -> "thuexemaydanang.vn"
 * - "HTTP://WWW.KHACHSAN-BIEN.COM:443/" -> "khachsan-bien.com"
 */
export function parseBusinessWebsite(input: string): { url: string; domain: string } | null {
  if (typeof input !== "string") return null;
  const value = input.trim();
  if (!value || value.length > 2048 || /[\s\\\u0000-\u001f\u007f]/u.test(value)) return null;
  // A bare domain with a port is allowed, arbitrary URL schemes are not.
  if (/^[a-z][a-z\d+.-]*:/i.test(value) && !/^https?:\/\//i.test(value) && !/^[^/:]+\.\w+:\d+(?:[/?#]|$)/.test(value)) return null;
  try {
    const parsed = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) return null;
    parsed.hostname = parsed.hostname.toLowerCase().replace(/\.$/, "");
    const domain = parsed.hostname.replace(/^www\./, "");
    const labels = domain.split(".");
    if (domain.length > 253 || labels.length < 2 || !/[a-z]/i.test(labels.at(-1)!) || labels.some((label) => !/^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/i.test(label))) return null;
    return { url: parsed.href, domain };
  } catch { return null; }
}

export function normalizeDomain(rawUrlOrDomain: string): string {
  return parseBusinessWebsite(rawUrlOrDomain)?.domain ?? "";
}

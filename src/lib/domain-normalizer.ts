/**
 * Normalizes a website URL or domain into a clean, canonical hostname
 * for duplicate detection and consistent database indexing.
 * 
 * Example:
 * - "https://www.thuexemaydanang.vn/bang-gia/?ref=123" -> "thuexemaydanang.vn"
 * - "HTTP://WWW.KHACHSAN-BIEN.COM:443/" -> "khachsan-bien.com"
 */
export function normalizeDomain(rawUrlOrDomain: string): string {
  if (!rawUrlOrDomain || typeof rawUrlOrDomain !== 'string') {
    return '';
  }

  let cleaned = rawUrlOrDomain.trim().toLowerCase();

  // If protocol is missing, prefix with https:// to parse using URL API
  if (!cleaned.startsWith('http://') && !cleaned.startsWith('https://')) {
    cleaned = `https://${cleaned}`;
  }

  try {
    const parsed = new URL(cleaned);
    let hostname = parsed.hostname.toLowerCase();

    // Remove leading "www."
    if (hostname.startsWith('www.')) {
      hostname = hostname.slice(4);
    }

    return hostname;
  } catch {
    // Fallback if URL parsing fails: regex cleanup
    return cleaned
      .replace(/^https?:\/\//i, '')
      .replace(/^www\./i, '')
      .split(/[\/?#:]/)[0]
      .trim();
  }
}

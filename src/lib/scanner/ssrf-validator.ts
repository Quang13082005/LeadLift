import net from "node:net";
import dns from "node:dns";

export interface UrlValidationResult {
  valid: boolean;
  reason?: string;
  code?: string;
  parsedUrl?: URL;
  normalizedUrl?: string;
}

export interface IpValidationResult {
  isRestricted: boolean;
  reason?: string;
  normalizedIp?: string;
}

export interface UrlValidationOptions {
  /** Exact hostname allowed by a scoped crawl. Never permits subdomains. */
  allowedHost?: string;
}

/**
 * Checks if an IPv4 address falls within private, loopback, link-local,
 * multicast, or other non-public/reserved IP ranges.
 */
function checkIpv4Octets(o1: number, o2: number, o3: number, o4: number): IpValidationResult {
  if (
    [o1, o2, o3, o4].some((o) => isNaN(o) || o < 0 || o > 255)
  ) {
    return { isRestricted: true, reason: "Địa chỉ IPv4 không hợp lệ." };
  }

  const normalizedIp = `${o1}.${o2}.${o3}.${o4}`;

  // 0.0.0.0/8 (Broadcast / Current Network)
  if (o1 === 0) {
    return { isRestricted: true, reason: "Địa chỉ mạng hiện tại / Broadcast (0.0.0.0/8).", normalizedIp };
  }

  // 10.0.0.0/8 (Private-Use RFC 1918)
  if (o1 === 10) {
    return { isRestricted: true, reason: "Mạng nội bộ riêng RFC 1918 (10.0.0.0/8).", normalizedIp };
  }

  // 100.64.0.0/10 (Carrier-Grade NAT RFC 6598: 100.64.0.0 - 100.127.255.255)
  if (o1 === 100 && o2 >= 64 && o2 <= 127) {
    return { isRestricted: true, reason: "Dải địa chỉ chia sẻ / CGNAT RFC 6598 (100.64.0.0/10).", normalizedIp };
  }

  // 127.0.0.0/8 (Loopback RFC 1122)
  if (o1 === 127) {
    return { isRestricted: true, reason: "Địa chỉ Loopback cục bộ (127.0.0.0/8).", normalizedIp };
  }

  // 169.254.0.0/16 (Link-Local RFC 3927 / Cloud Metadata 169.254.169.254)
  if (o1 === 169 && o2 === 254) {
    return { isRestricted: true, reason: "Địa chỉ Link-Local / Cloud Metadata (169.254.0.0/16).", normalizedIp };
  }

  // 172.16.0.0/12 (Private-Use RFC 1918: 172.16.0.0 - 172.31.255.255)
  if (o1 === 172 && o2 >= 16 && o2 <= 31) {
    return { isRestricted: true, reason: "Mạng nội bộ riêng RFC 1918 (172.16.0.0/12).", normalizedIp };
  }

  // 192.0.0.0/24 (IETF Protocol Assignments)
  if (o1 === 192 && o2 === 0 && o3 === 0) {
    return { isRestricted: true, reason: "Dải địa chỉ giao thức IETF (192.0.0.0/24).", normalizedIp };
  }

  // 192.0.2.0/24 (TEST-NET-1 documentation)
  if (o1 === 192 && o2 === 0 && o3 === 2) {
    return { isRestricted: true, reason: "Dải địa chỉ tài liệu TEST-NET-1 (192.0.2.0/24).", normalizedIp };
  }

  // 192.88.99.0/24 (6to4 Relay Anycast RFC 3068)
  if (o1 === 192 && o2 === 88 && o3 === 99) {
    return { isRestricted: true, reason: "Dải địa chỉ 6to4 Relay Anycast (192.88.99.0/24).", normalizedIp };
  }

  // 192.168.0.0/16 (Private-Use RFC 1918)
  if (o1 === 192 && o2 === 168) {
    return { isRestricted: true, reason: "Mạng nội bộ riêng RFC 1918 (192.168.0.0/16).", normalizedIp };
  }

  // 198.18.0.0/15 (Network Interconnect Benchmark RFC 2544: 198.18.0.0 - 198.19.255.255)
  if (o1 === 198 && (o2 === 18 || o2 === 19)) {
    return { isRestricted: true, reason: "Dải địa chỉ thử nghiệm thiết bị mạng RFC 2544 (198.18.0.0/15).", normalizedIp };
  }

  // 198.51.100.0/24 (TEST-NET-2 documentation)
  if (o1 === 198 && o2 === 51 && o3 === 100) {
    return { isRestricted: true, reason: "Dải địa chỉ tài liệu TEST-NET-2 (198.51.100.0/24).", normalizedIp };
  }

  // 203.0.113.0/24 (TEST-NET-3 documentation)
  if (o1 === 203 && o2 === 0 && o3 === 113) {
    return { isRestricted: true, reason: "Dải địa chỉ tài liệu TEST-NET-3 (203.0.113.0/24).", normalizedIp };
  }

  // 224.0.0.0/4 (Multicast RFC 5771: 224.0.0.0 - 239.255.255.255)
  if (o1 >= 224 && o1 <= 239) {
    return { isRestricted: true, reason: "Địa chỉ Multicast RFC 5771 (224.0.0.0/4).", normalizedIp };
  }

  // 240.0.0.0/4 (Reserved RFC 1112 / Broadcast 255.255.255.255)
  if (o1 >= 240) {
    return { isRestricted: true, reason: "Địa chỉ dành riêng / Broadcast (240.0.0.0/4).", normalizedIp };
  }

  return { isRestricted: false, normalizedIp };
}

/**
 * Parses IPv4 notation including standard decimal, octal (0177.0.0.1),
 * hex (0x7f.0.0.1), and 32-bit dword integers.
 */
function parseIpv4Notation(input: string): { o1: number; o2: number; o3: number; o4: number } | null {
  const trimmed = input.trim();

  // Dword integer notation (e.g. 2130706433 for 127.0.0.1)
  if (/^\d+$/.test(trimmed)) {
    const num = Number(trimmed);
    if (!isNaN(num) && num >= 0 && num <= 0xffffffff) {
      const o1 = (num >>> 24) & 0xff;
      const o2 = (num >>> 16) & 0xff;
      const o3 = (num >>> 8) & 0xff;
      const o4 = num & 0xff;
      return { o1, o2, o3, o4 };
    }
  }

  // Standard or mixed octal/hex dotted notation (1 to 4 parts)
  const parts = trimmed.split(".");
  if (parts.length === 4) {
    const octets: number[] = [];
    for (const part of parts) {
      let val: number;
      if (/^0x[0-9a-f]+$/i.test(part)) {
        val = parseInt(part, 16);
      } else if (/^0[0-7]+$/.test(part)) {
        val = parseInt(part, 8);
      } else if (/^\d+$/.test(part)) {
        val = parseInt(part, 10);
      } else {
        return null;
      }
      if (isNaN(val) || val < 0 || val > 255) return null;
      octets.push(val);
    }
    return { o1: octets[0], o2: octets[1], o3: octets[2], o4: octets[3] };
  }

  return null;
}

/**
 * Validates whether an IP address (IPv4 or IPv6) is restricted (private,
 * loopback, link-local, multicast, cloud metadata, or reserved).
 */
export function isPrivateOrRestrictedIp(ipStr: string): IpValidationResult {
  const cleanIp = ipStr.trim().replace(/^\[|\]$/g, "");

  // Try parsing IPv4 (handles decimal, octal, hex, dword)
  const ipv4Parsed = parseIpv4Notation(cleanIp);
  if (ipv4Parsed) {
    return checkIpv4Octets(ipv4Parsed.o1, ipv4Parsed.o2, ipv4Parsed.o3, ipv4Parsed.o4);
  }

  // IPv6 Check
  const ipFamily = net.isIP(cleanIp);
  if (ipFamily === 6) {
    const lower = cleanIp.toLowerCase();

    // Check for IPv4-mapped IPv6 (::ffff:127.0.0.1 or ::ffff:7f00:1)
    if (lower.startsWith("::ffff:") || lower.includes(":ffff:")) {
      const lastColon = cleanIp.lastIndexOf(":");
      const embeddedIpv4 = cleanIp.substring(lastColon + 1);
      const parsedEmbedded = parseIpv4Notation(embeddedIpv4);
      if (parsedEmbedded) {
        return checkIpv4Octets(parsedEmbedded.o1, parsedEmbedded.o2, parsedEmbedded.o3, parsedEmbedded.o4);
      }
      return { isRestricted: true, reason: "Địa chỉ IPv4-mapped IPv6 bị hạn chế." };
    }

    // IPv6 Loopback (::1)
    if (lower === "::1" || /^0*(:0*)*:1$/.test(lower)) {
      return { isRestricted: true, reason: "Địa chỉ IPv6 Loopback (::1)." };
    }

    // IPv6 Unspecified (::)
    if (lower === "::" || /^0*(:0*)*$/.test(lower)) {
      return { isRestricted: true, reason: "Địa chỉ IPv6 Unspecified (::)." };
    }

    // Unique Local Address RFC 4193 (fc00::/7 -> fc00 to fdff)
    if (/^f[cd][0-9a-f]{2}:/i.test(lower)) {
      return { isRestricted: true, reason: "Địa chỉ IPv6 Unique Local Address (fc00::/7)." };
    }

    // Link-Local Unicast RFC 4291 (fe80::/10 -> fe80 to febf)
    if (/^fe[89ab][0-9a-f]:/i.test(lower)) {
      return { isRestricted: true, reason: "Địa chỉ IPv6 Link-Local (fe80::/10)." };
    }

    // Site-Local deprecated RFC 3879 (fec0::/10 -> fec0 to feff)
    if (/^fe[cdef][0-9a-f]:/i.test(lower)) {
      return { isRestricted: true, reason: "Địa chỉ IPv6 Site-Local (fec0::/10)." };
    }

    // Multicast RFC 4291 (ff00::/8)
    if (lower.startsWith("ff")) {
      return { isRestricted: true, reason: "Địa chỉ IPv6 Multicast (ff00::/8)." };
    }

    // Documentation RFC 3849 (2001:db8::/32)
    if (lower.startsWith("2001:db8:") || lower.startsWith("2001:0db8:")) {
      return { isRestricted: true, reason: "Dải địa chỉ tài liệu IPv6 (2001:db8::/32)." };
    }

    // Discard prefix RFC 6666 (100::/64)
    if (lower.startsWith("100::") || lower.startsWith("0100::")) {
      return { isRestricted: true, reason: "Dải địa chỉ IPv6 Discard-only (100::/64)." };
    }

    // IPv4/IPv6 translation RFC 6052 (64:ff9b::/96)
    if (lower.startsWith("64:ff9b:")) {
      return { isRestricted: true, reason: "Dải địa chỉ IPv4/IPv6 translation (64:ff9b::/96)." };
    }

    return { isRestricted: false, normalizedIp: lower };
  }

  // Not a valid standard IP string
  return { isRestricted: false };
}

/**
 * Validates a target URL against OWASP SSRF Prevention rules.
 * Enforces protocol, port, credentials, hostnames, and IP boundaries.
 */
export function validateTargetUrl(rawUrl: string, options: UrlValidationOptions = {}): UrlValidationResult {
  if (typeof rawUrl !== "string") {
    return { valid: false, code: "INVALID_TYPE", reason: "URL phải là chuỗi văn bản." };
  }

  const value = rawUrl.trim();

  if (!value) {
    return { valid: false, code: "EMPTY_URL", reason: "URL không được để trống." };
  }

  if (value.length > 2048) {
    return { valid: false, code: "URL_TOO_LONG", reason: "URL vượt quá độ dài tối đa cho phép (2048 ký tự)." };
  }

  // Block forbidden characters: whitespace, backslashes, control characters
  if (/[\s\\\u0000-\u001f\u007f]/u.test(value)) {
    return { valid: false, code: "INVALID_CHARACTERS", reason: "URL chứa ký tự không hợp lệ hoặc khoảng trắng." };
  }

  // Block credentials in URL (presence of @ before path/query)
  if (/@/i.test(value)) {
    return { valid: false, code: "CREDENTIALS_FORBIDDEN", reason: "Không cho phép URL chứa thông tin xác thực (username/password)." };
  }

  // Parse URL
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    // If lacks protocol, try prepend https://
    try {
      if (!/^[a-z][a-z\d+.-]*:/i.test(value)) {
        parsed = new URL(`https://${value}`);
      } else {
        return { valid: false, code: "MALFORMED_URL", reason: "Định dạng URL không hợp lệ." };
      }
    } catch {
      return { valid: false, code: "MALFORMED_URL", reason: "Định dạng URL không hợp lệ." };
    }
  }

  // Strictly enforce HTTP / HTTPS
  if (!["http:", "https:"].includes(parsed.protocol)) {
    return {
      valid: false,
      code: "DISALLOWED_PROTOCOL",
      reason: `Giao thức '${parsed.protocol}' không được hỗ trợ. Chỉ hỗ trợ HTTP và HTTPS.`,
    };
  }

  // Re-check username / password
  if (parsed.username || parsed.password) {
    return { valid: false, code: "CREDENTIALS_FORBIDDEN", reason: "Không cho phép URL chứa thông tin xác thực (username/password)." };
  }

  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, "");
  if (!hostname) {
    return { valid: false, code: "EMPTY_HOSTNAME", reason: "Tên miền (hostname) không được để trống." };
  }

  if (options.allowedHost) {
    const allowedHost = options.allowedHost.toLowerCase().replace(/\.$/, "");
    if (hostname !== allowedHost) {
      return {
        valid: false,
        code: "CRAWL_HOST_DISALLOWED",
        reason: `Hostname '${hostname}' nằm ngoài phạm vi website được phép quét.`,
      };
    }
  }

  // Block localhost and loopback hostnames
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    return { valid: false, code: "LOCALHOST_BLOCKED", reason: "Truy cập đến localhost bị chặn vì lý do bảo mật SSRF." };
  }

  // Block internal and reserved TLDs / hostnames
  const restrictedSuffixes = [
    ".local",
    ".internal",
    ".lan",
    ".corp",
    ".home",
    ".test",
    ".invalid",
    ".example",
  ];
  if (restrictedSuffixes.some((suffix) => hostname.endsWith(suffix))) {
    return {
      valid: false,
      code: "INTERNAL_HOSTNAME_BLOCKED",
      reason: `Tên miền nội bộ '${hostname}' bị chặn vì lý do an toàn bảo mật.`,
    };
  }

  // Block cloud metadata hostnames
  const metadataHosts = [
    "metadata.google.internal",
    "metadata.goog",
    "instance-data",
    "169.254.169.254",
  ];
  if (metadataHosts.includes(hostname)) {
    return {
      valid: false,
      code: "CLOUD_METADATA_BLOCKED",
      reason: "Truy cập đến dịch vụ Cloud Metadata bị chặn tuyệt đối.",
    };
  }

  // Port enforcement: only standard ports 80 (HTTP) and 443 (HTTPS)
  if (parsed.port) {
    const portNum = Number(parsed.port);
    if (parsed.protocol === "http:" && portNum !== 80) {
      return {
        valid: false,
        code: "UNAUTHORIZED_PORT",
        reason: `Cổng ${parsed.port} không được phép cho HTTP. Chỉ chấp nhận cổng chuẩn 80.`,
      };
    }
    if (parsed.protocol === "https:" && portNum !== 443) {
      return {
        valid: false,
        code: "UNAUTHORIZED_PORT",
        reason: `Cổng ${parsed.port} không được phép cho HTTPS. Chỉ chấp nhận cổng chuẩn 443.`,
      };
    }
  }

  // Check if hostname is an IP address or contains IP notation
  const ipCheck = isPrivateOrRestrictedIp(hostname);
  if (ipCheck.isRestricted) {
    return {
      valid: false,
      code: "RESTRICTED_IP_BLOCKED",
      reason: `Địa chỉ IP '${hostname}' bị chặn bởi quy tắc bảo mật SSRF (${ipCheck.reason}).`,
    };
  }

  // Dotless domain check (single label hostnames without TLD, e.g. "http://intranet/")
  if (!hostname.includes(".") && !hostname.startsWith("[")) {
    return {
      valid: false,
      code: "DOTLESS_HOSTNAME",
      reason: `Tên miền '${hostname}' không có phần mở rộng hợp lệ (TLD).`,
    };
  }

  return {
    valid: true,
    parsedUrl: parsed,
    normalizedUrl: parsed.href,
  };
}

/**
 * Creates a custom DNS lookup function that enforces SSRF safety at socket connection time.
 * This guarantees socket connection pinning: prevents TOCTOU / DNS rebinding attacks.
 */
export function createSsrfSafeLookup() {
  return function ssrfLookup(
    hostname: string,
    options: dns.LookupOptions,
    callback: (err: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family?: number) => void
  ): void {
    // Check hostname string first
    const preCheck = isPrivateOrRestrictedIp(hostname);
    if (preCheck.isRestricted) {
      const err = new Error(`SSRF Blocked: Hostname '${hostname}' is a restricted IP (${preCheck.reason}).`) as NodeJS.ErrnoException;
      err.code = "ENOTFOUND";
      return callback(err, "");
    }

    // Resolve via DNS promises
    dns.promises
      .lookup(hostname, { all: true, verbatim: true })
      .then((addresses) => {
        if (!addresses || addresses.length === 0) {
          const err = new Error(`DNS resolution returned no addresses for '${hostname}'.`) as NodeJS.ErrnoException;
          err.code = "ENOTFOUND";
          return callback(err, "");
        }

        // Validate EVERY resolved IP address! If ANY address is restricted, reject immediately!
        for (const addr of addresses) {
          const check = isPrivateOrRestrictedIp(addr.address);
          if (check.isRestricted) {
            const err = new Error(
              `SSRF Blocked: Tên miền '${hostname}' phân giải ra địa chỉ IP nội bộ bị cấm (${addr.address}: ${check.reason}).`
            ) as NodeJS.ErrnoException;
            err.code = "ECONNREFUSED";
            return callback(err, "");
          }
        }

        // Return the first validated public IP
        const selected = addresses[0];
        if (options && (options as { all?: boolean }).all) {
          return callback(null, addresses as dns.LookupAddress[]);
        }
        return callback(null, selected.address, selected.family);
      })
      .catch((err) => {
        callback(err as NodeJS.ErrnoException, "");
      });
  };
}

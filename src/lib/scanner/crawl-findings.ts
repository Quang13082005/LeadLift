import type { CrawlFinding, CrawlUrlResult, ScanFinding } from "@/types/scanner";

export function aggregateCrawlFindings(urlResults: CrawlUrlResult[]): CrawlFinding[] {
  const groups = new Map<string, { finding: ScanFinding; affectedUrls: Array<{ url: string; evidence: string }> }>();
  for (const result of urlResults) {
    for (const finding of result.findings) {
      const key = [finding.ruleId, finding.status, finding.ruleId.endsWith("_DUPLICATE") ? finding.evidence : ""].join("|");
      const group = groups.get(key) || { finding, affectedUrls: [] };
      const existingUrl = group.affectedUrls.find((affected) => affected.url === result.url);
      if (existingUrl) {
        if (!existingUrl.evidence.includes(finding.evidence)) existingUrl.evidence += `\n${finding.evidence}`;
      } else {
        group.affectedUrls.push({ url: result.url, evidence: finding.evidence });
      }
      groups.set(key, group);
    }
  }

  return [...groups.entries()].map(([key, group]) => ({
    id: "finding_" + encodeURIComponent(key),
    ruleId: group.finding.ruleId,
    ruleName: group.finding.ruleName,
    category: group.finding.category,
    description: group.finding.description,
    severity: group.finding.severity,
    status: group.finding.status,
    evidence: group.affectedUrls.length > 1
      ? group.affectedUrls.length + " URL bị ảnh hưởng. Bằng chứng chi tiết được liệt kê theo từng URL."
      : group.finding.evidence,
    affectedUrls: group.affectedUrls,
    timestamp: group.finding.timestamp,
    recommendation: group.finding.recommendation || "Đối chiếu bằng chứng trước khi thay đổi.",
  }));
}

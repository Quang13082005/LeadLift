import { Suspense } from "react";
import { notFound } from "next/navigation";
import { BusinessListPage } from "@/components/business/business-list";
import { LoadingState } from "@/components/ui/primitives";
import { previewBusinesses, previewPipelineOpportunity } from "@/lib/design-v2-fixtures";

async function PreviewBusinessScreen({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  return <BusinessListPage demo initialData={{ items: previewBusinesses, total: previewBusinesses.length, page: 1, limit: 10, totalPages: 1, stats: { totalCount: previewBusinesses.length, prioritizeAuditCount: 1, outreachSentCount: 0, inDiscussionCount: 0 } }} initialSelectedBusinessId={previewBusinesses[0]?.id} initialTab={tab === "pipeline" ? "pipeline" : "discovery"} pipelineOpportunity={previewPipelineOpportunity} />;
}

export default function DesignV2BusinessesPreview({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  return <Suspense fallback={<div className="panel panPad"><LoadingState label="Đang tải fixture preview…" /></div>}><PreviewBusinessScreen searchParams={searchParams} /></Suspense>;
}

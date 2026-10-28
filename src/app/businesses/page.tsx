import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { getBusinessById, getBusinesses } from "@/lib/services/business-service";
import { BusinessListPage } from "@/components/business/business-list";
import { EmptyState, Panel, LoadingState } from "@/components/ui/primitives";
import { publicBusinessError } from "@/lib/business-error";
import type { BusinessQueryResult } from "@/types/business";

export const metadata: Metadata = {
  title: "Khách hàng & Cơ hội",
  description: "Quản lý hồ sơ khách hàng tiềm năng, tìm kiếm, lọc theo ngành nghề và chuẩn bị dữ liệu Website Audit.",
};

async function BusinessesDataLoader({ searchParams }: { searchParams: Promise<{ businessId?: string; tab?: string }> }) {
  await connection();
  const { businessId, tab } = await searchParams;
  let initialData: BusinessQueryResult;
  try {
    const [result, selected] = await Promise.all([
      getBusinesses({ page: 1, limit: 10 }),
      businessId ? getBusinessById(businessId) : Promise.resolve(null),
    ]);
    initialData = selected && !result.items.some((item) => item.id === selected.id)
      ? { ...result, items: [selected, ...result.items].slice(0, result.limit) }
      : result;
  } catch (error) {
    initialData = {
      error: publicBusinessError(error).message,
      items: [],
      total: 0,
      page: 1,
      limit: 10,
      totalPages: 1,
      stats: { totalCount: 0, prioritizeAuditCount: 0, outreachSentCount: 0, inDiscussionCount: 0 },
    };
  }
  return <BusinessListPage initialData={initialData} initialSelectedBusinessId={businessId} initialTab={tab === "pipeline" ? "pipeline" : "discovery"} />;
}

export default function BusinessesPage({ searchParams }: { searchParams: Promise<{ businessId?: string; tab?: string }> }) {
  if (process.env.NODE_ENV !== "development") {
    return (
      <>
        <h1>Khách hàng & Cơ hội</h1>
        <Panel title="Chỉ khả dụng trong development local">
          <EmptyState
            title="Chức năng doanh nghiệp đang được bảo vệ"
            description="Cần tích hợp Authentication trước khi sử dụng trong production."
          />
        </Panel>
      </>
    );
  }

  return (
    <Suspense
      fallback={
        <div className="panel" style={{ padding: 48, minHeight: 400 }}>
          <LoadingState label="Đang tải dữ liệu doanh nghiệp..." />
        </div>
      }
    >
      <BusinessesDataLoader searchParams={searchParams} />
    </Suspense>
  );
}

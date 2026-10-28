import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { getBusinesses } from "@/lib/services/business-service";
import { BusinessListPage } from "@/components/business/business-list";
import { EmptyState, Panel, LoadingState } from "@/components/ui/primitives";
import { publicBusinessError } from "@/lib/business-error";
import type { BusinessQueryResult } from "@/types/business";

export const metadata: Metadata = {
  title: "Khách hàng & Cơ hội",
  description: "Quản lý hồ sơ khách hàng tiềm năng, tìm kiếm, lọc theo ngành nghề và chuẩn bị dữ liệu Website Audit.",
};

async function BusinessesDataLoader() {
  await connection();
  let initialData: BusinessQueryResult;
  try {
    initialData = await getBusinesses({ page: 1, limit: 10 });
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
  return <BusinessListPage initialData={initialData} />;
}

export default function BusinessesPage() {
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
      <BusinessesDataLoader />
    </Suspense>
  );
}

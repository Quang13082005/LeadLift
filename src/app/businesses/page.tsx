import type { Metadata } from "next";
import { connection } from "next/server";
import { getBusinesses } from "@/lib/services/business-service";
import { BusinessListPage } from "@/components/business/business-list";

export const metadata: Metadata = {
  title: "Khách hàng & Cơ hội — LeadLift",
  description: "Quản lý hồ sơ khách hàng tiềm năng, tìm kiếm, lọc theo ngành nghề và chuẩn bị dữ liệu Website Audit.",
};

export default async function BusinessesPage() {
  await connection();
  const initialData = await getBusinesses({ page: 1, limit: 10 });
  return <BusinessListPage initialData={initialData} />;
}

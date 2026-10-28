import { connection } from "next/server";
import { DashboardView } from "@/components/dashboard-view";
import { getDashboardData, type DashboardData } from "@/lib/services/dashboard-service";

export default async function Home() {
  await connection();
  let data: DashboardData = { total: null, audited: null, prepared: null, replies: null, items: [] };
  if (process.env.NODE_ENV === "development") {
    try { data = await getDashboardData(); }
    catch { data.error = "Không thể tải dữ liệu tổng quan. Vui lòng tải lại trang."; }
  } else data.error = "Dữ liệu nghiệp vụ chỉ khả dụng trong development local cho đến khi Authentication hoàn thiện.";
  return <DashboardView data={data} />;
}

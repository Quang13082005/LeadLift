import { notFound } from "next/navigation";
import { DashboardView } from "@/components/dashboard-view";
import { previewBusinesses } from "@/lib/design-v2-fixtures";

export default function DesignV2HomePreview() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <DashboardView demo data={{ total: 14, audited: 5, prepared: null, replies: null, items: previewBusinesses, error: undefined }} />;
}

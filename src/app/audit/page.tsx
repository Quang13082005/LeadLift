import type { Metadata } from "next";
import { getBusinesses } from "@/lib/services/business-service";
import { AuditClientView } from "@/components/scanner/AuditClientView";
import type { BusinessItem } from "@/types/business";

export const metadata: Metadata = { title: "Website Audit" };

export default async function AuditPage() {
  let initialBusinesses: BusinessItem[] = [];
  try {
    const res = await getBusinesses({ limit: 50 });
    initialBusinesses = res.items;
  } catch {
    // If running in production or database is unreachable, fallback to empty list
    initialBusinesses = [];
  }

  return <AuditClientView initialBusinesses={initialBusinesses} />;
}

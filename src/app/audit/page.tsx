import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { EmptyState } from "@/components/ui/primitives";
import { getBusinesses, getBusinessById } from "@/lib/services/business-service";
import { AuditClientView } from "@/components/scanner/AuditClientView";
import type { BusinessItem } from "@/types/business";

export const metadata: Metadata = { title: "Website Audit" };

async function AuditDataLoader({ searchParams }: { searchParams: Promise<{ businessId?: string }> }) {
  await connection();
  const query = await searchParams;
  let initialBusinesses: BusinessItem[] = [];
  try {
    const [res, selected] = await Promise.all([
      getBusinesses({ limit: 50 }),
      query.businessId ? getBusinessById(query.businessId) : Promise.resolve(null),
    ]);
    initialBusinesses = selected && !res.items.some((item) => item.id === selected.id)
      ? [selected, ...res.items]
      : res.items;
  } catch {
    // If running in production or database is unreachable, fallback to empty list
    initialBusinesses = [];
  }

  return <AuditClientView initialBusinesses={initialBusinesses} initialBusinessId={query.businessId} />;
}

export default function AuditPage({ searchParams }: { searchParams: Promise<{ businessId?: string }> }) {
  return <Suspense fallback={<section className="panel panPad"><EmptyState title="Đang tải Website Audit" description="Đang nạp hồ sơ và phạm vi kiểm tra." /></section>}><AuditDataLoader searchParams={searchParams} /></Suspense>;
}

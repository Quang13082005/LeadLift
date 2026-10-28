import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { getBusinessById } from "@/lib/services/business-service";
import { EmptyState } from "@/components/ui/primitives";
import { OutreachView } from "@/components/outreach-view";

export const metadata: Metadata = { title: "Tiếp cận & Đề xuất" };

async function OutreachDataLoader({ searchParams }: { searchParams: Promise<{ businessId?: string }> }) {
  await connection();
  const { businessId } = await searchParams;
  let businessName: string | undefined;
  if (businessId) {
    try { businessName = (await getBusinessById(businessId))?.name; }
    catch { businessName = undefined; }
  }
  return <OutreachView businessName={businessName} />;
}

export default function OutreachPage({ searchParams }: { searchParams: Promise<{ businessId?: string }> }) {
  return <Suspense fallback={<section className="panel panPad"><EmptyState title="Đang tải hồ sơ" description="Đang chuẩn bị màn hình đề xuất." /></section>}><OutreachDataLoader searchParams={searchParams} /></Suspense>;
}

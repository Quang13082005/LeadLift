import { prisma } from "@/lib/prisma";
import { enforceDevOnly, getBusinesses } from "./business-service";
import type { BusinessItem } from "@/types/business";

export interface DashboardData {
  total: number | null;
  audited: number | null;
  prepared: number | null;
  replies: number | null;
  items: BusinessItem[];
  error?: string;
}

/** Business data only. Unimplemented proposal/conversation metrics stay unknown. */
export async function getDashboardData(): Promise<DashboardData> {
  enforceDevOnly();
  const [businesses, audited] = await Promise.all([
    getBusinesses({ limit: 4 }),
    prisma.business.count({ where: { leadStatus: { in: ["AUDITED", "QUALIFIED", "CONTACT_READY", "OUTREACH_SENT", "IN_DISCUSSION", "CONVERTED"] } } }),
  ]);
  return { total: businesses.stats.totalCount, audited, prepared: null, replies: null, items: businesses.items };
}

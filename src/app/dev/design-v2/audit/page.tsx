import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { DesignV2FixtureAuditView } from "@/components/scanner/DesignV2FixtureAuditView";

export const metadata: Metadata = {
  title: "Website Audit (Design V2 Visual Fixture Preview)",
};

export default function DesignV2AuditPreviewPage() {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }

  return <DesignV2FixtureAuditView />;
}

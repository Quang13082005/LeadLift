import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { AppShell } from "@/components/app-shell";

export const metadata: Metadata = {
  title: { default: "LeadLift — Tổng quan", template: "%s | LeadLift" },
  description: "LeadLift — Không gian quản lý khách hàng, website audit và đề xuất. Giao diện nền tảng Phase 01.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi">
      <body><AppShell>{children}</AppShell></body>
    </html>
  );
}

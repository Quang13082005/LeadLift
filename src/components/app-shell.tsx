"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, useEffect, useState, type ReactNode } from "react";
import { navigation } from "./navigation";
import { Badge, Button } from "./ui/primitives";
import { Dialog } from "./ui/dialog";
import { ToastProvider } from "./ui/toast";

function Logo() {
  return <span className="logo"><span className="logo-mark" aria-hidden="true"><i /><i /><i /></span>LEADLIFT</span>;
}

function Navigation({ pathname, onNavigate, preview = false }: { pathname: string; onNavigate?: () => void; preview?: boolean }) {
  return <nav aria-label="Điều hướng chính">{navigation.map((item) => <Fragment key={item.href}>
    {item.href === "/settings" && <div className="nav-label">Hệ thống</div>}
    <Link className="nav-link" href={preview ? `/dev/design-v2/${item.href === "/" ? "home" : item.href.slice(1)}` : item.href} aria-current={pathname === item.href ? "page" : undefined} onClick={onNavigate}><span className="nav-icon" aria-hidden="true">{item.icon}</span>{item.title}</Link>
  </Fragment>)}</nav>;
}

function MobileNavigation({ pathname, preview = false }: { pathname: string; preview?: boolean }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 651px)");
    const closeOnDesktop = () => { if (media.matches) setOpen(false); };
    media.addEventListener("change", closeOnDesktop);
    return () => media.removeEventListener("change", closeOnDesktop);
  }, []);
  return <>
    <Button className="mobile-menu" aria-label="Mở menu điều hướng" aria-expanded={open} aria-controls="mobile-navigation" onClick={() => setOpen(true)}><span aria-hidden="true">☰</span></Button>
    <Dialog id="mobile-navigation" className="mobile-drawer" open={open} onClose={() => setOpen(false)} title={<Logo />}>
      <Navigation pathname={pathname} preview={preview} onNavigate={() => setOpen(false)} />
      <p className="hint">LEADLIFT · Hệ thống tìm kiếm doanh nghiệp & phân tích website</p>
    </Dialog>
  </>;
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const preview = pathname.startsWith("/dev/design-v2");
  const displayPath = preview ? (pathname.replace("/dev/design-v2", "") || "/").replace("/home", "/").replace("/pipeline", "/businesses").replace("/handoff", "/businesses") : pathname;
  const current = navigation.find((item) => item.href === displayPath)?.title ?? (pathname === "/dev/ui" ? "Kiểm thử giao diện" : "Không tìm thấy trang");
  return <ToastProvider>
    <a className="skip-link button button-primary" href="#main-content">Đến nội dung chính</a>
    <div className="shell">
      <aside className="sidebar" aria-label="Thanh bên"><Link href={preview ? "/dev/design-v2/home" : "/"} aria-label="LeadLift — Tổng quan"><Logo /></Link><Navigation pathname={displayPath} preview={preview} /><div className="side-bottom"><b>{preview ? "LEADLIFT / BẢN DEMO" : "LEADLIFT / DEVELOPMENT"}</b>{preview ? "Dữ liệu mẫu, chỉ mô phỏng trong trình duyệt. Không ghi cơ sở dữ liệu hay gửi tin nhắn thật." : "Quản lý doanh nghiệp và kiểm tra website. Tự động khám phá, gửi tin và đồng bộ hội thoại chưa triển khai."}</div></aside>
      <div className="workspace">
        <header className="topbar">
          <MobileNavigation key={pathname} pathname={displayPath} preview={preview} />
          <nav className="breadcrumb" aria-label="Đường dẫn"><ol><li><Link href={preview ? "/dev/design-v2/home" : "/"}>{preview ? "Bản xem trước" : "Không gian làm việc"}</Link></li><li aria-hidden="true">/</li><li aria-current="page"><strong>{current}</strong></li></ol></nav>
          <div className="topbar-right"><Badge tone="green">{preview ? "DEMO · DESIGN V2" : "LEADLIFT · V2"}</Badge><span className="brand-avatar" aria-hidden="true">L</span></div>
        </header>
        <main id="main-content" tabIndex={-1}>{children}</main>
        <footer className="page-footer">LEADLIFT • {preview ? "Dữ liệu giả lập · Không liên hệ doanh nghiệp thật" : "Phân tích có bằng chứng · Chưa kết nối kênh gửi tin"}</footer>
      </div>
    </div>
  </ToastProvider>;
}

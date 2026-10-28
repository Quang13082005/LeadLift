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

function Navigation({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return <nav aria-label="Điều hướng chính">{navigation.map((item) => <Fragment key={item.href}>
    {item.href === "/settings" && <div className="nav-label">Hệ thống</div>}
    <Link className="nav-link" href={item.href} aria-current={pathname === item.href ? "page" : undefined} onClick={onNavigate}><span className="nav-icon" aria-hidden="true">{item.icon}</span>{item.title}</Link>
  </Fragment>)}</nav>;
}

function MobileNavigation({ pathname }: { pathname: string }) {
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
      <Navigation pathname={pathname} onNavigate={() => setOpen(false)} />
      <p className="hint">Giao diện nền tảng · Phase 01</p>
    </Dialog>
  </>;
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const current = navigation.find((item) => item.href === pathname)?.title ?? (pathname === "/dev/ui" ? "Kiểm thử giao diện" : "Không tìm thấy trang");
  return <ToastProvider>
    <a className="skip-link button button-primary" href="#main-content">Đến nội dung chính</a>
    <div className="shell">
      <aside className="sidebar" aria-label="Thanh bên"><Link href="/" aria-label="LeadLift — Tổng quan"><Logo /></Link><Navigation pathname={pathname} /><div className="side-bottom"><b>LEADLIFT / PHASE 01</b>Giao diện nền tảng. Các chức năng nghiệp vụ sẽ được phát triển ở giai đoạn tiếp theo.</div></aside>
      <div className="workspace">
        <header className="topbar">
          <MobileNavigation key={pathname} pathname={pathname} />
          <nav className="breadcrumb" aria-label="Đường dẫn"><ol><li><Link href="/">Không gian làm việc</Link></li><li aria-hidden="true">/</li><li aria-current="page"><strong>{current}</strong></li></ol></nav>
          <div className="topbar-right"><Badge tone="green">GIAO DIỆN NỀN TẢNG · PHASE 01</Badge><span className="brand-avatar" aria-hidden="true">L</span></div>
        </header>
        <main id="main-content" tabIndex={-1}>{children}</main>
        <footer className="page-footer">LEADLIFT · Giao diện nền tảng · Chưa kết nối dữ liệu nghiệp vụ</footer>
      </div>
    </div>
  </ToastProvider>;
}

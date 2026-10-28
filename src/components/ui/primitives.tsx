import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "quiet" | "danger";

export function buttonClass(variant: ButtonVariant = "secondary", small = false) {
  return `button button-${variant}${small ? " button-small" : ""}`;
}

export function Button({ variant = "secondary", small = false, className = "", type = "button", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; small?: boolean }) {
  return <button type={type} className={`${buttonClass(variant, small)} ${className}`} {...props} />;
}

export function Badge({ tone = "neutral", className = "", ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: "neutral" | "green" | "amber" | "red" | "blue" }) {
  return <span className={`badge badge-${tone} ${className}`} {...props} />;
}

export function Card({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`panel ${className}`} {...props} />;
}

export function Panel({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return <section className="panel"><header className="panel-heading"><h2>{title}</h2>{description && <p className="hint">{description}</p>}</header>{children}</section>;
}

/** null means unavailable, never a fabricated zero. */
export function StatCard({ label, value = null, note = "Chưa kết nối dữ liệu" }: { label: string; value?: string | number | null; note?: string }) {
  return <div className="stat"><p className="stat-label">{label}</p><p className="stat-value">{value === null ? <><span aria-hidden="true">—</span><span className="sr-only">Chưa có dữ liệu</span></> : value}</p><p className="stat-note">{note}</p></div>;
}

export function EmptyState({ title, description, icon = "▤", children }: { title: string; description: string; icon?: string; children?: ReactNode }) {
  return <div className="empty-state"><span className="empty-icon" aria-hidden="true">{icon}</span><h3>{title}</h3><p>{description}</p>{children && <div className="actions">{children}</div>}</div>;
}

export function LoadingState({ label = "Đang tải giao diện…" }: { label?: string }) {
  return <div className="loading-state" role="status"><span className="spinner" aria-hidden="true" />{label}</div>;
}

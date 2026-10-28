"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

type Toast = { id: number; message: string };
const ToastContext = createContext<((message: string) => void) | null>(null);

function ToastItem({ toast, dismiss }: { toast: Toast; dismiss: (id: number) => void }) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (hovered || focused) return;
    const timeout = window.setTimeout(() => dismiss(toast.id), 6000);
    return () => window.clearTimeout(timeout);
  }, [toast.id, dismiss, hovered, focused]);

  return <div className="toast" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onFocus={() => setFocused(true)} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}>
    <span>{toast.message}</span><button type="button" aria-label="Đóng thông báo" onClick={() => dismiss(toast.id)}>×</button>
  </div>;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);
  const notify = useCallback((message: string) => {
    const toast = { id: ++nextId.current, message };
    setToasts((items) => [...items, toast]);
  }, []);
  const dismiss = useCallback((id: number) => setToasts((items) => items.filter((item) => item.id !== id)), []);
  return <ToastContext.Provider value={notify}>{children}<div className="toast-region" role="region" aria-label="Thông báo" aria-live="polite" aria-relevant="additions">{toasts.map((toast) => <ToastItem key={toast.id} toast={toast} dismiss={dismiss} />)}</div></ToastContext.Provider>;
}

export function useToast() {
  const notify = useContext(ToastContext);
  if (!notify) throw new Error("useToast requires ToastProvider");
  return notify;
}

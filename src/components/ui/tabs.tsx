"use client";
import { useId } from "react";

/** Automatic activation with roving focus, Arrow keys, Home and End. */
export function Tabs<T extends string>({ label, value, onChange, items }: { label: string; value: T; onChange: (value: T) => void; items: { value: T; label: string }[] }) {
  const id = useId();
  return <div className="tabs" role="tablist" aria-label={label}>{items.map((item, index) => <button key={item.value} id={`${id}-${item.value}`} type="button" role="tab" aria-selected={value === item.value} tabIndex={value === item.value ? 0 : -1} className={`tab ${value === item.value ? "on" : ""}`} onClick={() => onChange(item.value)} onKeyDown={event => {
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % items.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + items.length) % items.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    else return;
    event.preventDefault();
    onChange(items[next].value);
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  }}>{item.label}</button>)}</div>;
}

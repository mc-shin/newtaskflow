"use client";

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}

export default function Modal({ open, onClose, title, children, size = "md" }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (open) {
      document.addEventListener("keydown", handleEsc);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleEsc);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  const modal = (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ marginLeft: 0 }}
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className={cn(
          "relative bg-card border border-border rounded-2xl shadow-2xl w-full animate-fade-in max-h-[85vh] flex flex-col",
          size === "sm" && "max-w-md",
          size === "md" && "max-w-lg",
          size === "lg" && "max-w-2xl",
          size === "xl" && "max-w-[1100px]"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border flex-shrink-0">
          <h2 className="text-[18px] font-semibold text-white">{title}</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-sidebar-hover transition-colors"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>
        {/* Body */}
        <div className="p-6 overflow-y-auto">{children}</div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(modal, document.body);
}

/* Reusable form field components */
export function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[13px] font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

export function FormInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "w-full px-4 py-2.5 bg-background border border-border rounded-xl text-[14px] text-foreground placeholder:text-muted outline-none focus:border-accent transition-colors",
        props.className
      )}
    />
  );
}

export function FormTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        "w-full px-4 py-2.5 bg-background border border-border rounded-xl text-[14px] text-foreground placeholder:text-muted outline-none focus:border-accent transition-colors resize-none",
        props.className
      )}
    />
  );
}

export function FormSelect({ children, value, onChange, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Extract options from children
  const options: { value: string; label: string }[] = [];
  React.Children.forEach(children, (child) => {
    if (React.isValidElement<{ value?: string; children?: React.ReactNode }>(child) && child.type === "option") {
      options.push({
        value: String(child.props.value ?? ""),
        label: String(child.props.children ?? ""),
      });
    }
  });

  const selectedLabel = options.find((o) => o.value === String(value ?? ""))?.label || "";

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current && !ref.current.contains(target) && (!dropdownRef.current || !dropdownRef.current.contains(target))) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const [dropdownStyle, setDropdownStyle] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const handleOpen = () => {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setDropdownStyle({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    }
    setOpen(!open);
  };

  return (
    <div ref={ref} className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={handleOpen}
        className={cn(
          "w-full px-4 py-2.5 bg-background border rounded-xl text-[14px] text-foreground outline-none transition-all text-left flex items-center justify-between",
          open ? "border-accent" : "border-border hover:border-accent/50 hover:bg-accent/5",
        )}
      >
        <span className={selectedLabel ? "" : "text-muted"}>{selectedLabel || "선택"}</span>
        <svg className={cn("w-4 h-4 text-muted transition-transform", open && "rotate-180")} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && typeof document !== "undefined" && createPortal(
        <div
          ref={dropdownRef}
          className="fixed z-[200] bg-card border border-border rounded-xl shadow-xl overflow-hidden"
          style={{ top: dropdownStyle.top, left: dropdownStyle.left, width: dropdownStyle.width }}
        >
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onChange?.({ target: { value: opt.value } } as React.ChangeEvent<HTMLSelectElement>);
                setOpen(false);
              }}
              className={cn(
                "w-full px-4 py-2.5 text-left text-[14px] transition-all",
                opt.value === String(value ?? "")
                  ? "bg-accent text-white hover:bg-accent-hover"
                  : "text-foreground hover:bg-accent/10 hover:text-accent"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>,
        document.body
      )}
      {/* Hidden native select for form compatibility */}
      <select {...props} value={value} onChange={onChange} className="sr-only" tabIndex={-1}>
        {children}
      </select>
    </div>
  );
}

export function FormButton({ variant = "primary", children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "danger" | "secondary" }) {
  return (
    <button
      {...props}
      className={cn(
        "px-5 py-2.5 rounded-xl text-[14px] font-medium transition-all flex items-center justify-center gap-2",
        variant === "primary" && "bg-accent hover:bg-accent-hover text-white",
        variant === "danger" && "bg-danger/15 hover:bg-danger/25 text-danger",
        variant === "secondary" && "bg-sidebar-hover hover:bg-border text-muted-foreground",
        props.className
      )}
    >
      {children}
    </button>
  );
}

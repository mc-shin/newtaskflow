"use client";

import { useState, useEffect, useCallback } from "react";
import { AlertCircle, CheckCircle2, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ToastMessage {
  id: string;
  type: "success" | "error" | "warning";
  message: string;
}

let addToastFn: ((msg: Omit<ToastMessage, "id">) => void) | null = null;

export function toast(type: ToastMessage["type"], message: string) {
  addToastFn?.({ type, message });
}

export default function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = useCallback((msg: Omit<ToastMessage, "id">) => {
    const id = `t${Date.now()}`;
    setToasts((prev) => [...prev, { ...msg, id }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  useEffect(() => {
    addToastFn = addToast;
    return () => { addToastFn = null; };
  }, [addToast]);

  const dismiss = (id: string) => setToasts((prev) => prev.filter((t) => t.id !== id));

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[200] flex flex-col gap-3 max-w-sm">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            "flex items-start gap-3 px-4 py-3 rounded-xl shadow-lg border animate-fade-in",
            t.type === "success" && "bg-card border-success/30",
            t.type === "error" && "bg-card border-danger/30",
            t.type === "warning" && "bg-card border-warning/30"
          )}
        >
          {t.type === "success" && <CheckCircle2 className="w-5 h-5 text-success flex-shrink-0 mt-0.5" />}
          {t.type === "error" && <AlertCircle className="w-5 h-5 text-danger flex-shrink-0 mt-0.5" />}
          {t.type === "warning" && <AlertCircle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />}
          <p className="text-[13px] text-foreground flex-1">{t.message}</p>
          <button onClick={() => dismiss(t.id)} className="text-muted hover:text-foreground transition-colors flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

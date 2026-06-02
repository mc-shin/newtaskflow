"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/lib/store";
import Sidebar from "./Sidebar";
import ToastContainer from "./Toast";
import { Bell, Check } from "lucide-react";
import { cn, getRelativeTime } from "@/lib/utils";

interface AppLayoutProps {
  children: React.ReactNode;
  title?: string;
  description?: string;
  actions?: React.ReactNode;
}

export default function AppLayout({ children, title, description, actions }: AppLayoutProps) {
  const { _hydrated, isAuthenticated, currentWorkspaceId, currentUser, notifications, users, markNotificationRead, markAllNotificationsRead } = useAppStore();
  const router = useRouter();
  const [bellOpen, setBellOpen] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (_hydrated && !isAuthenticated) router.push("/login");
    else if (_hydrated && isAuthenticated && !currentWorkspaceId) router.push("/workspace");
  }, [_hydrated, isAuthenticated, currentWorkspaceId, router]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) setBellOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Filter notifications for current user + workspace
  const myNotifs = notifications.filter(
    (n) => n.targetUserId === currentUser?.id && n.workspaceId === currentWorkspaceId
  );
  const unreadCount = myNotifs.filter((n) => !n.read).length;

  const handleNotifClick = (notif: typeof myNotifs[0]) => {
    markNotificationRead(notif.id);
    setBellOpen(false);
    if (notif.link) router.push(notif.link);
  };

  const getNotifIcon = (type: string) => {
    switch (type) {
      case "report_distributed": return "📋";
      case "task_assigned": return "📌";
      case "meeting_invited": return "📅";
      case "task_status": return "✅";
      case "report_submitted": return "📝";
      case "meeting_completed": return "🤝";
      case "role_changed": return "👤";
      default: return "🔔";
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <div className="ml-[220px] min-h-screen flex flex-col">
        {title && (
          <header className="sticky top-0 z-30 h-[64px] border-b border-border bg-background/95 backdrop-blur-md flex items-center justify-between px-8 flex-shrink-0">
            <div>
              <h1 className="text-[22px] font-bold text-white leading-tight">{title}</h1>
              {description && <p className="text-[13px] text-muted-foreground mt-0.5">{description}</p>}
            </div>
            <div className="flex items-center gap-3">
              {/* Notification bell */}
              <div ref={bellRef} className="relative">
                <button
                  onClick={() => setBellOpen(!bellOpen)}
                  className="relative p-2.5 rounded-xl hover:bg-accent/10 transition-colors"
                >
                  <Bell className="w-[20px] h-[20px] text-muted-foreground" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center px-1 bg-danger rounded-full text-[10px] text-white font-bold">
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  )}
                </button>

                {bellOpen && (
                  <div className="absolute right-0 top-12 w-[380px] bg-card border border-border rounded-2xl shadow-2xl z-50 overflow-hidden">
                    {/* Header */}
                    <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
                      <h3 className="text-[15px] font-semibold text-white">알림</h3>
                      {unreadCount > 0 && (
                        <button
                          onClick={() => markAllNotificationsRead()}
                          className="flex items-center gap-1 text-[12px] text-accent hover:text-accent-hover transition-colors"
                        >
                          <Check className="w-3.5 h-3.5" />
                          모두 읽음
                        </button>
                      )}
                    </div>

                    {/* List */}
                    <div className="max-h-[400px] overflow-y-auto">
                      {myNotifs.length === 0 ? (
                        <p className="text-[14px] text-muted-foreground py-10 text-center">알림이 없습니다</p>
                      ) : (
                        myNotifs.slice(0, 30).map((notif) => {
                          const from = users.find((u) => u.id === notif.fromUserId);
                          return (
                            <div
                              key={notif.id}
                              onClick={() => handleNotifClick(notif)}
                              className={cn(
                                "flex items-start gap-3 px-5 py-3.5 hover:bg-card-hover/30 transition-colors cursor-pointer border-b border-border/50",
                                !notif.read && "bg-accent/5"
                              )}
                            >
                              <span className="text-[16px] mt-0.5 flex-shrink-0">{getNotifIcon(notif.type)}</span>
                              <div className="flex-1 min-w-0">
                                <p className={cn("text-[13px] leading-snug", notif.read ? "text-muted-foreground" : "text-foreground font-medium")}>
                                  {notif.title}
                                </p>
                                <p className="text-[12px] text-muted mt-0.5 truncate">{notif.message}</p>
                                <p className="text-[11px] text-muted mt-1">{from?.name} · {getRelativeTime(notif.createdAt)}</p>
                              </div>
                              {!notif.read && <div className="w-2 h-2 bg-accent rounded-full flex-shrink-0 mt-1.5" />}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Page actions */}
              {actions}
            </div>
          </header>
        )}
        <main className="flex-1 p-8">
          {_hydrated && isAuthenticated && currentWorkspaceId ? children : null}
        </main>
      </div>
      <ToastContainer />
    </div>
  );
}

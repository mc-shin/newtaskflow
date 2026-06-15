"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useAppStore } from "@/lib/store";
import Modal, { FormField, FormInput, FormButton } from "./Modal";
import { toast } from "./Toast";
import { avatarColor } from "@/lib/userColor";
import {
  FileBarChart,
  LogOut,
  Zap,
  Users,
  Archive,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ROLE_LABEL } from "@/lib/types";

const navItems = [
  { label: "팀원", href: "/team", icon: Users },
  { label: "주간보고", href: "/reports", icon: FileBarChart },
  { label: "주간보고 리스트", href: "/weekly-archive", icon: Archive },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { currentUser, logout, updateUserProfile, workspaces, currentWorkspaceId, leaveWorkspace } = useAppStore();
  const currentWorkspace = workspaces.find((ws) => ws.id === currentWorkspaceId);
  const [profileOpen, setProfileOpen] = useState(false);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");

  const openProfile = () => {
    if (!currentUser) return;
    setName(currentUser.name);
    setPassword("");
    setPasswordConfirm("");
    setProfileOpen(true);
  };

  const [saving, setSaving] = useState(false);
  const handleSave = async () => {
    if (!currentUser) return;
    if (!name.trim()) {
      toast("warning", "이름을 입력해주세요.");
      return;
    }
    if (password && password !== passwordConfirm) {
      toast("warning", "비밀번호가 일치하지 않습니다.");
      return;
    }
    setSaving(true);
    // 비밀번호를 입력했을 때만 함께 전송한다.
    const ok = await updateUserProfile(currentUser.id, { name: name.trim(), ...(password ? { password } : {}) });
    setSaving(false);
    if (!ok) {
      toast("error", "변경에 실패했습니다. 잠시 후 다시 시도해주세요.");
      return;
    }
    toast("success", password ? "프로필·비밀번호가 변경되었습니다." : "프로필이 수정되었습니다.");
    setPassword("");
    setPasswordConfirm("");
    setProfileOpen(false);
  };

  const [navigating, setNavigating] = useState(false);

  const handleGoToWorkspace = () => {
    setNavigating(true);
    leaveWorkspace();
    router.push("/workspace");
  };

  if (navigating) return null; // Hide sidebar immediately during transition

  return (
    <>
      <aside className="fixed left-0 top-0 h-screen w-[220px] bg-sidebar-bg border-r border-border z-40 flex flex-col">
        {/* Workspace name */}
        <button
          onClick={handleGoToWorkspace}
          className="h-[64px] flex items-center px-5 border-b border-border gap-3 flex-shrink-0 w-full hover:bg-accent/10 transition-colors group/ws"
          title="워크스페이스 전환"
        >
          <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center flex-shrink-0">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-[16px] text-white group-hover/ws:text-accent tracking-tight truncate transition-colors">
            {currentWorkspace?.name || "\u00A0"}
          </span>
        </button>

        {/* Nav */}
        <nav className="flex-1 py-5 px-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-xl text-[14px] font-medium transition-colors duration-200 group",
                  isActive
                    ? "bg-sidebar-active text-accent-hover border border-accent/20"
                    : "text-muted-foreground hover:text-foreground hover:bg-sidebar-hover border border-transparent"
                )}
              >
                <item.icon
                  className={cn(
                    "w-[20px] h-[20px] flex-shrink-0",
                    isActive ? "text-accent" : "text-muted group-hover:text-foreground"
                  )}
                />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* User */}
        <div className="border-t border-border p-3 flex-shrink-0">
          {currentUser && (
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl">
              <button
                onClick={openProfile}
                className="flex items-center gap-3 flex-1 min-w-0 rounded-xl px-2 py-1.5 -mx-2 -my-1.5 hover:bg-accent/10 transition-all group/profile"
              >
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0 group-hover/profile:ring-2 group-hover/profile:ring-accent/50 transition-all"
                  style={{ background: avatarColor(currentUser.id) }}
                >
                  {currentUser.name.slice(0, 1)}
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-[14px] font-semibold text-foreground group-hover/profile:text-accent truncate transition-colors">{currentUser.name}</p>
                  <p className="text-[12px] text-muted group-hover/profile:text-muted-foreground truncate transition-colors">
                    {ROLE_LABEL[currentUser.role] ?? "팀원"}
                  </p>
                </div>
              </button>
              <button
                onClick={() => { logout(); window.location.href = "/"; }}
                className="p-2 rounded-lg text-muted hover:text-danger hover:bg-sidebar-hover transition-colors"
                title="로그아웃"
              >
                <LogOut className="w-[16px] h-[16px]" />
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Profile Edit Modal */}
      <Modal open={profileOpen} onClose={() => setProfileOpen(false)} title="개인정보 수정" size="sm">
        <div className="space-y-5">
          <div className="flex justify-center">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center text-white text-2xl font-bold"
              style={{ background: currentUser ? avatarColor(currentUser.id) : undefined }}
            >
              {name.slice(0, 1) || currentUser?.name.slice(0, 1)}
            </div>
          </div>

          <FormField label="이메일">
            <FormInput value={currentUser?.email || ""} disabled className="opacity-60" />
          </FormField>

          <FormField label="이름">
            <FormInput
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="이름을 입력하세요"
            />
          </FormField>

          <FormField label="새 비밀번호">
            <FormInput
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="변경할 비밀번호 (선택)"
            />
          </FormField>

          {password && (
            <FormField label="비밀번호 확인">
              <FormInput
                type="password"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                placeholder="비밀번호를 다시 입력하세요"
              />
            </FormField>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <FormButton variant="secondary" onClick={() => setProfileOpen(false)}>취소</FormButton>
            <FormButton onClick={handleSave} disabled={saving}>{saving ? "저장 중…" : "저장"}</FormButton>
          </div>
        </div>
      </Modal>
    </>
  );
}

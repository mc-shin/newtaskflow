"use client";

import { useState } from "react";
import AppLayout from "@/components/AppLayout";
import Modal, { FormField, FormInput, FormSelect, FormButton } from "@/components/Modal";
import { useWorkspaceData } from "@/lib/useWorkspaceData";
import { cn } from "@/lib/utils";
import type { MemberRole } from "@/lib/types";
import { ROLE_LABEL } from "@/lib/types";
import { toast } from "@/components/Toast";
import { Mail, Users, UserPlus, ShieldCheck, Crown, UserCog, User as UserIcon } from "lucide-react";

const roleBadges: Record<MemberRole, string> = {
  admin: "bg-danger/15 text-danger",
  final_manager: "bg-warning/15 text-warning",
  mid_manager: "bg-info/15 text-info",
  member: "bg-accent-muted text-accent",
};

const roleIcons: Record<MemberRole, React.ComponentType<{ className?: string }>> = {
  admin: Crown,
  final_manager: ShieldCheck,
  mid_manager: UserCog,
  member: UserIcon,
};

const ROLE_ORDER: MemberRole[] = ["admin", "final_manager", "mid_manager", "member"];

const randomColors = ["#6366f1", "#8b5cf6", "#06b6d4", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#14b8a6"];

export default function TeamPage() {
  const {
    users,
    currentUser,
    inviteMember,
    updateUserRole,
    workspaceId,
    addActivity,
    addNotification,
  } = useWorkspaceData();

  // Only admin and final_manager can manage members
  const canManage = currentUser?.role === "admin" || currentUser?.role === "final_manager";

  // Invite modal
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<MemberRole>("member");

  // Credentials reveal modal (shown after creating a brand-new user)
  const [credentials, setCredentials] = useState<{ name: string; email: string; password: string } | null>(null);

  // Member detail/role-edit modal
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState<MemberRole>("member");

  const selectedUser = users.find((u) => u.id === selectedUserId);

  const handleInvite = async () => {
    if (!inviteName.trim()) { toast("warning", "이름을 입력해주세요"); return; }
    if (!inviteEmail.trim()) { toast("warning", "이메일을 입력해주세요"); return; }
    if (!workspaceId) { toast("error", "워크스페이스가 없습니다"); return; }

    const created = await inviteMember(workspaceId, {
      email: inviteEmail.trim().toLowerCase(),
      name: inviteName.trim(),
      role: inviteRole,
    });
    if (!created) {
      toast("error", "초대에 실패했습니다. 이미 멤버이거나 권한이 없을 수 있습니다.");
      return;
    }
    addActivity(`${created.name}(${ROLE_LABEL[inviteRole]})을(를) 초대했습니다`, created.name, "project");
    toast("success", `${created.name}님을 ${ROLE_LABEL[inviteRole]}(으)로 초대했습니다.`);

    // If a brand-new user was created, surface the temp password to the inviter.
    const tmp = (created as any).__tmpPassword as string | null;
    const isNew = (created as any).__isNewUser as boolean;
    if (isNew && tmp) {
      setCredentials({ name: created.name, email: created.email, password: tmp });
    }

    setInviteName("");
    setInviteEmail("");
    setInviteRole("member");
    setInviteOpen(false);
  };

  const openDetail = (userId: string) => {
    const u = users.find((x) => x.id === userId);
    if (!u) return;
    setSelectedUserId(userId);
    setEditRole(u.role);
    setDetailOpen(true);
  };

  const handleSaveRole = () => {
    if (!selectedUserId || !selectedUser) return;
    updateUserRole(selectedUserId, editRole);
    addActivity(`${selectedUser.name}의 역할을 ${ROLE_LABEL[editRole]}(으)로 변경했습니다`, selectedUser.name, "project");
    addNotification([selectedUserId], "role_changed", "역할 변경", `역할이 ${ROLE_LABEL[editRole]}(으)로 변경되었습니다`);
    toast("success", "역할이 변경되었습니다.");
    setDetailOpen(false);
  };

  // Summary by role
  const counts: Record<MemberRole, number> = {
    admin: users.filter((u) => u.role === "admin").length,
    final_manager: users.filter((u) => u.role === "final_manager").length,
    mid_manager: users.filter((u) => u.role === "mid_manager").length,
    member: users.filter((u) => u.role === "member").length,
  };

  return (
    <AppLayout
      title="팀원"
      description="워크스페이스 멤버를 초대하고 역할을 관리하세요"
      actions={
        canManage ? (
          <button
            onClick={() => setInviteOpen(true)}
            className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-[14px] bg-accent hover:bg-accent-hover text-white font-medium transition-all"
          >
            <UserPlus className="w-4 h-4" />
            팀원 초대
          </button>
        ) : undefined
      }
    >
      <div className="space-y-8">
        {/* Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-5">
          <SummaryCard label="전체 멤버" count={users.length} icon={<Users className="w-5 h-5 text-muted-foreground" />} tone="muted" />
          <SummaryCard label="관리자(Admin)" count={counts.admin} icon={<Crown className="w-5 h-5 text-danger" />} tone="danger" />
          <SummaryCard label="최종관리자" count={counts.final_manager} icon={<ShieldCheck className="w-5 h-5 text-warning" />} tone="warning" />
          <SummaryCard label="중간관리자" count={counts.mid_manager} icon={<UserCog className="w-5 h-5 text-info" />} tone="info" />
        </div>

        {/* Member grid grouped by role */}
        <div className="space-y-8">
          {ROLE_ORDER.map((role) => {
            const list = users.filter((u) => u.role === role);
            if (list.length === 0) return null;
            return (
              <section key={role}>
                <h2 className="text-[15px] font-semibold text-white mb-4 flex items-center gap-2">
                  {(() => { const Icon = roleIcons[role]; return <Icon className="w-4 h-4 text-muted-foreground" />; })()}
                  {ROLE_LABEL[role]}
                  <span className="text-[12px] text-muted-foreground font-normal">({list.length})</span>
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                  {list.map((user) => (
                    <div
                      key={user.id}
                      onClick={() => canManage && openDetail(user.id)}
                      className={cn(
                        "bg-card border border-border rounded-2xl p-6 transition-all",
                        canManage ? "hover:border-border-hover cursor-pointer" : "",
                      )}
                    >
                      <div className="flex items-start gap-4">
                        <div
                          className="w-12 h-12 rounded-xl flex items-center justify-center text-white text-lg font-bold flex-shrink-0"
                          style={{ background: user.color }}
                        >
                          {user.name.slice(0, 1)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-[16px] font-semibold text-white truncate">{user.name}</h3>
                          <span className={cn("inline-block mt-1 text-[12px] px-2.5 py-1 rounded-lg font-medium", roleBadges[user.role])}>
                            {ROLE_LABEL[user.role]}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-4 text-[13px] text-muted-foreground">
                        <Mail className="w-4 h-4" />
                        <span className="truncate">{user.email}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
          {users.length === 0 && (
            <p className="text-muted-foreground text-[14px] py-12 text-center">아직 멤버가 없습니다. "팀원 초대"로 추가하세요.</p>
          )}
        </div>
      </div>

      {/* Invite Modal */}
      <Modal open={inviteOpen} onClose={() => setInviteOpen(false)} title="팀원 초대" size="sm">
        <div className="space-y-4">
          <FormField label="이름">
            <FormInput placeholder="이름을 입력하세요" value={inviteName} onChange={(e) => setInviteName(e.target.value)} />
          </FormField>
          <FormField label="이메일">
            <FormInput type="email" placeholder="member@example.com" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
          </FormField>
          <FormField label="역할">
            <FormSelect value={inviteRole} onChange={(e) => setInviteRole(e.target.value as MemberRole)}>
              <option value="admin">관리자 (Admin)</option>
              <option value="final_manager">최종관리자</option>
              <option value="mid_manager">중간관리자</option>
              <option value="member">팀원</option>
            </FormSelect>
          </FormField>
          <p className="text-[12px] text-muted-foreground leading-relaxed">
            <strong className="text-foreground">주간보고 단계:</strong> 팀원 → 중간관리자 → 최종관리자.<br />
            중간관리자가 없는 워크스페이스에서는 최종관리자가 팀원 보고서를 직접 취합합니다.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <FormButton variant="secondary" onClick={() => setInviteOpen(false)}>취소</FormButton>
            <FormButton onClick={handleInvite}>초대</FormButton>
          </div>
        </div>
      </Modal>

      {/* Credentials reveal — shown only after creating a brand-new account */}
      <Modal open={!!credentials} onClose={() => setCredentials(null)} title="신규 계정 정보" size="sm">
        {credentials && (
          <div className="space-y-4">
            <p className="text-[13px] text-muted-foreground leading-relaxed">
              <strong className="text-foreground">{credentials.name}</strong>님 계정이 생성되었습니다.
              아래 임시 비밀번호로 로그인할 수 있도록 본인에게 직접 전달해주세요.
              이 화면을 닫으면 비밀번호를 다시 확인할 수 없습니다.
            </p>
            <div className="bg-background border border-border rounded-xl p-4 space-y-2 font-mono text-[13px]">
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">이메일</span>
                <span className="text-foreground">{credentials.email}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">비밀번호</span>
                <span className="text-accent font-semibold">{credentials.password}</span>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <FormButton variant="secondary" onClick={() => {
                navigator.clipboard?.writeText(`이메일: ${credentials.email}\n비밀번호: ${credentials.password}`);
                toast("success", "복사되었습니다.");
              }}>복사</FormButton>
              <FormButton onClick={() => setCredentials(null)}>확인</FormButton>
            </div>
          </div>
        )}
      </Modal>

      {/* Detail/role-edit modal */}
      <Modal open={detailOpen} onClose={() => setDetailOpen(false)} title="멤버 정보" size="sm">
        {selectedUser && (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div
                className="w-14 h-14 rounded-xl flex items-center justify-center text-white text-xl font-bold flex-shrink-0"
                style={{ background: selectedUser.color }}
              >
                {selectedUser.name.slice(0, 1)}
              </div>
              <div>
                <h3 className="text-[18px] font-semibold text-white">{selectedUser.name}</h3>
                <p className="text-[14px] text-muted-foreground">{selectedUser.email}</p>
              </div>
            </div>
            <FormField label="역할">
              <FormSelect value={editRole} onChange={(e) => setEditRole(e.target.value as MemberRole)}>
                <option value="admin">관리자 (Admin)</option>
                <option value="final_manager">최종관리자</option>
                <option value="mid_manager">중간관리자</option>
                <option value="member">팀원</option>
              </FormSelect>
            </FormField>
            <div className="flex justify-end gap-2 pt-2">
              <FormButton variant="secondary" onClick={() => setDetailOpen(false)}>취소</FormButton>
              <FormButton onClick={handleSaveRole}>저장</FormButton>
            </div>
          </div>
        )}
      </Modal>
    </AppLayout>
  );
}

function SummaryCard({ label, count, icon, tone }: { label: string; count: number; icon: React.ReactNode; tone: "muted" | "danger" | "warning" | "info" }) {
  const toneClasses = {
    muted: "text-white",
    danger: "text-danger",
    warning: "text-warning",
    info: "text-info",
  } as const;
  return (
    <div className="bg-card border border-border rounded-2xl p-5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[13px] text-muted-foreground">{label}</span>
        {icon}
      </div>
      <p className={cn("text-3xl font-bold", toneClasses[tone])}>{count}</p>
    </div>
  );
}

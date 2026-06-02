"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/lib/store";
import Modal, { FormField, FormInput, FormTextarea, FormButton } from "@/components/Modal";
import { Zap, Plus, Users, Settings, LogOut, UserPlus } from "lucide-react";
import type { Workspace } from "@/lib/types";
import { toast } from "@/components/Toast";
import { cn } from "@/lib/utils";

export default function WorkspacePage() {
  const router = useRouter();
  const {
    _hydrated,
    isAuthenticated,
    currentUser,
    workspaces,
    hydrateFromServer,
    selectWorkspace,
    createWorkspace,
    updateWorkspace,
    addWorkspaceMember,
    deleteWorkspace,
    leaveWorkspaceMember,
    logout,
    users: allUsers,
  } = useAppStore();

  const [modalOpen, setModalOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");

  // Edit workspace
  const [editWs, setEditWs] = useState<Workspace | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");

  const openEdit = (ws: Workspace) => {
    setEditName(ws.name);
    setEditDesc(ws.description);
    setEditWs(ws);
  };

  const handleEdit = () => {
    if (!editWs) return;
    if (!editName.trim()) { toast("warning", "워크스페이스 이름을 입력해주세요"); return; }
    updateWorkspace(editWs.id, { name: editName.trim(), description: editDesc.trim() });
    setEditWs(null);
  };

  useEffect(() => {
    if (_hydrated && !isAuthenticated) router.push("/login");
    // 워크스페이스 목록(인원 수 포함)을 서버에서 다시 동기화한다.
    else if (_hydrated && isAuthenticated) hydrateFromServer();
  }, [_hydrated, isAuthenticated, router, hydrateFromServer]);

  const handleSelect = (wsId: string) => {
    selectWorkspace(wsId);
    router.push("/reports");
  };

  const handleCreate = async () => {
    if (!newName.trim()) { toast("warning", "워크스페이스 이름을 입력해주세요"); return; }
    if (!currentUser) return;
    const created = await createWorkspace({ name: newName.trim(), description: newDesc.trim(), role: "admin" });
    if (!created) {
      toast("error", "워크스페이스 생성에 실패했습니다.");
      return;
    }
    setNewName("");
    setNewDesc("");
    setModalOpen(false);
    toast("success", "워크스페이스가 생성되었습니다.");
  };

  if (!_hydrated || !isAuthenticated) return null;

  return (
    <div className="min-h-screen bg-background">
      {/* Top header bar - same as landing page */}
      <nav className="fixed top-0 w-full z-50 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-5xl mx-auto px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-accent flex items-center justify-center">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-[18px] text-white">ProjectFlow</span>
          </div>
          {currentUser && (
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2.5">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[12px] font-bold"
                  style={{ background: currentUser.color }}
                >
                  {currentUser.name.slice(0, 1)}
                </div>
                <span className="text-[14px] text-foreground font-medium">{currentUser.name}</span>
              </div>
              <button
                onClick={() => { logout(); window.location.href = "/"; }}
                className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-danger transition-colors"
              >
                <LogOut className="w-4 h-4" />
                로그아웃
              </button>
            </div>
          )}
        </div>
      </nav>

      {/* Main content */}
      <main className="max-w-5xl mx-auto px-8 pt-28 pb-12">
        {/* Title */}
        <div className="mb-8">
          <h1 className="text-[26px] font-bold text-white mb-2">워크스페이스 선택</h1>
          <p className="text-[15px] text-muted-foreground">
            작업할 워크스페이스를 선택하거나 새로운 워크스페이스를 생성하세요.
          </p>
        </div>

        {/* Workspace grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[...workspaces]
            .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0))
            .map((ws) => {
            const memberCount = ws.memberCount ?? ws.members.length;
            return (
              <div
                key={ws.id}
                onClick={() => handleSelect(ws.id)}
                className="bg-card border border-border rounded-2xl p-6 hover:border-accent/40 transition-all group cursor-pointer"
              >
                {/* Top: name + settings */}
                <div className="flex items-start justify-between mb-1">
                  <h3 className="text-[18px] font-bold text-white group-hover:text-accent transition-colors">
                    {ws.name}
                  </h3>
                  <button
                    className="p-1.5 rounded-lg text-muted hover:bg-sidebar-hover hover:text-foreground transition-all"
                    onClick={(e) => { e.stopPropagation(); openEdit(ws); }}
                  >
                    <Settings className="w-4 h-4" />
                  </button>
                </div>

                {/* Description */}
                <p className="text-[13px] text-muted-foreground mb-5 line-clamp-1">
                  {ws.description || "설명을 입력해주세요"}
                </p>

                {/* Stats */}
                <div className="flex items-center gap-4 text-[13px] text-muted mb-4">
                  <span className="flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5" />
                    {memberCount}명
                  </span>
                </div>

                {/* Date */}
                <div className="flex justify-end">
                  <span className="text-[12px] px-2.5 py-1 rounded-lg bg-background border border-border text-muted-foreground">
                    {ws.createdAt.slice(0, 10)}
                  </span>
                </div>
              </div>
            );
          })}

          {/* New workspace card */}
          <div
            onClick={() => setModalOpen(true)}
            className="border border-dashed border-border rounded-2xl p-6 flex flex-col items-center justify-center gap-3 hover:border-accent/40 hover:bg-accent/5 transition-all cursor-pointer min-h-[180px]"
          >
            <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center">
              <Plus className="w-6 h-6 text-accent" />
            </div>
            <div className="text-center">
              <p className="text-[15px] font-semibold text-foreground">새 워크스페이스</p>
              <p className="text-[13px] text-muted-foreground mt-0.5">새로운 워크스페이스를 생성하세요</p>
            </div>
          </div>
        </div>
      </main>

      {/* Create modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="새 워크스페이스 만들기" size="sm">
        <div className="space-y-5">
          <FormField label="워크스페이스 이름">
            <FormInput
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="워크스페이스 이름을 입력하세요"
            />
          </FormField>
          <FormField label="설명">
            <FormTextarea
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="워크스페이스에 대한 설명을 입력하세요"
              rows={3}
            />
          </FormField>
          <div className="flex justify-end gap-3 pt-2">
            <FormButton variant="secondary" onClick={() => setModalOpen(false)}>취소</FormButton>
            <FormButton onClick={handleCreate} disabled={!newName.trim()}>만들기</FormButton>
          </div>
        </div>
      </Modal>

      {/* Edit workspace modal */}
      <Modal open={!!editWs} onClose={() => setEditWs(null)} title="워크스페이스 설정" size="md">
        <div className="space-y-5">
          <FormField label="워크스페이스 이름">
            <FormInput value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="워크스페이스 이름" />
          </FormField>
          <FormField label="설명">
            <FormTextarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} placeholder="설명을 입력하세요" rows={2} />
          </FormField>

          {/* Members */}
          {editWs && (
            <div>
              <p className="text-[13px] font-medium text-muted-foreground mb-2">
                멤버 ({editWs.members.length}명)
              </p>
              <div className="space-y-1.5 max-h-[200px] overflow-y-auto mb-3">
                {editWs.members.map((uid) => {
                  const u = allUsers.find((x) => x.id === uid);
                  if (!u) return null;
                  return (
                    <div key={uid} className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-background border border-border">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0" style={{ background: u.color }}>
                        {u.name.slice(0, 1)}
                      </div>
                      <span className="text-[13px] text-foreground flex-1">{u.name}</span>
                      <span className="text-[11px] text-muted">{u.email}</span>
                    </div>
                  );
                })}
              </div>

              {/* Invite */}
              <p className="text-[13px] font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                <UserPlus className="w-3.5 h-3.5" />멤버 초대
              </p>
              <div className="space-y-1.5 max-h-[150px] overflow-y-auto">
                {allUsers.filter((u) => !editWs.members.includes(u.id)).map((u) => (
                  <div key={u.id} className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-background border border-border">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0" style={{ background: u.color }}>
                      {u.name.slice(0, 1)}
                    </div>
                    <span className="text-[13px] text-foreground flex-1">{u.name}</span>
                    <button
                      onClick={() => {
                        addWorkspaceMember(editWs.id, u.id);
                        setEditWs({ ...editWs, members: [...editWs.members, u.id] });
                        toast("success", `${u.name}님을 초대했습니다`);
                      }}
                      className="px-3 py-1 bg-accent hover:bg-accent-hover rounded-lg text-[12px] text-white font-medium transition-all"
                    >
                      초대
                    </button>
                  </div>
                ))}
                {allUsers.filter((u) => !editWs.members.includes(u.id)).length === 0 && (
                  <p className="text-[13px] text-muted-foreground py-3 text-center">모든 멤버가 이미 참여 중입니다</p>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-between pt-4 border-t border-border">
            <div className="flex gap-2">
              {editWs && currentUser && editWs.ownerId === currentUser.id ? (
                <FormButton
                  variant="danger"
                  onClick={() => {
                    if (!editWs) return;
                    if (window.confirm("정말로 이 워크스페이스를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.")) {
                      deleteWorkspace(editWs.id);
                      setEditWs(null);
                      toast("success", "워크스페이스가 삭제되었습니다");
                      router.push("/workspace");
                    }
                  }}
                >
                  워크스페이스 삭제
                </FormButton>
              ) : editWs && currentUser ? (
                <FormButton
                  variant="danger"
                  onClick={() => {
                    if (!editWs || !currentUser) return;
                    if (window.confirm("정말로 이 워크스페이스를 나가시겠습니까?")) {
                      leaveWorkspaceMember(editWs.id, currentUser.id);
                      setEditWs(null);
                      toast("success", "워크스페이스를 나갔습니다");
                      router.push("/workspace");
                    }
                  }}
                >
                  워크스페이스 나가기
                </FormButton>
              ) : null}
            </div>
            <div className="flex gap-3">
              <FormButton variant="secondary" onClick={() => setEditWs(null)}>취소</FormButton>
              <FormButton onClick={handleEdit} disabled={!editName.trim()}>저장</FormButton>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}

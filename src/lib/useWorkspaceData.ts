import { useMemo } from "react";
import { useAppStore } from "./store";

/**
 * Returns store data filtered by the current workspace.
 * Use this instead of directly accessing store arrays in page components.
 */
export function useWorkspaceData() {
  const store = useAppStore();
  const wsId = store.currentWorkspaceId;

  const projects = useMemo(
    () => store.projects.filter((p) => p.workspaceId === wsId),
    [store.projects, wsId]
  );

  // Tasks belong to projects, so filter by project ids in this workspace
  const projectIds = useMemo(() => new Set(projects.map((p) => p.id)), [projects]);
  const tasks = useMemo(
    () => store.tasks.filter((t) => projectIds.has(t.projectId)),
    [store.tasks, projectIds]
  );

  const meetings = useMemo(
    () => store.meetings.filter((m) => m.workspaceId === wsId),
    [store.meetings, wsId]
  );

  const activities = useMemo(
    () => store.activities.filter((a) => a.workspaceId === wsId),
    [store.activities, wsId]
  );

  const reports = useMemo(
    () => store.reports.filter((r) => r.workspaceId === wsId),
    [store.reports, wsId]
  );

  // Notifications for current user in this workspace
  const notifications = useMemo(
    () => store.notifications.filter((n) => n.workspaceId === wsId && n.targetUserId === store.currentUser?.id),
    [store.notifications, wsId, store.currentUser?.id]
  );

  const templates = useMemo(
    () => store.templates.filter((t) => t.workspaceId === wsId),
    [store.templates, wsId]
  );

  // Workspace members
  const workspace = store.workspaces.find((w) => w.id === wsId);
  const memberIds = useMemo(() => new Set(workspace?.members || []), [workspace]);
  const users = useMemo(
    () => {
      // workspace.members 가 비어있는 경우 (hydrateFromServer 직후 members:[] 로 덮여
      // selectWorkspaceAsync 가 아직 채우기 전) store.users 전체를 폴백으로 사용한다.
      // selectWorkspaceAsync/refreshWorkspaceMembers 가 store.users 를 현재 워크스페이스
      // 멤버로 교체하므로 필터 없이도 정확하며, 멤버 목록이 빈 채로 굳어 취합/머지가
      // 비어버리는 버그(새로고침 시 데이터 안 보임)를 막는다.
      if (memberIds.size === 0) return store.users;
      return store.users.filter((u) => memberIds.has(u.id));
    },
    [store.users, memberIds]
  );

  return {
    ...store,
    // Override with filtered data
    projects,
    tasks,
    meetings,
    activities,
    reports,
    notifications,
    templates,
    users,
    // Also provide all users for reference
    allUsers: store.users,
    workspace,
    workspaceId: wsId,
  };
}

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { User, Project, Task, TaskStatus, MemberRole, Workspace, Template } from "./types";
import { projects, tasks, meetings, activities } from "./mock-data";
import type { Meeting, Activity, Report, Notification, NotificationType, ReportStage } from "./types";
import * as api from "./api-client";
import { setToken, clearToken } from "./api-client";

// We start with empty users/workspaces/reports; data loads from backend on login/hydrate.
const users: User[] = [];
const workspaces: Workspace[] = [];
const reports: Report[] = [];

interface AppState {
  _hydrated: boolean;
  wsDataLoading: boolean; // 워크스페이스 데이터(멤버·보고서) 로딩 중 여부 — "로딩"과 "빈 상태" 구분용
  currentUser: User | null;
  isAuthenticated: boolean;
  sidebarOpen: boolean;
  users: User[];
  projects: Project[];
  tasks: Task[];
  meetings: Meeting[];
  activities: Activity[];
  reports: Report[];
  workspaces: Workspace[];
  currentWorkspaceId: string | null;
  selectedProjectId: string | null;
  timelineRange: { start: string; end: string };
  notifications: Notification[];
  templates: Template[];
  theme: "dark" | "light";
  dashboardWidgets: string[];

  login: (email: string, password: string) => Promise<boolean>;
  signup: (email: string, password: string, name: string) => Promise<boolean>;
  logout: () => void;
  hydrateFromServer: () => Promise<void>;
  toggleSidebar: () => void;
  setTimelineRange: (start: string, end: string) => void;
  selectProject: (id: string | null) => void;

  // Tasks
  addTask: (task: Task) => void;
  updateTask: (taskId: string, updates: Partial<Task>) => void;
  deleteTask: (taskId: string) => void;
  updateTaskStatus: (taskId: string, status: TaskStatus) => void;
  reorderTasks: (projectId: string, status: TaskStatus, taskIds: string[]) => void;

  // Projects
  addTaskComment: (taskId: string, content: string) => void;

  addProject: (project: Project) => void;
  updateProject: (projectId: string, updates: Partial<Project>) => void;
  deleteProject: (projectId: string) => void;

  // Meetings
  addMeeting: (meeting: Meeting) => void;
  updateMeeting: (meetingId: string, updates: Partial<Meeting>) => void;
  deleteMeeting: (meetingId: string) => void;

  // Reports
  addReport: (report: Report) => Promise<Report | null>;
  updateReport: (reportId: string, updates: Partial<Report>) => Promise<void>;
  deleteReport: (reportId: string) => Promise<void>;
  distributeReport: (reportId: string) => Promise<void>;
  closeReport: (reportId: string) => Promise<void>;
  submitReport: (reportId: string, userId: string, content: string, stage: import("./types").ReportStage) => Promise<void>;

  // Users
  addUser: (user: User) => void;
  updateUserRole: (userId: string, role: MemberRole) => void;
  updateUserProfile: (userId: string, updates: { name?: string; color?: string; password?: string }) => Promise<boolean>;

  // Workspaces
  addWorkspace: (ws: Workspace) => void;
  createWorkspace: (input: { name: string; description?: string; role?: MemberRole }) => Promise<Workspace | null>;
  updateWorkspace: (wsId: string, updates: Partial<Workspace>) => void;
  addWorkspaceMember: (wsId: string, userId: string) => void;
  inviteMember: (wsId: string, input: { email: string; name?: string; role: MemberRole; password?: string }) => Promise<User | null>;
  selectWorkspace: (id: string) => void;
  selectWorkspaceAsync: (id: string) => Promise<void>;
  leaveWorkspace: () => void;
  refreshReports: (wsId: string) => Promise<void>;
  refreshReport: (reportId: string) => Promise<void>;
  refreshWorkspaceMembers: (wsId: string) => Promise<void>;

  // Activity log
  addActivity: (action: string, target: string, targetType: Activity["targetType"]) => void;

  // Notifications
  addNotification: (targetUserIds: string[], type: NotificationType, title: string, message: string, link?: string) => void;
  markNotificationRead: (notificationId: string) => void;
  markAllNotificationsRead: () => void;

  // Templates
  addTemplate: (template: Template) => void;
  deleteTemplate: (templateId: string) => void;

  // Theme
  toggleTheme: () => void;

  // Dashboard widgets
  setDashboardWidgets: (widgets: string[]) => void;

  // Task attachments
  addTaskAttachment: (taskId: string, attachment: import("./types").TaskAttachment) => void;

  // Workspace
  deleteWorkspace: (wsId: string) => Promise<boolean>;
  leaveWorkspaceMember: (wsId: string, userId: string) => Promise<boolean>;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      _hydrated: false,
      wsDataLoading: false,
      currentUser: null,
      isAuthenticated: false,
      sidebarOpen: true,
      users,
      projects,
      tasks,
      meetings,
      activities,
      reports,
      workspaces,
      currentWorkspaceId: null,
      selectedProjectId: null,
      notifications: [],
      templates: [],
      theme: "dark",
      dashboardWidgets: ["stats", "weekly", "chart", "distribution", "tasks", "calendar", "activity"],
      timelineRange: { start: "2026-03-01", end: "2026-08-01" },

      login: async (email: string, password: string) => {
        try {
          const { user, token } = await api.auth.login({ email, password });
          setToken(token);
          set({
            currentUser: { ...user, role: "member" as MemberRole },
            isAuthenticated: true,
          });
          await get().hydrateFromServer();
          return true;
        } catch (e) {
          console.error("login failed", e);
          return false;
        }
      },

      signup: async (email: string, password: string, name: string) => {
        try {
          const { user, token } = await api.auth.signup({ email, password, name });
          setToken(token);
          set({
            currentUser: { ...user, role: "member" as MemberRole },
            isAuthenticated: true,
          });
          await get().hydrateFromServer();
          return true;
        } catch (e) {
          console.error("signup failed", e);
          return false;
        }
      },

      logout: () => {
        clearToken();
        set({
          currentUser: null,
          isAuthenticated: false,
          currentWorkspaceId: null,
          users: [],
          workspaces: [],
          reports: [],
        });
      },

      hydrateFromServer: async () => {
        try {
          const me = get().currentUser;
          if (!me) return;
          // load workspaces (each one carries the user's role inside it)
          const { workspaces: wsList } = await api.workspaces.list();
          // If a currentWorkspaceId is set, sync currentUser.role to that workspace's myRole.
          const curWsId = get().currentWorkspaceId;
          set((s) => {
            // 기존(persist 복원/selectWorkspaceAsync) 의 members 를 보존한다.  list API 는
            // 요약 정보만 주므로 members 가 없는데, [] 로 덮으면 useWorkspaceData.users 가
            // 비어 취합/머지가 동작하지 않는 버그(새로고침 시 데이터 안 보임)가 발생한다.
            const wsMapped: Workspace[] = wsList.map((w) => {
              const existing = s.workspaces.find((ew) => ew.id === w.id);
              return {
                id: w.id,
                name: w.name,
                description: w.description || "",
                ownerId: w.ownerId,
                members: existing?.members || [],
                memberCount: w.memberCount,
                createdAt: typeof w.createdAt === "string" ? w.createdAt : new Date(w.createdAt).toISOString(),
                myRole: w.myRole as MemberRole,
              };
            });
            const curWs = wsMapped.find((w) => w.id === curWsId);
            return {
              workspaces: wsMapped,
              currentUser: s.currentUser && curWs?.myRole ? { ...s.currentUser, role: curWs.myRole } : s.currentUser,
            };
          });
        } catch (e) {
          console.error("hydrate failed", e);
        }
      },
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      setTimelineRange: (start, end) => set({ timelineRange: { start, end } }),
      selectProject: (id) => set({ selectedProjectId: id }),

      // Tasks
      addTask: (task) => set((s) => ({ tasks: [...s.tasks, task] })),
      updateTask: (taskId, updates) =>
        set((s) => ({ tasks: s.tasks.map((t) => (t.id === taskId ? { ...t, ...updates } : t)) })),
      deleteTask: (taskId) =>
        set((s) => ({ tasks: s.tasks.filter((t) => t.id !== taskId) })),
      addTaskComment: (taskId, content) => {
        const { currentUser } = get();
        if (!currentUser) return;
        const comment = { id: `c${Date.now()}`, userId: currentUser.id, content, createdAt: new Date().toISOString() };
        set((s) => ({
          tasks: s.tasks.map((t) => t.id === taskId ? { ...t, comments: [...(t.comments || []), comment] } : t),
        }));
      },
      updateTaskStatus: (taskId, status) =>
        set((s) => ({ tasks: s.tasks.map((t) => (t.id === taskId ? { ...t, status } : t)) })),
      reorderTasks: (_projectId, status, taskIds) =>
        set((s) => ({
          tasks: s.tasks.map((t) => {
            const idx = taskIds.indexOf(t.id);
            if (idx !== -1) return { ...t, status, order: idx };
            return t;
          }),
        })),

      // Projects
      addProject: (project) => set((s) => ({ projects: [...s.projects, project] })),
      updateProject: (projectId, updates) =>
        set((s) => ({ projects: s.projects.map((p) => (p.id === projectId ? { ...p, ...updates } : p)) })),
      deleteProject: (projectId) =>
        set((s) => ({
          projects: s.projects.filter((p) => p.id !== projectId),
          tasks: s.tasks.filter((t) => t.projectId !== projectId),
        })),

      // Meetings
      addMeeting: (meeting) => set((s) => ({ meetings: [...s.meetings, meeting] })),
      updateMeeting: (meetingId, updates) =>
        set((s) => ({ meetings: s.meetings.map((m) => (m.id === meetingId ? { ...m, ...updates } : m)) })),
      deleteMeeting: (meetingId) =>
        set((s) => ({ meetings: s.meetings.filter((m) => m.id !== meetingId) })),

      // Reports — backend-first; await on the caller side so subsequent ops use the real id.
      addReport: async (report) => {
        try {
          const { report: created } = await api.reports.create(report.workspaceId || "", {
            title: report.title,
            type: report.type,
            content: report.content,
            status: report.status,
          });
          const mapped: Report = {
            ...report,
            id: created.id,
            workspaceId: created.workspaceId,
            createdAt: typeof created.createdAt === "string" ? created.createdAt.split("T")[0] : new Date(created.createdAt).toISOString().split("T")[0],
            status: created.status,
          };
          set((s) => ({ reports: [...s.reports, mapped] }));
          return mapped;
        } catch (e) {
          console.error("addReport failed", e);
          return null;
        }
      },
      updateReport: async (reportId, updates) => {
        set((s) => ({ reports: s.reports.map((r) => (r.id === reportId ? { ...r, ...updates } : r)) }));
        try { await api.reports.update(reportId, updates as any); }
        catch (e) { console.error("updateReport failed", e); }
      },
      deleteReport: async (reportId) => {
        const snapshot = get().reports;
        set((s) => ({ reports: s.reports.filter((r) => r.id !== reportId) }));
        try { await api.reports.delete(reportId); }
        catch (e) {
          console.error("deleteReport failed", e);
          set({ reports: snapshot }); // revert
        }
      },
      distributeReport: async (reportId) => {
        try {
          await api.reports.distribute(reportId);
          set((s) => ({ reports: s.reports.map((r) => (r.id === reportId ? { ...r, status: "distributed" as const, submissions: r.submissions || {} } : r)) }));
        } catch (e) { console.error("distributeReport failed", e); }
      },
      closeReport: async (reportId) => {
        try {
          await api.reports.close(reportId);
          set((s) => ({ reports: s.reports.map((r) => (r.id === reportId ? { ...r, status: "closed" as const } : r)) }));
        } catch (e) { console.error("closeReport failed", e); }
      },
      submitReport: async (reportId, userId, content, stage) => {
        try {
          await api.reports.submit(reportId, { content, stage });
          set((s) => ({
            reports: s.reports.map((r) => {
              if (r.id !== reportId) return r;
              return { ...r, submissions: { ...r.submissions, [userId]: { content, submittedAt: new Date().toISOString(), stage } } };
            }),
          }));
        } catch (e) { console.error("submitReport failed", e); }
      },

      // Users
      addUser: (user) => set((s) => ({ users: [...s.users, user] })),
      updateUserRole: (userId, role) => {
        set((s) => ({
          users: s.users.map((u) => (u.id === userId ? { ...u, role } : u)),
          currentUser: s.currentUser?.id === userId && s.currentUser ? { ...s.currentUser, role } : s.currentUser,
          workspaces: s.currentWorkspaceId && s.currentUser?.id === userId
            ? s.workspaces.map((w) => (w.id === s.currentWorkspaceId ? { ...w, myRole: role } : w))
            : s.workspaces,
        }));
        const wsId = get().currentWorkspaceId;
        if (wsId) {
          api.workspaces.updateMemberRole(wsId, userId, role as any).catch((e) => console.error("updateMemberRole failed", e));
        }
      },
      updateUserProfile: async (userId, updates) => {
        // 비밀번호는 로컬 store/localStorage 에 저장하지 않는다(평문 보관 방지).
        const { password, ...localUpdates } = updates;
        set((s) => ({
          users: s.users.map((u) => (u.id === userId ? { ...u, ...localUpdates } : u)),
          currentUser: s.currentUser?.id === userId ? { ...s.currentUser, ...localUpdates } : s.currentUser,
        }));
        // backend only allows editing own profile.  password 포함 전체를 서버로 전송.
        if (get().currentUser?.id === userId) {
          try {
            await api.auth.updateMe(updates);
            return true;
          } catch (e) {
            console.error("updateMe failed", e);
            return false;
          }
        }
        return true;
      },

      // Workspaces
      addWorkspace: (ws) => set((s) => ({ workspaces: [...s.workspaces, ws] })),
      createWorkspace: async ({ name, description, role }) => {
        try {
          const { workspace } = await api.workspaces.create({ name, description, role });
          const ws: Workspace = {
            id: workspace.id,
            name: workspace.name,
            description: workspace.description || "",
            ownerId: workspace.ownerId,
            members: [get().currentUser?.id || ""].filter(Boolean) as string[],
            memberCount: workspace.memberCount ?? 1,
            createdAt: typeof workspace.createdAt === "string" ? workspace.createdAt : new Date(workspace.createdAt).toISOString(),
            myRole: workspace.myRole as MemberRole,
          };
          set((s) => ({ workspaces: [...s.workspaces, ws] }));
          return ws;
        } catch (e) {
          console.error("createWorkspace failed", e);
          return null;
        }
      },
      updateWorkspace: (wsId: string, updates: Partial<Workspace>) =>
        set((s) => ({ workspaces: s.workspaces.map((w) => (w.id === wsId ? { ...w, ...updates } : w)) })),
      addWorkspaceMember: (wsId: string, userId: string) =>
        set((s) => ({
          workspaces: s.workspaces.map((w) => w.id === wsId && !w.members.includes(userId) ? { ...w, members: [...w.members, userId] } : w),
        })),
      inviteMember: async (wsId, { email, name, role, password }) => {
        try {
          const res = await api.workspaces.invite(wsId, { email, name, role, password });
          const member = res.member;
          const newUser: User = {
            id: member.id,
            email: member.email,
            name: member.name,
            role: member.role as MemberRole,
            color: member.color,
          };
          set((s) => ({
            users: s.users.find((u) => u.id === newUser.id) ? s.users.map((u) => u.id === newUser.id ? newUser : u) : [...s.users, newUser],
            workspaces: s.workspaces.map((w) => w.id === wsId && !w.members.includes(newUser.id) ? { ...w, members: [...w.members, newUser.id] } : w),
          }));
          (newUser as any).__tmpPassword = res.tmpPassword;
          (newUser as any).__isNewUser = res.isNewUser;
          return newUser;
        } catch (e: any) {
          console.error("inviteMember failed", e);
          return null;
        }
      },
      selectWorkspace: (id) => {
        // Synchronously sync currentUser.role from the cached workspace.myRole so
        // role-gated buttons render immediately on the very first render.
        const ws = get().workspaces.find((w) => w.id === id);
        set((s) => ({
          currentWorkspaceId: id,
          currentUser: s.currentUser && ws?.myRole ? { ...s.currentUser, role: ws.myRole } : s.currentUser,
        }));
        void get().selectWorkspaceAsync(id);
      },
      selectWorkspaceAsync: async (id: string) => {
        set({ wsDataLoading: true });
        try {
          const { workspace } = await api.workspaces.get(id);
          const mappedUsers: User[] = workspace.members.map((m) => ({
            id: m.id,
            email: m.email,
            name: m.name,
            color: m.color,
            role: m.role as MemberRole,
          }));
          const myRole = workspace.myRole as MemberRole;
          set((s) => ({
            currentWorkspaceId: id,
            users: mappedUsers,
            currentUser: s.currentUser ? { ...s.currentUser, role: myRole } : s.currentUser,
            workspaces: s.workspaces.map((w) =>
              w.id === id ? { ...w, name: workspace.name, description: workspace.description || "", ownerId: workspace.ownerId, members: mappedUsers.map((u) => u.id), myRole } : w,
            ),
          }));
          await get().refreshReports(id);
        } catch (e) {
          console.error("selectWorkspaceAsync failed", e);
        } finally {
          set({ wsDataLoading: false });
        }
      },
      leaveWorkspace: () => set((s) => ({
        currentWorkspaceId: null,
        users: [],
        reports: [],
        currentUser: s.currentUser ? { ...s.currentUser, role: "member" as MemberRole } : s.currentUser,
      })),
      refreshReport: async (reportId: string) => {
        try {
          const { report: r } = await api.reports.get(reportId);
          const mapped: Report = {
            id: r.id,
            workspaceId: r.workspaceId,
            title: r.title,
            type: (r.type as Report["type"]) || "weekly",
            authorId: r.authorId,
            createdAt: typeof r.createdAt === "string" ? r.createdAt.split("T")[0] : new Date(r.createdAt).toISOString().split("T")[0],
            content: r.content,
            status: r.status,
            submissions: r.submissions as Report["submissions"],
          };
          set((s) => ({
            reports: s.reports.some((r2) => r2.id === reportId)
              ? s.reports.map((r2) => (r2.id === reportId ? mapped : r2))
              : [...s.reports, mapped],
          }));
        } catch (e) {
          console.error("refreshReport failed", e);
        }
      },
      refreshReports: async (wsId: string) => {
        try {
          const { reports: list } = await api.reports.list(wsId);
          const mapped: Report[] = list.map((r) => ({
            id: r.id,
            workspaceId: r.workspaceId,
            title: r.title,
            type: (r.type as Report["type"]) || "weekly",
            authorId: r.authorId,
            createdAt: typeof r.createdAt === "string" ? r.createdAt.split("T")[0] : new Date(r.createdAt).toISOString().split("T")[0],
            content: r.content,
            status: r.status,
            submissions: r.submissions as Report["submissions"],
          }));
          set((s) => ({
            reports: [
              ...s.reports.filter((r) => r.workspaceId !== wsId),
              ...mapped,
            ],
          }));
        } catch (e) {
          console.error("refreshReports failed", e);
        }
      },
      refreshWorkspaceMembers: async (wsId: string) => {
        try {
          const { workspace } = await api.workspaces.get(wsId);
          const mappedUsers: User[] = workspace.members.map((m) => ({
            id: m.id,
            email: m.email,
            name: m.name,
            color: m.color,
            role: m.role as MemberRole,
          }));
          set({ users: mappedUsers });
        } catch (e) {
          console.error("refreshWorkspaceMembers failed", e);
        }
      },

      // Activity log
      addActivity: (action, target, targetType) => {
        const { currentUser, currentWorkspaceId } = get();
        if (!currentUser) return;
        const activity: Activity = {
          id: `a${Date.now()}`,
          userId: currentUser.id,
          action,
          target,
          targetType,
          createdAt: new Date().toISOString(),
          workspaceId: currentWorkspaceId || undefined,
        };
        set((s) => ({ activities: [activity, ...s.activities] }));
      },

      // Notifications
      addNotification: (targetUserIds, type, title, message, link) => {
        const { currentUser, currentWorkspaceId } = get();
        if (!currentUser || !currentWorkspaceId) return;
        const newNotifs: Notification[] = targetUserIds
          .filter((uid) => type === "task_status" || uid !== currentUser.id)
          .map((uid) => ({
            id: `n${Date.now()}_${uid}`,
            workspaceId: currentWorkspaceId,
            targetUserId: uid,
            fromUserId: currentUser.id,
            type,
            title,
            message,
            link,
            read: false,
            createdAt: new Date().toISOString(),
          }));
        if (newNotifs.length > 0) {
          set((s) => ({ notifications: [...newNotifs, ...s.notifications] }));
        }
      },
      markNotificationRead: (notificationId) =>
        set((s) => ({ notifications: s.notifications.map((n) => n.id === notificationId ? { ...n, read: true } : n) })),
      markAllNotificationsRead: () => {
        const { currentUser, currentWorkspaceId } = get();
        if (!currentUser) return;
        set((s) => ({
          notifications: s.notifications.map((n) =>
            n.targetUserId === currentUser.id && n.workspaceId === currentWorkspaceId ? { ...n, read: true } : n
          ),
        }));
      },

      // Templates
      addTemplate: (template) => set((s) => ({ templates: [...s.templates, template] })),
      deleteTemplate: (templateId) => set((s) => ({ templates: s.templates.filter((t) => t.id !== templateId) })),

      toggleTheme: () => set((s) => ({ theme: s.theme === "dark" ? "light" : "dark" })),
      setDashboardWidgets: (widgets) => set({ dashboardWidgets: widgets }),

      addTaskAttachment: (taskId, attachment) =>
        set((s) => ({
          tasks: s.tasks.map((t) => t.id === taskId ? { ...t, attachments: [...(t.attachments || []), attachment] } : t),
        })),

      deleteWorkspace: async (wsId) => {
        try {
          await api.workspaces.delete(wsId);   // 서버(Neon)에서 실제 삭제 — cascade 로 멤버/보고서/제출 함께 삭제
        } catch (e) {
          console.error("deleteWorkspace failed", e);
          return false;
        }
        set((s) => ({
          workspaces: s.workspaces.filter((w) => w.id !== wsId),
          currentWorkspaceId: s.currentWorkspaceId === wsId ? null : s.currentWorkspaceId,
        }));
        return true;
      },
      leaveWorkspaceMember: async (wsId, userId) => {
        try {
          await api.workspaces.removeMember(wsId, userId);  // 서버에서 멤버십 제거
        } catch (e) {
          console.error("leaveWorkspaceMember failed", e);
          return false;
        }
        // 현재 사용자가 나갔으므로 목록에서도 제거(더 이상 멤버가 아님).
        set((s) => ({
          workspaces: s.workspaces.filter((w) => w.id !== wsId),
          currentWorkspaceId: s.currentWorkspaceId === wsId ? null : s.currentWorkspaceId,
        }));
        return true;
      },
    }),
    {
      name: "project-flow-store",
      partialize: (state) => {
        const { _hydrated, ...rest } = state;
        return rest;
      },
      storage: {
        getItem: (name) => {
          if (typeof window === "undefined") return null;
          const str = localStorage.getItem(name);
          return str ? JSON.parse(str) : null;
        },
        setItem: (name, value) => {
          if (typeof window === "undefined") return;
          try { localStorage.setItem(name, JSON.stringify(value)); } catch { /* quota */ }
        },
        removeItem: (name) => {
          if (typeof window === "undefined") return;
          localStorage.removeItem(name);
        },
      },
      onRehydrateStorage: () => (state) => {
        if (state) state._hydrated = true;
      },
    }
  )
);

// Auto-calculate project progress whenever tasks change
let prevTasksJson = "";
useAppStore.subscribe((state) => {
  const tasksJson = JSON.stringify(state.tasks.map((t) => `${t.projectId}:${t.status}:${t.progress}`));
  if (tasksJson === prevTasksJson) return;
  prevTasksJson = tasksJson;

  const updates: { id: string; progress: number }[] = [];
  for (const project of state.projects) {
    const projectTasks = state.tasks.filter((t) => t.projectId === project.id);
    if (projectTasks.length === 0) continue;
    const avg = Math.round(
      projectTasks.reduce((sum, t) => sum + (t.status === "done" ? 100 : t.status === "todo" ? 0 : t.progress), 0) / projectTasks.length
    );
    if (avg !== project.progress) {
      updates.push({ id: project.id, progress: avg });
    }
  }
  if (updates.length > 0) {
    useAppStore.setState((s) => ({
      projects: s.projects.map((p) => {
        const u = updates.find((x) => x.id === p.id);
        return u ? { ...p, progress: u.progress } : p;
      }),
    }));
  }
});

// Cross-tab sync: listen for localStorage changes from other tabs
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === "project-flow-store" && e.newValue) {
      try {
        const parsed = JSON.parse(e.newValue);
        if (parsed?.state) {
          const { _hydrated, ...data } = parsed.state;
          useAppStore.setState(data);
        }
      } catch { /* ignore parse errors */ }
    }
  });
}

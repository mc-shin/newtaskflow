export type Priority = "urgent" | "high" | "medium" | "low";
export type TaskStatus = "todo" | "in_progress" | "done" | "issue";
export type MemberRole = "admin" | "final_manager" | "mid_manager" | "member";

export interface Workspace {
  id: string;
  name: string;
  description: string;
  ownerId: string;
  members: string[];
  memberCount?: number; // 서버가 주는 멤버 수(목록용) — members 가 비어있어도 정확한 인원 표시
  createdAt: string;
  // Current user's role within this workspace. Populated by hydrateFromServer and
  // createWorkspace so role-gated UI renders instantly without waiting for member fetch.
  myRole?: MemberRole;
}
export type ReportStage = "member" | "mid" | "final";

export const ROLE_LABEL: Record<MemberRole, string> = {
  admin: "관리자",
  final_manager: "최종관리자",
  mid_manager: "중간관리자",
  member: "팀원",
};

// Map a role to the report stage that role contributes at.
export function stageForRole(role: MemberRole): ReportStage {
  if (role === "admin" || role === "final_manager") return "final";
  if (role === "mid_manager") return "mid";
  return "member";
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: MemberRole;
  avatar?: string;
  color: string;
}

export interface Project {
  id: string;
  workspaceId?: string;
  name: string;
  description: string;
  status: "active" | "completed" | "archived";
  progress: number;
  members: string[];
  createdAt: string;
  dueDate?: string;
  labels: string[];
}

export interface TaskComment {
  id: string;
  userId: string;
  content: string;
  createdAt: string;
}

export interface TaskAttachment {
  id: string;
  name: string;
  size: number;
  type: string;
  dataUrl: string;
  uploadedBy: string;
  uploadedAt: string;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  projectId: string;
  status: TaskStatus;
  priority: Priority;
  assigneeId?: string;
  dueDate?: string;
  createdAt: string;
  labels: string[];
  progress: number;
  order: number;
  attachments?: TaskAttachment[];
  comments?: TaskComment[];
}

export interface Meeting {
  id: string;
  workspaceId?: string;
  title: string;
  date: string;
  time: string;
  duration: number;
  participants: string[];
  projectId?: string;
  notes?: string;
  status: "scheduled" | "completed" | "cancelled";
  recurrence?: "none" | "weekly" | "biweekly" | "monthly";
}

export interface Activity {
  id: string;
  workspaceId?: string;
  userId: string;
  action: string;
  target: string;
  targetType: "project" | "task" | "meeting" | "report";
  createdAt: string;
}

export interface ReportSubmission {
  content: string;
  submittedAt: string;
  stage: ReportStage;
}

export interface Report {
  id: string;
  workspaceId?: string;
  title: string;
  type: "weekly" | "monthly" | "custom";
  authorId: string;
  projectId?: string;
  createdAt: string;
  content: string;
  status: "template" | "distributed" | "closed";
  submissions?: Record<string, ReportSubmission>;
}

export type NotificationType = "report_distributed" | "task_assigned" | "meeting_invited" | "task_status" | "report_submitted" | "meeting_completed" | "role_changed";

export interface Notification {
  id: string;
  workspaceId: string;
  targetUserId: string;
  fromUserId: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
  read: boolean;
  createdAt: string;
}

export interface Template {
  id: string;
  workspaceId: string;
  type: "project" | "task" | "report";
  name: string;
  data: string; // JSON serialized
  createdBy: string;
  createdAt: string;
}

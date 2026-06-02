import { User, Project, Task, Meeting, Activity, Report, Workspace } from "./types";

export const users: User[] = [
  { id: "u1", name: "김민수", email: "admin@qubicom.co.kr", role: "admin", color: "#6366f1" },
  { id: "u2", name: "이서연", email: "seo@qubicom.co.kr", role: "final_manager", color: "#8b5cf6" },
  { id: "u3", name: "박지훈", email: "ji@qubicom.co.kr", role: "member", color: "#06b6d4" },
  { id: "u4", name: "최은지", email: "eun@qubicom.co.kr", role: "member", color: "#10b981" },
  { id: "u5", name: "정태영", email: "tae@qubicom.co.kr", role: "member", color: "#f59e0b" },
  { id: "u6", name: "한소희", email: "so@qubicom.co.kr", role: "member", color: "#ef4444" },
  { id: "u7", name: "윤성민", email: "sung@qubicom.co.kr", role: "mid_manager", color: "#ec4899" },
  { id: "u8", name: "장현우", email: "hyun@qubicom.co.kr", role: "member", color: "#14b8a6" },
];

export const workspaces: Workspace[] = [
  { id: "w1", name: "Nes", description: "주요 업무 관리 워크스페이스", ownerId: "u1", members: ["u1","u2","u3","u4","u5","u6","u7","u8"], createdAt: "2025-12-11" },
];

export const projects: Project[] = [
  { id: "p1", name: "WING 플랫폼", description: "차세대 통신 플랫폼 개발", status: "active", progress: 68, members: ["u1", "u2", "u3", "u4"], createdAt: "2025-11-15", dueDate: "2026-06-30", labels: ["개발", "핵심"], workspaceId: "w1" },
  { id: "p2", name: "6G 과제", description: "6G 기술 연구 및 개발 과제", status: "active", progress: 42, members: ["u1", "u5", "u6"], createdAt: "2025-12-01", dueDate: "2026-09-30", labels: ["연구", "R&D"], workspaceId: "w1" },
  { id: "p3", name: "QSPEED", description: "고속 데이터 처리 시스템", status: "active", progress: 85, members: ["u2", "u3", "u7"], createdAt: "2025-10-01", dueDate: "2026-04-30", labels: ["개발", "긴급"], workspaceId: "w1" },
  { id: "p4", name: "AI 진단 시스템", description: "AI 기반 네트워크 진단 도구", status: "active", progress: 25, members: ["u4", "u8", "u1"], createdAt: "2026-01-15", dueDate: "2026-08-31", labels: ["AI", "신규"], workspaceId: "w1" },
  { id: "p5", name: "TRS 중계기", description: "TRS 중계기 하드웨어 개발", status: "completed", progress: 100, members: ["u5", "u6", "u7"], createdAt: "2025-06-01", dueDate: "2026-02-28", labels: ["하드웨어"], workspaceId: "w1" },
];

export const tasks: Task[] = [
  { id: "t1", title: "API 게이트웨이 설계", projectId: "p1", status: "done", priority: "high", assigneeId: "u3", dueDate: "2026-03-15", createdAt: "2026-02-01", labels: ["백엔드"], progress: 100, order: 0 },
  { id: "t2", title: "사용자 인증 모듈 개발", projectId: "p1", status: "done", priority: "urgent", assigneeId: "u4", dueDate: "2026-03-20", createdAt: "2026-02-05", labels: ["백엔드", "보안"], progress: 100, order: 1 },
  { id: "t3", title: "대시보드 UI 구현", projectId: "p1", status: "in_progress", priority: "high", assigneeId: "u2", dueDate: "2026-04-10", createdAt: "2026-03-01", labels: ["프론트엔드"], progress: 65, order: 2 },
  { id: "t4", title: "실시간 알림 시스템", projectId: "p1", status: "in_progress", priority: "medium", assigneeId: "u3", dueDate: "2026-04-20", createdAt: "2026-03-10", labels: ["백엔드"], progress: 40, order: 3 },
  { id: "t5", title: "성능 최적화", projectId: "p1", status: "todo", priority: "medium", assigneeId: "u4", dueDate: "2026-05-01", createdAt: "2026-03-15", labels: ["최적화"], progress: 0, order: 4 },
  { id: "t6", title: "테스트 자동화 구축", projectId: "p1", status: "todo", priority: "low", assigneeId: "u2", dueDate: "2026-05-15", createdAt: "2026-03-20", labels: ["QA"], progress: 0, order: 5 },
  { id: "t7", title: "채널 모델링 연구", projectId: "p2", status: "in_progress", priority: "high", assigneeId: "u5", dueDate: "2026-05-30", createdAt: "2026-01-10", labels: ["연구"], progress: 55, order: 0 },
  { id: "t8", title: "프로토타입 시뮬레이션", projectId: "p2", status: "todo", priority: "medium", assigneeId: "u6", dueDate: "2026-06-30", createdAt: "2026-02-01", labels: ["개발"], progress: 0, order: 1 },
  { id: "t9", title: "논문 작성", projectId: "p2", status: "issue", priority: "urgent", assigneeId: "u5", dueDate: "2026-04-05", createdAt: "2026-03-01", labels: ["문서"], progress: 30, order: 2 },
  { id: "t10", title: "데이터 파이프라인 최적화", projectId: "p3", status: "in_progress", priority: "urgent", assigneeId: "u7", dueDate: "2026-04-15", createdAt: "2026-03-01", labels: ["백엔드"], progress: 75, order: 0 },
  { id: "t11", title: "캐시 레이어 구현", projectId: "p3", status: "done", priority: "high", assigneeId: "u3", dueDate: "2026-03-30", createdAt: "2026-02-15", labels: ["백엔드"], progress: 100, order: 1 },
  { id: "t12", title: "모니터링 대시보드", projectId: "p3", status: "in_progress", priority: "medium", assigneeId: "u2", dueDate: "2026-04-25", createdAt: "2026-03-10", labels: ["프론트엔드"], progress: 50, order: 2 },
  { id: "t13", title: "AI 모델 학습 파이프라인", projectId: "p4", status: "in_progress", priority: "high", assigneeId: "u8", dueDate: "2026-05-15", createdAt: "2026-02-01", labels: ["AI", "백엔드"], progress: 35, order: 0 },
  { id: "t14", title: "진단 규칙 엔진 설계", projectId: "p4", status: "todo", priority: "high", assigneeId: "u1", dueDate: "2026-06-01", createdAt: "2026-02-15", labels: ["설계"], progress: 0, order: 1 },
  { id: "t15", title: "데이터 수집 에이전트", projectId: "p4", status: "todo", priority: "medium", assigneeId: "u4", dueDate: "2026-06-15", createdAt: "2026-03-01", labels: ["백엔드"], progress: 0, order: 2 },
  { id: "t16", title: "리포트 UI 설계", projectId: "p4", status: "issue", priority: "low", assigneeId: "u8", dueDate: "2026-04-08", createdAt: "2026-03-20", labels: ["프론트엔드", "디자인"], progress: 10, order: 3 },
];

export const meetings: Meeting[] = [
  { id: "m1", title: "WING 스프린트 리뷰", date: "2026-04-07", time: "10:00", duration: 60, participants: ["u1", "u2", "u3", "u4"], projectId: "p1", status: "scheduled", workspaceId: "w1" },
  { id: "m2", title: "6G 과제 주간 회의", date: "2026-04-08", time: "14:00", duration: 90, participants: ["u1", "u5", "u6"], projectId: "p2", status: "scheduled", workspaceId: "w1" },
  { id: "m3", title: "QSPEED 마감 점검", date: "2026-04-09", time: "09:00", duration: 45, participants: ["u2", "u3", "u7"], projectId: "p3", status: "scheduled", workspaceId: "w1" },
  { id: "m4", title: "전체 팀 스탠드업", date: "2026-04-06", time: "09:30", duration: 30, participants: ["u1", "u2", "u3", "u4", "u5"], status: "completed", notes: "각 팀 진행상황 공유 완료", workspaceId: "w1" },
  { id: "m5", title: "AI 진단 킥오프", date: "2026-04-10", time: "11:00", duration: 120, participants: ["u1", "u4", "u8"], projectId: "p4", status: "scheduled", workspaceId: "w1" },
];

export const activities: Activity[] = [
  { id: "a1", userId: "u2", action: "작업 완료", target: "대시보드 UI 와이어프레임", targetType: "task", createdAt: "2026-04-06T09:30:00", workspaceId: "w1" },
  { id: "a2", userId: "u3", action: "작업 상태 변경", target: "API 게이트웨이 설계", targetType: "task", createdAt: "2026-04-06T08:45:00", workspaceId: "w1" },
  { id: "a3", userId: "u7", action: "진행률 업데이트", target: "데이터 파이프라인 최적화", targetType: "task", createdAt: "2026-04-05T17:20:00", workspaceId: "w1" },
  { id: "a4", userId: "u1", action: "미팅 생성", target: "AI 진단 킥오프", targetType: "meeting", createdAt: "2026-04-05T14:00:00", workspaceId: "w1" },
  { id: "a5", userId: "u5", action: "이슈 보고", target: "논문 작성 마감 임박", targetType: "task", createdAt: "2026-04-05T11:30:00", workspaceId: "w1" },
  { id: "a6", userId: "u8", action: "보고서 작성", target: "AI 모델 학습 현황 보고", targetType: "report", createdAt: "2026-04-04T16:00:00", workspaceId: "w1" },
  { id: "a7", userId: "u4", action: "프로젝트 참여", target: "AI 진단 시스템", targetType: "project", createdAt: "2026-04-04T10:00:00", workspaceId: "w1" },
  { id: "a8", userId: "u6", action: "작업 생성", target: "프로토타입 시뮬레이션 환경 구축", targetType: "task", createdAt: "2026-04-03T15:30:00", workspaceId: "w1" },
];

export const reports: Report[] = [
  { id: "r1", title: "2026년 14주차 주간 보고", type: "weekly", authorId: "u1", createdAt: "2026-04-03", content: '{"sections":[{"title":"이번 주 완료 작업","content":"API 게이트웨이 설계 완료"},{"title":"진행 중인 작업","content":"대시보드 UI 구현"},{"title":"이슈 및 리스크","content":""},{"title":"다음 주 계획","content":"실시간 알림 시스템 개발"}]}', status: "distributed", submissions: { "u3": { content: '{"sections":[{"title":"이번 주 완료 작업","content":"캐시 레이어 구현 완료"},{"title":"진행 중인 작업","content":"API 최적화"},{"title":"이슈 및 리스크","content":"성능 이슈 발견"},{"title":"다음 주 계획","content":"성능 테스트"}]}', submittedAt: "2026-04-04T10:00:00", stage: "member" }, "u2": { content: '{"sections":[{"title":"이번 주 완료 작업","content":"UI 와이어프레임 완성"},{"title":"진행 중인 작업","content":"대시보드 컴포넌트 개발"},{"title":"이슈 및 리스크","content":""},{"title":"다음 주 계획","content":"모니터링 대시보드 완성"}]}', submittedAt: "2026-04-04T14:30:00", stage: "member" } }, workspaceId: "w1" },
  { id: "r2", title: "QSPEED 프로젝트 마감 보고", type: "custom", authorId: "u2", projectId: "p3", createdAt: "2026-04-01", content: '{"sections":[{"title":"내용","content":"QSPEED 프로젝트 최종 진행 현황"}]}', status: "closed", workspaceId: "w1" },
  { id: "r3", title: "AI 진단 시스템 월간 보고", type: "monthly", authorId: "u1", projectId: "p4", createdAt: "2026-03-31", content: '{"sections":[{"title":"주요 성과","content":""},{"title":"KPI 달성 현황","content":""},{"title":"이슈 및 리스크","content":""},{"title":"다음 달 계획","content":""}]}', status: "template", workspaceId: "w1" },
];

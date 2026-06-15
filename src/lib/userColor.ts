// 아바타 색 — 한 워크스페이스의 멤버끼리 색이 겹치거나 "비슷해" 보이지 않도록,
// 색상환에서 고르게 떨어진 색을 멤버 순서(정렬된 id 위치)대로 배정한다.
//
// 저장된 user.color 는 가입/초대 시 랜덤으로 뽑혀서, 비슷한 청록·초록
// (#06b6d4 / #10b981 / #14b8a6) 이 여러 명에게 중복 배정되던 문제가 있었다.
// 표시용 아바타 색은 이 함수로 계산해, 항상 서로 뚜렷이 구분되게 한다.

import { useAppStore } from "@/lib/store";

// 인접 인덱스끼리 최대한 대비되도록 배치한 팔레트 (비슷한 색은 서로 멀리 떨어뜨림).
const AVATAR_PALETTE = [
  "#6366f1", // indigo
  "#ef4444", // red
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#a855f7", // purple
  "#84cc16", // lime
  "#f97316", // orange
  "#3b82f6", // blue
  "#14b8a6", // teal
  "#eab308", // yellow
];

// userId 의 (정렬된) 위치로 색을 정한다 → 같은 멤버 집합에서 색이 절대 겹치지 않는다.
// allIds 를 안 주면 현재 워크스페이스 멤버 전체(store.users)를 기준으로 한다 → 팀 페이지·
// 사이드바·보고서 칩 등 "모든 곳"이 같은 기준을 써서 한 사람의 색이 어디서나 동일하다.
// (멤버 수가 팔레트 수(12)를 넘으면 순환한다.)
export function avatarColor(userId: string, allIds?: string[]): string {
  const ids = allIds ?? useAppStore.getState().users.map((u) => u.id);
  const idx = [...ids].sort().indexOf(userId);
  return AVATAR_PALETTE[(idx < 0 ? 0 : idx) % AVATAR_PALETTE.length];
}

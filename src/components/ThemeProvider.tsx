"use client";
import { useEffect } from "react";
import { useAppStore } from "@/lib/store";
import { auth, getToken } from "@/lib/api-client";

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useAppStore((s) => s.theme);
  const hydrated = useAppStore((s) => s._hydrated);
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const currentUser = useAppStore((s) => s.currentUser);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // On boot: if we have a JWT token, validate via /me and rehydrate from backend.
  // If the token is invalid / user gone, clear local auth state.
  useEffect(() => {
    if (!hydrated) return;
    const token = getToken();
    if (!token) {
      // no token but local state says authenticated → clear it (stale)
      if (isAuthenticated) {
        useAppStore.setState({ currentUser: null, isAuthenticated: false });
      }
      return;
    }
    // we have a token — validate it
    auth.me()
      .then(({ user }) => {
        useAppStore.setState((s) => ({
          currentUser: { ...user, role: s.currentUser?.role || "member" } as any,
          isAuthenticated: true,
        }));
        useAppStore.getState().hydrateFromServer();
      })
      .catch((e: any) => {
        // 토큰이 실제로 무효(401)일 때만 로그아웃한다.
        // 502·500·네트워크 등 일시적 오류는 세션을 유지하고(로컬 상태가 이미 복원됨) 데이터만 재시도.
        if (e?.status === 401) {
          useAppStore.getState().logout();
        } else {
          useAppStore.getState().hydrateFromServer();
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  // After workspace is selected, refresh members and reports
  const currentWorkspaceId = useAppStore((s) => s.currentWorkspaceId);
  useEffect(() => {
    if (!currentWorkspaceId || !currentUser) return;
    useAppStore.getState().selectWorkspaceAsync(currentWorkspaceId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWorkspaceId, currentUser?.id]);

  return <>{children}</>;
}

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAppStore } from "@/lib/store";
import { migration, getToken } from "@/lib/api-client";
import { Zap, ArrowRight, Database, Users, FileBarChart, FolderKanban, CheckCircle2, AlertTriangle } from "lucide-react";

interface OldPayload {
  users?: any[];
  workspaces?: any[];
  reports?: any[];
}

export default function MigratePage() {
  const router = useRouter();
  const { hydrateFromServer } = useAppStore();
  const [payload, setPayload] = useState<OldPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ users: number; workspaces: number; reports: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Read the project-flow-store from localStorage
    try {
      const raw = localStorage.getItem("project-flow-store");
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const state = parsed?.state || parsed;
      setPayload({
        users: state.users || [],
        workspaces: state.workspaces || [],
        reports: state.reports || [],
      });
    } catch (e) {
      console.error(e);
    }
  }, []);

  const userCount = payload?.users?.length || 0;
  const wsCount = payload?.workspaces?.length || 0;
  const reportCount = payload?.reports?.length || 0;

  async function runMigration() {
    if (!payload) return;
    if (!getToken()) {
      setError("로그인이 필요합니다.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await migration.push(payload);
      setResult(res.imported);
      // refresh state from server
      await hydrateFromServer();
    } catch (e: any) {
      setError(e?.message || "마이그레이션 실패");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6 py-12">
      <div className="max-w-2xl w-full">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-accent/20 mb-4">
            <Database className="w-8 h-8 text-accent" />
          </div>
          <h1 className="text-[28px] font-bold text-white mb-2">데이터 마이그레이션</h1>
          <p className="text-[15px] text-muted-foreground">
            브라우저에 저장된 데이터를 백엔드 데이터베이스로 옮깁니다.
          </p>
        </div>

        <div className="glass rounded-2xl p-8 space-y-6">
          {!payload && (
            <div className="text-center text-muted-foreground py-4 text-[14px]">
              localStorage 데이터를 읽는 중…
            </div>
          )}

          {payload && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <Stat icon={<Users className="w-5 h-5 text-info" />} label="사용자" count={userCount} />
                <Stat icon={<FolderKanban className="w-5 h-5 text-warning" />} label="워크스페이스" count={wsCount} />
                <Stat icon={<FileBarChart className="w-5 h-5 text-accent" />} label="보고서" count={reportCount} />
              </div>

              <div className="bg-warning/10 border border-warning/30 rounded-xl p-4 flex gap-3 items-start">
                <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
                <div className="text-[13px] text-foreground leading-relaxed">
                  <p>이 작업은 현재 브라우저의 localStorage 데이터를 백엔드에 업로드합니다.</p>
                  <ul className="mt-2 ml-4 list-disc text-muted-foreground space-y-1">
                    <li>사용자는 이메일 기준으로 매칭됩니다. 새로 만들어지는 계정은 임시 비밀번호가 발급되며, 로그인하려면 비밀번호 재설정이 필요합니다.</li>
                    <li>워크스페이스는 새 ID로 생성됩니다 (기존 ID는 매핑됨).</li>
                    <li>현재 로그인한 사용자가 모든 워크스페이스의 admin으로 추가됩니다.</li>
                    <li>중복 실행 시 같은 데이터가 다시 만들어질 수 있으니 한 번만 실행하세요.</li>
                  </ul>
                </div>
              </div>

              {result && (
                <div className="bg-success/10 border border-success/30 rounded-xl p-4 flex gap-3 items-start">
                  <CheckCircle2 className="w-5 h-5 text-success flex-shrink-0 mt-0.5" />
                  <div className="text-[13px] text-foreground">
                    <p className="font-semibold mb-1">마이그레이션 완료</p>
                    <p className="text-muted-foreground">
                      사용자 {result.users}명, 워크스페이스 {result.workspaces}개, 보고서 {result.reports}건이 백엔드에 저장되었습니다.
                    </p>
                  </div>
                </div>
              )}

              {error && (
                <div className="bg-danger/10 border border-danger/30 rounded-xl p-4 flex gap-3 items-start">
                  <AlertTriangle className="w-5 h-5 text-danger flex-shrink-0 mt-0.5" />
                  <p className="text-[13px] text-danger">{error}</p>
                </div>
              )}

              <div className="flex justify-between items-center pt-2">
                <Link href="/workspace" className="text-[13px] text-muted-foreground hover:text-foreground transition-colors">
                  돌아가기
                </Link>
                {result ? (
                  <button
                    onClick={() => router.push("/workspace")}
                    className="px-6 py-2.5 bg-accent hover:bg-accent-hover rounded-xl text-white text-[14px] font-semibold flex items-center gap-2 transition-all"
                  >
                    워크스페이스로 이동 <ArrowRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    onClick={runMigration}
                    disabled={busy || !payload || (userCount === 0 && wsCount === 0 && reportCount === 0)}
                    className="px-6 py-2.5 bg-accent hover:bg-accent-hover disabled:opacity-50 rounded-xl text-white text-[14px] font-semibold flex items-center gap-2 transition-all"
                  >
                    {busy ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        업로드 중…
                      </>
                    ) : (
                      <>
                        <Zap className="w-4 h-4" />
                        백엔드로 마이그레이션
                      </>
                    )}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ icon, label, count }: { icon: React.ReactNode; label: string; count: number }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 text-center">
      <div className="flex justify-center mb-2">{icon}</div>
      <p className="text-3xl font-bold text-white">{count}</p>
      <p className="text-[12px] text-muted-foreground mt-1">{label}</p>
    </div>
  );
}

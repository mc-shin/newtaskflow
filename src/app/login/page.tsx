"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/lib/store";
import { Zap, Mail, Lock, ArrowRight } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAppStore();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const ok = await login(email, password);
    if (ok) {
      router.push("/workspace");
    } else {
      setError("이메일 또는 비밀번호가 올바르지 않습니다.");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden animate-fade-in">
      {/* Background effects */}
      <div className="absolute inset-0">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-accent/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md mx-4">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-accent/20 mb-4">
            <Zap className="w-8 h-8 text-accent" />
          </div>
          <h1 className="text-[28px] font-bold text-white mb-2">ProjectFlow</h1>
          <p className="text-[15px] text-muted-foreground">프로젝트 관리 시스템에 로그인하세요</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="glass rounded-2xl p-8 space-y-6">
          <div className="space-y-2">
            <label className="text-[14px] font-medium text-foreground">이메일</label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="이메일을 입력하세요"
                className="w-full pl-10 pr-4 py-3 bg-input rounded-xl text-[14px] text-foreground placeholder:text-muted outline-none border border-border focus:border-accent transition-colors"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[14px] font-medium text-foreground">비밀번호</label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="비밀번호를 입력하세요"
                className="w-full pl-10 pr-4 py-3 bg-input rounded-xl text-[14px] text-foreground placeholder:text-muted outline-none border border-border focus:border-accent transition-colors"
                required
              />
            </div>
          </div>

          {error && (
            <div className="bg-danger/10 border border-danger/20 rounded-xl px-4 py-3 text-[14px] text-danger">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-accent hover:bg-accent-hover disabled:opacity-50 rounded-xl text-white text-[14px] font-semibold flex items-center justify-center gap-2 transition-all duration-200"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                로그인
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          <p className="text-center text-[14px] text-muted-foreground">
            계정이 없으신가요?{" "}
            <a href="/register" className="text-accent hover:text-accent-hover transition-colors font-medium">
              회원가입
            </a>
          </p>
        </form>
      </div>
    </div>
  );
}

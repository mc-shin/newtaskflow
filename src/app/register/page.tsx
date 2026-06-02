"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/lib/store";
import { Zap, Mail, Lock, ArrowRight, User, Eye, EyeOff } from "lucide-react";

const COLORS = ["#6366f1", "#8b5cf6", "#06b6d4", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#14b8a6"];

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showPwConfirm, setShowPwConfirm] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const { signup } = useAppStore();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!name.trim()) { setError("이름을 입력해주세요."); return; }
    if (!email.trim()) { setError("이메일을 입력해주세요."); return; }
    if (!email.includes("@")) { setError("올바른 이메일 형식을 입력해주세요."); return; }
    if (password.length < 6) { setError("비밀번호는 6자 이상이어야 합니다."); return; }
    if (password !== passwordConfirm) { setError("비밀번호가 일치하지 않습니다."); return; }

    setLoading(true);
    const ok = await signup(email.trim().toLowerCase(), password, name.trim());
    if (!ok) {
      setError("회원가입에 실패했습니다. 이미 가입된 이메일일 수 있어요.");
      setLoading(false);
      return;
    }
    router.push("/workspace");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden">
      <div className="absolute inset-0">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-accent/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md mx-4">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-accent/20 mb-4">
            <Zap className="w-8 h-8 text-accent" />
          </div>
          <h1 className="text-[28px] font-bold text-white mb-2">회원가입</h1>
          <p className="text-[15px] text-muted-foreground">ProjectFlow에 참여하세요</p>
        </div>

        <form onSubmit={handleSubmit} className="glass rounded-2xl p-8 space-y-5">
          <div className="space-y-1.5">
            <label className="text-[14px] font-medium text-foreground">이름</label>
            <div className="relative">
              <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="이름을 입력하세요"
                className="w-full pl-10 pr-4 py-3 bg-input rounded-xl text-[14px] text-foreground placeholder:text-muted outline-none border border-border focus:border-accent transition-colors"
              />
            </div>
          </div>

          <div className="space-y-1.5">
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

          <div className="space-y-1.5">
            <label className="text-[14px] font-medium text-foreground">비밀번호</label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
              <input
                type={showPw ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="6자 이상"
                className="w-full pl-10 pr-10 py-3 bg-input rounded-xl text-[14px] text-foreground placeholder:text-muted outline-none border border-border focus:border-accent transition-colors"
                required
              />
              <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted hover:text-foreground transition-colors">
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {password && password.length < 6 && (
              <p className="text-[12px] text-warning">6자 이상 입력해주세요</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-[14px] font-medium text-foreground">비밀번호 확인</label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
              <input
                type={showPwConfirm ? "text" : "password"}
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                placeholder="비밀번호를 다시 입력하세요"
                className="w-full pl-10 pr-10 py-3 bg-input rounded-xl text-[14px] text-foreground placeholder:text-muted outline-none border border-border focus:border-accent transition-colors"
                required
              />
              <button type="button" onClick={() => setShowPwConfirm(!showPwConfirm)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted hover:text-foreground transition-colors">
                {showPwConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {passwordConfirm && password !== passwordConfirm && (
              <p className="text-[12px] text-danger">비밀번호가 일치하지 않습니다</p>
            )}
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
                가입하기
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          <p className="text-center text-[14px] text-muted-foreground">
            이미 계정이 있으신가요?{" "}
            <a href="/login" className="text-accent hover:text-accent-hover transition-colors font-medium">
              로그인
            </a>
          </p>
        </form>
      </div>
    </div>
  );
}

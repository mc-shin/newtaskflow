"use client";

import Link from "next/link";
import {
  Zap,
  FileBarChart,
  Users,
  Layers,
  ArrowRight,
  CheckCircle2,
  Sparkles,
} from "lucide-react";

const features = [
  { icon: FileBarChart, title: "섹션 기반 작성", desc: "이번 주 완료 · 진행 중 · 이슈 · 다음 주 계획" },
  { icon: Users, title: "역할 기반 협업", desc: "팀원 → 중간관리자 → 최종관리자 흐름" },
  { icon: Layers, title: "워크스페이스 단위", desc: "초대된 멤버만 접근하는 안전한 공간" },
];

const highlights = [
  "주간보고 양식 자동 배포 / 취합 / 마감",
  "팀원별 작성 현황 실시간 확인",
  "워드(.docx) 업로드·다운로드 지원",
  "표·서식이 유지되는 리치 텍스트 편집",
  "단계별 자동 취합으로 중복 작업 제거",
  "워크스페이스별 멤버 초대 / 권한 관리",
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground animate-fade-in">
      {/* Nav */}
      <nav className="fixed top-0 w-full z-50 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-[1600px] mx-auto px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-accent flex items-center justify-center">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-[18px] text-white">WeeklyFlow</span>
          </div>
          <Link
            href="/login"
            className="rounded-xl px-5 py-2.5 text-[14px] bg-accent hover:bg-accent-hover text-white font-medium transition-all"
          >
            시작하기
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-40 pb-24 px-8 relative overflow-hidden">
        <div className="absolute top-20 left-1/3 w-[600px] h-[600px] bg-accent/8 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-purple-500/8 rounded-full blur-3xl" />

        <div className="max-w-[1600px] mx-auto text-center relative">
          <div className="inline-flex items-center gap-2 px-5 py-2 bg-accent-muted rounded-full text-accent text-[14px] font-medium mb-10">
            <Sparkles className="w-4 h-4" />
            팀의 주간보고, 더 똑똑하게
          </div>

          <h1 className="text-6xl md:text-7xl font-bold text-white mb-8 leading-tight">
            매주 반복되는 주간보고
            <br />
            <span className="bg-gradient-to-r from-accent to-purple-400 bg-clip-text text-transparent">
              한 곳에서 끝내세요
            </span>
          </h1>

          <p className="text-[18px] text-muted-foreground max-w-2xl mx-auto mb-12 leading-relaxed">
            팀원이 작성하고, 중간관리자가 취합하고, 최종관리자가 검토하는 모든 과정을
            <br />
            워크스페이스 하나로 단순화합니다.
          </p>

          <div className="flex items-center justify-center gap-4">
            <Link
              href="/login"
              className="rounded-xl px-8 py-3.5 text-[16px] bg-accent hover:bg-accent-hover text-white font-semibold flex items-center gap-2 transition-all shadow-lg shadow-accent/25"
            >
              지금 시작하기
              <ArrowRight className="w-5 h-5" />
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-24 px-8">
        <div className="max-w-[1600px] mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-[32px] font-bold text-white mb-4">핵심 기능</h2>
            <p className="text-[15px] text-muted-foreground">주간보고를 위해 필요한 모든 것</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {features.map((f, i) => (
              <div
                key={i}
                className="gradient-border rounded-2xl p-7 hover:scale-[1.02] transition-all duration-300"
              >
                <div className="w-12 h-12 rounded-xl bg-accent-muted flex items-center justify-center mb-4">
                  <f.icon className="w-6 h-6 text-accent" />
                </div>
                <h3 className="text-[18px] font-semibold text-white mb-2">{f.title}</h3>
                <p className="text-[14px] text-muted-foreground leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Highlights */}
      <section className="py-24 px-8 border-t border-border">
        <div className="max-w-[1600px] mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-[32px] font-bold text-white mb-4">주요 특징</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {highlights.map((h, i) => (
              <div key={i} className="flex items-center gap-3 p-5 rounded-2xl bg-card border border-border">
                <CheckCircle2 className="w-5 h-5 text-success flex-shrink-0" />
                <span className="text-[14px] text-foreground">{h}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8 px-8">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-accent" />
            <span className="text-[14px] text-muted-foreground">WeeklyFlow</span>
          </div>
          <p className="text-[14px] text-muted">&copy; 2026 WeeklyFlow. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

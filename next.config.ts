import type { NextConfig } from "next";
import path from "node:path";

// 백엔드(Express, HTTP) 주소.
// - 운영(Vercel, NODE_ENV=production): 사내 서버
// - 개발(next dev): 로컬 백엔드
// 필요하면 BACKEND_ORIGIN 환경변수로 덮어쓸 수 있다.
const BACKEND_ORIGIN =
  process.env.BACKEND_ORIGIN ||
  (process.env.NODE_ENV === "production"
    ? "http://121.190.39.238:4000"
    : "http://localhost:4000");

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
  // 브라우저는 같은 출처(Vercel, HTTPS)의 /api/* 로 호출하고,
  // Next/Vercel 이 서버측에서 백엔드(HTTP)로 프록시한다.
  // → mixed content 회피 + 백엔드 인증서 불필요 (TaskFlow 와 동일 방식).
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${BACKEND_ORIGIN}/api/:path*` },
    ];
  },
};

export default nextConfig;

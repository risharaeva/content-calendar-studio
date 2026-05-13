import { Suspense } from "react";
import { LoginForm } from "@/app/login/login-form";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f5f0e8] px-4 text-slate-900">
      <Suspense fallback={<LoginFallback />}>
        <LoginForm />
      </Suspense>
    </main>
  );
}

function LoginFallback() {
  return (
    <div className="w-full max-w-sm border border-black/10 bg-[#fcfaf5] p-6 text-sm text-slate-600 shadow-[0_18px_60px_rgba(46,40,28,0.08)]">
      Loading workspace access...
    </div>
  );
}

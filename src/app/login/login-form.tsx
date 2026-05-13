"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ password }),
    });

    if (!response.ok) {
      setError("Password is incorrect.");
      setIsSubmitting(false);
      return;
    }

    router.replace(searchParams.get("next") || "/");
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="grid w-full max-w-sm gap-4 border border-black/10 bg-[#fcfaf5] p-6 shadow-[0_18px_60px_rgba(46,40,28,0.08)]"
    >
      <div>
        <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Content Calendar Studio</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">Enter workspace password</h1>
      </div>
      <label className="grid gap-2 text-sm text-slate-700">
        <span className="text-xs uppercase tracking-[0.2em] text-slate-500">Password</span>
        <input
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          type="password"
          autoFocus
          className="border border-black/10 bg-white/90 px-3 py-2 outline-none focus:border-slate-900"
        />
      </label>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <button
        disabled={isSubmitting}
        className="border border-slate-900 bg-slate-900 px-3 py-2 text-sm text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? "Checking..." : "Open workspace"}
      </button>
    </form>
  );
}

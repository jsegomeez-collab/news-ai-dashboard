"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Brand } from "@/components/AppShell";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Error");
        return;
      }
      router.replace("/");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rise w-full max-w-md rounded-card-lg border border-edge2/60 bg-panel p-8 shadow-neon-hi">
      <div className="mb-7">
        <Brand />
      </div>
      <div className="eyebrow mb-2">Acceso</div>
      <h1 className="title-glow text-3xl font-black tracking-[-0.03em] text-white">
        Entra en tu <span className="serif-accent text-brand2">panel</span>
      </h1>
      <p className="mb-6 mt-2 text-sm text-zinc-400">Noticias y competencia convertidas en guiones y vídeos con tu clon.</p>
      <form onSubmit={submit} className="space-y-3">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className="w-full rounded-xl border border-edge bg-ink p-3 text-sm text-zinc-100 outline-none"
        />
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Contraseña"
          className="w-full rounded-xl border border-edge bg-ink p-3 text-sm text-zinc-100 outline-none"
        />
        {error && <p className="text-sm text-live">{error}</p>}
        <button
          disabled={loading}
          className="w-full rounded-xl bg-brand py-3 text-sm font-extrabold uppercase tracking-wide text-white disabled:opacity-50"
        >
          {loading ? "Entrando…" : "Entrar"}
        </button>
      </form>
      <p className="mt-5 text-center text-sm text-zinc-500">
        ¿No tienes cuenta?{" "}
        <Link href="/register" className="font-semibold text-brand2 hover:underline">
          Crear cuenta
        </Link>
      </p>
    </div>
  );
}

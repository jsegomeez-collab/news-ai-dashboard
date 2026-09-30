"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Brand } from "@/components/AppShell";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
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
      <div className="eyebrow mb-2">Nueva cuenta</div>
      <h1 className="title-glow text-3xl font-black tracking-[-0.03em] text-white">
        Crea tu <span className="serif-accent text-brand2">cuenta</span>
      </h1>
      <p className="mb-6 mt-2 text-sm text-zinc-400">Cada cuenta es privada y usa tu propia clave de Anthropic.</p>
      <form onSubmit={submit} className="space-y-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nombre (opcional)"
          className="w-full rounded-xl border border-edge bg-ink p-3 text-sm text-zinc-100 outline-none"
        />
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
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Contraseña (mín. 8 caracteres)"
          className="w-full rounded-xl border border-edge bg-ink p-3 text-sm text-zinc-100 outline-none"
        />
        {error && <p className="text-sm text-live">{error}</p>}
        <button
          disabled={loading}
          className="w-full rounded-xl bg-brand py-3 text-sm font-extrabold uppercase tracking-wide text-white disabled:opacity-50"
        >
          {loading ? "Creando…" : "Crear cuenta"}
        </button>
      </form>
      <p className="mt-5 text-center text-sm text-zinc-500">
        ¿Ya tienes cuenta?{" "}
        <Link href="/login" className="font-semibold text-brand2 hover:underline">
          Entrar
        </Link>
      </p>
    </div>
  );
}

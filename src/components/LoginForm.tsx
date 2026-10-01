"use client";

import { useState } from "react";
import { api } from "@/lib/client/api";

export function LoginForm() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { role } = await api<{ role: "user" | "admin" }>("/api/auth/login", {
        method: "POST",
        json: { password },
      });
      window.location.href = role === "admin" ? "/admin" : "/galerie";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connexion impossible");
      setPassword("");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor="password" className="label">
          Mot de passe
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          className="input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoFocus
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <button type="submit" className="btn-primary w-full" disabled={busy || !password}>
        {busy ? "Connexion…" : "Se connecter"}
      </button>
    </form>
  );
}

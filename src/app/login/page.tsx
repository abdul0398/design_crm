"use client";
import { useState } from "react";
import { Layers3 } from "lucide-react";
export default function Login() {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <main className="login-page">
      <form
        className="login-card"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          const form = new FormData(e.currentTarget);
          try {
            const r = await fetch("/api/auth/login", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(Object.fromEntries(form)),
            });
            const data = await r.json();
            if (!r.ok) throw Error(data.error);
            window.location.assign("/");
          } catch (e) {
            setError((e as Error).message);
            setBusy(false);
          }
        }}
      >
        <span className="brandmark">
          <Layers3 size={22} />
        </span>
        <h1>Welcome to Launch</h1>
        <p>Sign in to your design desk.</p>
        <label>
          Email
          <input
            name="email"
            type="email"
            autoComplete="username"
            required
            maxLength={254}
          />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            maxLength={256}
          />
        </label>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <button className="primary" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}

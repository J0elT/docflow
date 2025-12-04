"use client";

import { FormEvent, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage(null);
    setError(null);
    setLoading(true);

    try {
      const supabase = supabaseBrowser();
      const { error: signInError } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo:
            typeof window !== "undefined"
              ? `${window.location.origin}/`
              : undefined,
        },
      });
      if (signInError) {
        throw signInError;
      }
      setMessage("Check your email for the magic link.");
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to send magic link.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="pit-page flex items-center justify-center">
      <form onSubmit={handleSubmit} className="pit-card w-full max-w-md">
        <h1 className="pit-title mb-2" style={{ fontSize: "28px" }}>
          Log in
        </h1>
        <p className="pit-subtitle mb-4">
          Enter your email to receive a magic link.
        </p>
        <label className="pit-label mb-2 block">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="pit-input mb-4"
          placeholder="you@example.com"
        />
        <button
          type="submit"
          disabled={loading}
          className="pit-cta pit-cta--primary w-full justify-center text-xs"
        >
          {loading ? "Sending..." : "Send magic link"}
        </button>
        {message && (
          <p
            className="mt-3 text-sm"
            style={{
              color: "#0f5132",
              background: "rgba(13,110,61,0.08)",
              border: "1px solid rgba(13,110,61,0.2)",
              borderRadius: "10px",
              padding: "10px 12px",
            }}
          >
            {message}
          </p>
        )}
        {error && <p className="mt-3 text-sm pit-error">{error}</p>}
      </form>
    </div>
  );
}

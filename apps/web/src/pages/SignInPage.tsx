import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";

export default function SignInPage() {
  const { session } = useAuth();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (session) return <Navigate to="/" replace />;

  async function sendMagicLink(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) setError(error.message);
    else setSent(true);
  }

  async function signInWithEntra() {
    setError(null);
    // Entra ID tenant registered in Supabase Auth as the Azure (OIDC) provider.
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "azure",
      options: {
        scopes: "openid profile email",
        redirectTo: window.location.origin,
      },
    });
    if (error) setError(error.message);
  }

  return (
    <div className="narrow">
      <div className="page-head">
        <h1>Sign in</h1>
        <p>Candidates use a magic link; employees use company single sign-on.</p>
      </div>

      <div className="stack">
        <section className="card">
          <h2>Candidates</h2>
          <p className="muted">
            We'll email you a magic link — no password needed.
          </p>
          {sent ? (
            <p>Check your inbox for the sign-in link.</p>
          ) : (
            <form onSubmit={sendMagicLink} className="stack" style={{ marginTop: "0.75rem" }}>
              <label>
                Email address
                <input
                  type="email"
                  required
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <button type="submit">Email me a magic link</button>
            </form>
          )}
        </section>

        <section className="card">
          <h2>Employees</h2>
          <p className="muted">
            Use your company account (single sign-on via Entra ID).
          </p>
          <button className="dark" style={{ marginTop: "0.75rem" }} onClick={signInWithEntra}>
            Sign in with company account
          </button>
        </section>

        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}

import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { Banner } from "../components/ui";
import { CheckIcon, LockIcon, MailIcon } from "../components/icons";

const POINTS = [
  "Browse open roles and apply with just your email and CV.",
  "Track every application through screening, interview and offer.",
  "Upload your onboarding documents securely once you are hired.",
];

export default function SignInPage() {
  const { session } = useAuth();
  const location = useLocation();
  const [params] = useSearchParams();
  const employeeFirst = params.get("as") === "employee";
  const from = (location.state as { from?: string } | null)?.from ?? "/";
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (session) return <Navigate to={from} replace />;

  // Only same-site paths are honoured as a return address.
  const returnTo = window.location.origin + (from.startsWith("/") ? from : "/");

  async function sendMagicLink(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const { error: err } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: returnTo },
    });
    setBusy(false);
    if (err) setError(err.message);
    else setSent(true);
  }

  async function signInWithEntra() {
    setError(null);
    // The Entra ID tenant is registered in Supabase Auth as the Azure (OIDC) provider.
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: "azure",
      options: { scopes: "openid profile email", redirectTo: returnTo },
    });
    if (err) setError(err.message);
  }

  const candidateCard = (
    <section className="card card-pad stack" aria-labelledby="cand-h" key="cand">
      <div className="stack-sm" style={{ gap: 4 }}>
        <h3 id="cand-h">I'm a candidate</h3>
        <p className="muted small">We'll email you a link. No password needed.</p>
      </div>
      {sent ? (
        <div className="stack-sm">
          <Banner tone="success" icon={<MailIcon />}>
            Check your inbox. We sent a sign-in link to <strong>{email}</strong>. It expires after a few minutes.
          </Banner>
          <button className="link" style={{ alignSelf: "flex-start" }} onClick={() => setSent(false)}>
            Use a different email
          </button>
        </div>
      ) : (
        <form onSubmit={sendMagicLink} className="stack">
          <label className="field">
            Email address
            <input
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <button type="submit" disabled={busy}>
            {busy ? "Sending…" : "Email me a magic link"}
          </button>
        </form>
      )}
    </section>
  );

  const employeeCard = (
    <section className="card card-pad stack" aria-labelledby="emp-h" key="emp">
      <div className="stack-sm" style={{ gap: 4 }}>
        <h3 id="emp-h">I'm an employee</h3>
        <p className="muted small">Use your company account (single sign-on).</p>
      </div>
      <button className="dark" onClick={signInWithEntra}>
        <LockIcon /> Sign in with company account
      </button>
    </section>
  );

  const cards = employeeFirst ? [employeeCard, candidateCard] : [candidateCard, employeeCard];

  return (
    <div className="auth">
      <section className="auth-aside">
        <span className="glow-blob" aria-hidden="true" />
        <h1>From application to first day, in one place.</h1>
        <ul className="auth-points">
          {POINTS.map((p) => (
            <li key={p}>
              <span className="tick">
                <CheckIcon />
              </span>
              {p}
            </li>
          ))}
        </ul>
      </section>

      <section className="auth-main">
        <div className="inner">
          <div className="stack-sm">
            <h2 style={{ fontSize: 30, lineHeight: "36px", fontWeight: 800 }}>Sign in</h2>
            <p className="muted">Candidates use a magic link. Employees use company single sign-on.</p>
          </div>
          {cards[0]}
          <div className="divider">or</div>
          {cards[1]}
          {error && (
            <p className="error-text" role="alert">
              {error}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

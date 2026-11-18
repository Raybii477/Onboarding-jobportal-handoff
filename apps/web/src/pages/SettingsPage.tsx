import { useAuth } from "../lib/auth";
import { useTheme, type ThemePreference } from "../lib/theme";
import { displayName } from "../lib/format";
import { Avatar } from "../components/ui";
import { MonitorIcon, MoonIcon, SunIcon } from "../components/icons";

const OPTIONS: { value: ThemePreference; label: string; Icon: typeof SunIcon }[] = [
  { value: "light", label: "Light", Icon: SunIcon },
  { value: "dark", label: "Dark", Icon: MoonIcon },
  { value: "system", label: "System", Icon: MonitorIcon },
];

function Swatch({ mode }: { mode: ThemePreference }) {
  const light = { side: "#0F172A", bg: "#F8FAFC", card: "#FFFFFF", bar: "#4F46E5", line: "#E2E8F0" };
  const dark = { side: "#05060B", bg: "#0B1120", card: "#111A2E", bar: "#6366F1", line: "#222C44" };
  if (mode === "system") {
    return (
      <span className="theme-swatch" aria-hidden="true">
        <span style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          <span className="side" style={{ background: light.side }} />
          <span className="main" style={{ background: light.bg }}>
            <span className="bar" style={{ background: light.bar, width: "70%" }} />
            <span className="bar" style={{ background: light.line }} />
          </span>
        </span>
        <span style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          <span className="main" style={{ background: dark.bg }}>
            <span className="bar" style={{ background: dark.bar, width: "70%" }} />
            <span className="bar" style={{ background: dark.line }} />
          </span>
        </span>
      </span>
    );
  }
  const c = mode === "dark" ? dark : light;
  return (
    <span className="theme-swatch" aria-hidden="true">
      <span className="side" style={{ background: c.side }} />
      <span className="main" style={{ background: c.bg }}>
        <span className="bar" style={{ background: c.bar, width: "60%" }} />
        <span className="bar" style={{ background: c.card, border: `1px solid ${c.line}`, height: 22 }} />
        <span className="bar" style={{ background: c.line, width: "80%" }} />
      </span>
    </span>
  );
}

export default function SettingsPage() {
  const { preference, setPreference } = useTheme();
  const { profile, isStaff } = useAuth();
  const who = displayName(profile);

  return (
    <div className={isStaff ? undefined : "container page"}>
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p>Preferences for this device{isStaff ? " and your workspace" : ""}.</p>
        </div>
      </div>

      <div className="stack">
        <section className="card settings-section" aria-labelledby="appearance-h">
          <div>
            <h2 id="appearance-h">Appearance</h2>
            <p className="muted">Choose how the workspace looks on this device.</p>
          </div>
          <div className="theme-options" role="group" aria-label="Theme">
            {OPTIONS.map(({ value, label, Icon }) => (
              <button
                key={value}
                className="theme-option"
                aria-pressed={preference === value}
                onClick={() => setPreference(value)}
              >
                <Swatch mode={value} />
                <span className="row" style={{ gap: 8 }}>
                  <Icon style={{ width: 16, height: 16 }} />
                  {label}
                </span>
              </button>
            ))}
          </div>
          <p className="muted small">
            System follows your device's light or dark setting and switches with it.
          </p>
        </section>

        <section className="card settings-section" aria-labelledby="account-h">
          <h2 id="account-h">Account</h2>
          <div className="row">
            <Avatar name={who} size="lg" />
            <div>
              <strong>{who}</strong>
              <div className="muted small">
                {profile?.email} · <span style={{ textTransform: "capitalize" }}>{profile?.role}</span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

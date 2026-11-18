import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type ThemePreference = "light" | "dark" | "system";

const STORAGE_KEY = "theme";

function readPreference(): ThemePreference {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    // Private windows and blocked storage fall back to the system theme.
  }
  return "system";
}

const darkQuery = () => window.matchMedia("(prefers-color-scheme: dark)");

function resolve(pref: ThemePreference): "light" | "dark" {
  if (pref === "system") return darkQuery().matches ? "dark" : "light";
  return pref;
}

interface ThemeState {
  preference: ThemePreference;
  resolved: "light" | "dark";
  setPreference: (p: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeState>({
  preference: "system",
  resolved: "light",
  setPreference: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPref] = useState<ThemePreference>(readPreference);
  const [resolved, setResolved] = useState<"light" | "dark">(() => resolve(readPreference()));

  useEffect(() => {
    const apply = () => {
      const r = resolve(preference);
      setResolved(r);
      document.documentElement.setAttribute("data-theme", r);
    };
    apply();
    if (preference !== "system") return;
    // Follow the OS while the preference is "system".
    const q = darkQuery();
    q.addEventListener("change", apply);
    return () => q.removeEventListener("change", apply);
  }, [preference]);

  function setPreference(p: ThemePreference) {
    setPref(p);
    try {
      localStorage.setItem(STORAGE_KEY, p);
    } catch {
      // Not persisted; still applies for this visit.
    }
  }

  return (
    <ThemeContext.Provider value={{ preference, resolved, setPreference }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);

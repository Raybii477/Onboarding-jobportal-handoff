import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";
import {
  BriefcaseIcon,
  ClipboardIcon,
  KanbanIcon,
  LogoutIcon,
} from "./icons";

const ADMIN_ROUTES = ["/pipeline", "/review", "/postings"];

function initials(nameOrEmail: string) {
  const parts = nameOrEmail.trim().split(/\s+/);
  if (parts.length >= 2) return parts[0][0] + parts[1][0];
  return nameOrEmail.slice(0, 2);
}

function AdminShell() {
  const { profile, signOut } = useAuth();
  const who = profile?.full_name || profile?.email || "";

  return (
    <div className="admin-shell">
      <aside className="sidebar">
        <Link to="/" className="sidebar-brand">
          <span className="logo-mark">C</span>
          <span>
            <span className="brand-name">Careers & Onboarding</span>
            <br />
            <span className="brand-sub">Admin Workspace</span>
          </span>
        </Link>
        <nav>
          <NavLink to="/pipeline">
            <KanbanIcon /> Pipeline
          </NavLink>
          <NavLink to="/review">
            <ClipboardIcon /> Onboarding
          </NavLink>
          <NavLink to="/postings">
            <BriefcaseIcon /> Jobs
          </NavLink>
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-user">
            <span className="avatar">{initials(who)}</span>
            <span className="who">
              <strong>{who}</strong>
              <span>{profile?.role}</span>
            </span>
          </div>
          <button className="link" onClick={signOut}>
            <LogoutIcon /> Log out
          </button>
        </div>
      </aside>
      <main className="admin-main">
        <Outlet />
      </main>
    </div>
  );
}

function PublicShell() {
  const { session, profile, isStaff, signOut } = useAuth();

  return (
    <div className="shell">
      <header className="topbar">
        <Link to="/" className="brand">
          Careers & Onboarding
        </Link>
        <nav>
          <NavLink to="/" end>
            Find Jobs
          </NavLink>
          {session && <NavLink to="/applications">My Applications</NavLink>}
          {session && <NavLink to="/onboarding">My Onboarding</NavLink>}
          {isStaff && <NavLink to="/pipeline">Admin Workspace</NavLink>}
        </nav>
        <div className="topbar-user">
          {session ? (
            <>
              <span className="muted">{profile?.full_name || profile?.email}</span>
              <button className="outline" onClick={signOut}>
                Sign out
              </button>
            </>
          ) : (
            <Link to="/signin" className="btn dark">
              Sign In
            </Link>
          )}
        </div>
      </header>
      <main className="content">
        <Outlet />
      </main>
      <footer className="footer">
        © {new Date().getFullYear()} Careers & Onboarding — recruitment and
        new-hire document vetting.
      </footer>
    </div>
  );
}

export default function Layout() {
  const { pathname } = useLocation();
  const { isStaff } = useAuth();
  const adminArea =
    isStaff && ADMIN_ROUTES.some((r) => pathname.startsWith(r));
  return adminArea ? <AdminShell /> : <PublicShell />;
}

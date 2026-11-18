import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { displayName } from "../lib/format";
import { NotificationBell, Toasts } from "./Notifications";
import { Avatar, BrandMark } from "./ui";
import {
  BriefcaseIcon,
  ClipboardIcon,
  DocIcon,
  KanbanIcon,
  LogoutIcon,
  MenuIcon,
  SettingsIcon,
  UserIcon,
  XIcon,
} from "./icons";

const ADMIN_ROUTES = ["/pipeline", "/review", "/postings", "/settings"];

function AdminShell() {
  const { profile, isAdmin, signOut } = useAuth();
  const [navOpen, setNavOpen] = useState(false);
  const { pathname } = useLocation();
  const who = displayName(profile);

  // Close the phone menu whenever the route changes.
  useEffect(() => setNavOpen(false), [pathname]);

  return (
    <div className="admin">
      <aside className={`sidebar${navOpen ? " open" : ""}`}>
        <div>
          <div className="sidebar-top">
            <Link to="/pipeline" className="brand">
              <BrandMark />
              <span>
                <span className="brand-name">Careers &amp; Onboarding</span>
                <span className="brand-sub">Admin workspace</span>
              </span>
            </Link>
            <button
              className="icon-btn mobile-nav-toggle"
              aria-label={navOpen ? "Close menu" : "Open menu"}
              aria-expanded={navOpen}
              onClick={() => setNavOpen((o) => !o)}
            >
              {navOpen ? <XIcon /> : <MenuIcon />}
            </button>
          </div>
          <nav aria-label="Admin">
            <NavLink to="/pipeline">
              <KanbanIcon /> Pipeline
            </NavLink>
            <NavLink to="/review">
              <ClipboardIcon /> Onboarding
            </NavLink>
            {isAdmin && (
              <NavLink to="/postings">
                <BriefcaseIcon /> Jobs
              </NavLink>
            )}
            <NavLink to="/settings">
              <SettingsIcon /> Settings
            </NavLink>
          </nav>
        </div>
        <div className="sidebar-foot">
          <div className="row">
            <Avatar name={who} />
            <span className="who grow">
              <strong className="truncate">{who}</strong>
              <span>{profile?.role}</span>
            </span>
          </div>
          <Link to="/" style={{ color: "var(--on-navy-muted)", fontSize: 14, textDecoration: "none" }}>
            View job board
          </Link>
          <button className="link" onClick={() => void signOut()}>
            <LogoutIcon /> Log out
          </button>
        </div>
      </aside>
      <div className="admin-body">
        <div className="admin-topbar">
          <NotificationBell />
        </div>
        <main className="admin-main" id="main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function PublicShell() {
  const { session, profile, isStaff, signOut } = useAuth();
  const who = displayName(profile);

  return (
    <div className="site">
      <header className="site-header">
        <Link to="/" className="brand">
          <BrandMark />
          <span className="brand-name">Careers &amp; Onboarding</span>
        </Link>
        <nav className="site-nav" aria-label="Main">
          <NavLink to="/" end>
            Find jobs
          </NavLink>
          {session && <NavLink to="/applications">My applications</NavLink>}
          {session && <NavLink to="/onboarding">My onboarding</NavLink>}
          {isStaff && <NavLink to="/pipeline">Admin workspace</NavLink>}
        </nav>
        <div className="site-user">
          {session ? (
            <>
              <NotificationBell />
              <Avatar name={who} />
              <span className="who">{who}</span>
              <button className="secondary sm signout" onClick={() => void signOut()}>
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link to="/signin?as=employee" className="btn ghost signout">
                Employee sign in
              </Link>
              <Link to="/signin" className="btn dark">
                Sign in
              </Link>
            </>
          )}
        </div>
      </header>

      <main className="site-main" id="main">
        <Outlet />
      </main>

      <footer className="site-footer">
        <span>© {new Date().getFullYear()} Careers &amp; Onboarding</span>
        <span>Recruitment and new-hire document vetting</span>
      </footer>

      <nav className="tabbar" aria-label="Main">
        <NavLink to="/" end>
          <BriefcaseIcon />
          Jobs
        </NavLink>
        <NavLink to={session ? "/applications" : "/signin"}>
          <DocIcon />
          Applications
        </NavLink>
        <NavLink to={session ? "/onboarding" : "/signin"}>
          <ClipboardIcon />
          Onboarding
        </NavLink>
        <NavLink to={session ? "/settings" : "/signin"}>
          <UserIcon />
          Account
        </NavLink>
      </nav>
    </div>
  );
}

export default function Layout() {
  const { pathname } = useLocation();
  const { isStaff } = useAuth();
  const adminArea = isStaff && ADMIN_ROUTES.some((r) => pathname.startsWith(r));
  return (
    <>
      {adminArea ? <AdminShell /> : <PublicShell />}
      <Toasts />
    </>
  );
}

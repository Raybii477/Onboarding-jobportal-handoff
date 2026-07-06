import { Link, NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../lib/auth";

export default function Layout() {
  const { session, profile, isStaff, isAdmin, signOut } = useAuth();

  return (
    <div className="shell">
      <header className="topbar">
        <Link to="/" className="brand">
          Careers & Onboarding
        </Link>
        <nav>
          <NavLink to="/">Jobs</NavLink>
          {session && <NavLink to="/applications">My applications</NavLink>}
          {session && <NavLink to="/onboarding">My onboarding</NavLink>}
          {isStaff && <NavLink to="/pipeline">Pipeline</NavLink>}
          {isStaff && <NavLink to="/review">Document review</NavLink>}
          {isAdmin && <NavLink to="/postings">Manage postings</NavLink>}
        </nav>
        <div className="topbar-user">
          {session ? (
            <>
              <span className="muted">
                {profile?.full_name || profile?.email}
                {profile && ` (${profile.role})`}
              </span>
              <button className="link" onClick={signOut}>
                Sign out
              </button>
            </>
          ) : (
            <NavLink to="/signin">Sign in</NavLink>
          )}
        </div>
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}

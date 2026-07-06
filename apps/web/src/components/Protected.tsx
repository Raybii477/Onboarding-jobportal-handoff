import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../lib/auth";

export default function Protected({
  children,
  staff = false,
  admin = false,
}: {
  children: ReactNode;
  staff?: boolean;
  admin?: boolean;
}) {
  const { session, loading, isStaff, isAdmin } = useAuth();

  if (loading) return <p className="muted">Loading…</p>;
  if (!session) return <Navigate to="/signin" replace />;
  if (admin && !isAdmin) return <p>You need admin access for this page.</p>;
  if (staff && !isStaff) return <p>You need reviewer or admin access for this page.</p>;
  return <>{children}</>;
}

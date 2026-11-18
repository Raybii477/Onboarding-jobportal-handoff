import type { ReactNode } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { EmptyState, SkeletonRows } from "./ui";
import { LockIcon } from "./icons";

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
  const location = useLocation();

  if (loading)
    return (
      <div className="container page">
        <SkeletonRows rows={3} />
      </div>
    );
  if (!session) return <Navigate to="/signin" replace state={{ from: location.pathname }} />;
  if ((admin && !isAdmin) || (staff && !isStaff))
    return (
      <div className="container page">
        <EmptyState
          icon={<LockIcon />}
          title={admin ? "Admins only" : "Staff only"}
          action={
            <Link to="/" className="btn secondary">
              Back to the job board
            </Link>
          }
        >
          {admin
            ? "This page is for HR admins. Ask an admin if you need access."
            : "This page is for reviewers and admins."}
        </EmptyState>
      </div>
    );
  return <>{children}</>;
}

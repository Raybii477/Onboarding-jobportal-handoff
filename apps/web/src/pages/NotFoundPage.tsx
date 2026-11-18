import { Link } from "react-router-dom";
import { EmptyState } from "../components/ui";
import { SearchIcon } from "../components/icons";

export default function NotFoundPage() {
  return (
    <div className="container page">
      <EmptyState
        icon={<SearchIcon />}
        title="That page doesn't exist"
        action={
          <Link to="/" className="btn">
            Browse open roles
          </Link>
        }
      >
        The link may be old, or the page may have moved.
      </EmptyState>
    </div>
  );
}

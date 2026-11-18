import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./lib/auth";
import { ThemeProvider } from "./lib/theme";
import { NotificationsProvider } from "./lib/notifications";
import Layout from "./components/Layout";
import Protected from "./components/Protected";
import JobsPage from "./pages/JobsPage";
import JobDetailPage from "./pages/JobDetailPage";
import SignInPage from "./pages/SignInPage";
import MyApplicationsPage from "./pages/MyApplicationsPage";
import OnboardingPage from "./pages/OnboardingPage";
import ReviewPage from "./pages/ReviewPage";
import SettingsPage from "./pages/SettingsPage";
import NotFoundPage from "./pages/NotFoundPage";
import PipelinePage from "./pages/admin/PipelinePage";
import PostingsPage from "./pages/admin/PostingsPage";

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <NotificationsProvider>
          <BrowserRouter>
            <Routes>
              <Route element={<Layout />}>
                <Route index element={<JobsPage />} />
                <Route path="jobs/:id" element={<JobDetailPage />} />
                <Route path="signin" element={<SignInPage />} />
                <Route
                  path="applications"
                  element={
                    <Protected>
                      <MyApplicationsPage />
                    </Protected>
                  }
                />
                <Route
                  path="onboarding"
                  element={
                    <Protected>
                      <OnboardingPage />
                    </Protected>
                  }
                />
                <Route
                  path="settings"
                  element={
                    <Protected>
                      <SettingsPage />
                    </Protected>
                  }
                />
                <Route
                  path="pipeline"
                  element={
                    <Protected staff>
                      <PipelinePage />
                    </Protected>
                  }
                />
                <Route
                  path="review"
                  element={
                    <Protected staff>
                      <ReviewPage />
                    </Protected>
                  }
                />
                <Route
                  path="postings"
                  element={
                    <Protected admin>
                      <PostingsPage />
                    </Protected>
                  }
                />
                <Route path="*" element={<NotFoundPage />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </NotificationsProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

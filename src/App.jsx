import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter as Router, Route, Routes, useLocation } from "react-router-dom";
import { lazy, Suspense } from "react";
import { queryClientInstance } from "@/lib/query-client";
import { AuthProvider, useAuth } from "@/lib/AuthContext";
import { useBakery } from "@/lib/data";
import { Spinner } from "@/components/ui";

const Today = lazy(() => import("./pages/Today"));
const Requests = lazy(() => import("./pages/Requests"));
const OrderDetail = lazy(() => import("./pages/OrderDetail"));
const Calendar = lazy(() => import("./pages/Calendar"));
const Earnings = lazy(() => import("./pages/Earnings"));
const Settings = lazy(() => import("./pages/Settings"));
const Menu = lazy(() => import("./pages/Menu"));
const Setup = lazy(() => import("./pages/Setup"));
const Admin = lazy(() => import("./pages/Admin"));
const ShopForm = lazy(() => import("./pages/public/ShopForm"));
const OrderStatus = lazy(() => import("./pages/public/OrderStatus"));

// The baker side needs an account and a shop; customers' pages need neither.
function BakerApp() {
  const { isLoadingAuth, isLoadingPublicSettings, isAuthenticated, navigateToLogin } = useAuth();
  const bakery = useBakery({ enabled: isAuthenticated });
  const { pathname } = useLocation();

  if (isLoadingAuth || isLoadingPublicSettings) return <Spinner />;
  if (!isAuthenticated) {
    navigateToLogin();
    return null;
  }
  // Admins don't need a shop of their own; the function checks the role.
  if (pathname.startsWith("/admin")) return <Admin />;
  if (bakery.isLoading) return <Spinner />;
  if (!bakery.data) return <Setup />;

  return (
    <Routes>
      <Route path="/" element={<Today />} />
      <Route path="/requests" element={<Requests />} />
      <Route path="/orders/:id" element={<OrderDetail />} />
      <Route path="/calendar" element={<Calendar />} />
      <Route path="/earnings" element={<Earnings />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="/settings/menu" element={<Menu />} />
      <Route path="*" element={<Today />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <Suspense fallback={<Spinner />}>
            <Routes>
              <Route path="/b/:slug" element={<ShopForm />} />
              <Route path="/o/:token" element={<OrderStatus />} />
              <Route path="/*" element={<BakerApp />} />
            </Routes>
          </Suspense>
        </Router>
      </QueryClientProvider>
    </AuthProvider>
  );
}

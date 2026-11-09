import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { lazy, Suspense, useEffect } from "react";
import { CartProvider } from "@/contexts/CartContext";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import SuperAdminRoute from "@/components/SuperAdminRoute";
import { ScrollToTop } from "@/components/ScrollToTop";
import AuthRedirectHandler from "@/components/AuthRedirectHandler";
const Restaurant = lazy(() => import("./pages/client/Restaurant"));
const Cart = lazy(() => import("./pages/client/Cart"));
const MyOrders = lazy(() => import("./pages/client/MyOrders"));
const OrderTracking = lazy(() => import("./pages/client/OrderTracking"));
const AdminDashboard = lazy(() => import("./pages/admin/Dashboard"));
const SuperAdminDashboard = lazy(() => import("./pages/admin/SuperAdminDashboard"));
const AdminLogin = lazy(() => import("./pages/admin/Login"));
const MenuManager = lazy(() => import("./pages/admin/MenuManager"));
const DriversManager = lazy(() => import("./pages/admin/DriversManager"));
const DriverHistory = lazy(() => import("./pages/admin/DriverHistory"));
const SuperAdminAlerts = lazy(() => import("./pages/admin/SuperAdminAlerts"));
const RestaurantSettings = lazy(() => import("./pages/admin/RestaurantSettings"));
const OrderDetail = lazy(() => import("./pages/admin/OrderDetail"));
const OrdersRecap = lazy(() => import("./pages/admin/OrdersRecap"));
const POS = lazy(() => import("./pages/admin/POS"));
import QrModePopup from "./components/client/QrModePopup";
const DeliveryList = lazy(() => import("./pages/delivery/DeliveryList"));
const ActiveDelivery = lazy(() => import("./pages/delivery/ActiveDelivery"));
const StaffWorkspace = lazy(() => import("./pages/delivery/StaffWorkspace"));
const AuthSignup = lazy(() => import("./pages/auth/Signup"));
const AuthLogin = lazy(() => import("./pages/auth/Login"));
const AuthCallback = lazy(() => import("./pages/auth/Callback"));
const CompleteProfile = lazy(() => import("./pages/auth/CompleteProfile"));
const ForgotPassword = lazy(() => import("./pages/auth/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/auth/ResetPassword"));
const Account = lazy(() => import("./pages/client/Account"));
const Legal = lazy(() => import("./pages/client/Legal"));
const Support = lazy(() => import("./pages/client/Support"));
import NotFound from "./pages/NotFound";
const TableEntry = lazy(() => import("./pages/client/TableEntry"));
const TableService = lazy(() => import("./pages/admin/TableService"));
const DigitalMenu = lazy(() => import("./pages/client/DigitalMenu"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2 * 60_000,
      gcTime: 10 * 60_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: 1,
    },
  },
});

const App = () => {
  useEffect(() => {
    document.getElementById("initial-splash")?.remove();
  }, []);
  return (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <CartProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <QrModePopup />
            <ScrollToTop />
            <AuthRedirectHandler />
            <Suspense fallback={<main className="min-h-screen grid place-items-center bg-[#faf5e9] text-[#243529]"><span className="animate-pulse text-sm">Chargement…</span></main>}>
            <Routes>
              {/* Client */}
              <Route path="/table/:token" element={<TableEntry />} />
              <Route path="/" element={<Navigate to="/restaurant/la-parmigiana" replace />} />
              <Route path="/home" element={<Navigate to="/restaurant/la-parmigiana" replace />} />
              <Route path="/menu/la-parmigiana" element={<DigitalMenu />} />
              <Route path="/restaurant/la-parmigiana" element={<Restaurant />} />
              <Route path="/cart" element={<Cart />} />
              <Route path="/orders" element={<MyOrders />} />
              <Route path="/orders/:id" element={<OrderTracking />} />
              <Route path="/account" element={<Account />} />
              <Route path="/legal" element={<Legal />} />
              <Route path="/support" element={<Support />} />

              {/* Auth */}
              <Route path="/auth/signup" element={<AuthSignup />} />
              <Route path="/auth/login" element={<AuthLogin />} />
              <Route path="/auth/callback" element={<AuthCallback />} />
              <Route path="/auth/complete-profile" element={<CompleteProfile />} />
              <Route path="/auth/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />

              {/* Admin auth */}
              <Route path="/admin/login" element={<AdminLogin />} />

              {/* Restaurant Admin (protected) */}
              <Route path="/admin/service" element={<ProtectedRoute><TableService /></ProtectedRoute>} />
              <Route path="/admin" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
              <Route path="/admin/orders/:orderId" element={<ProtectedRoute><OrderDetail /></ProtectedRoute>} />
              <Route path="/admin/recap" element={<ProtectedRoute><OrdersRecap /></ProtectedRoute>} />
              <Route path="/admin/menu" element={<ProtectedRoute><MenuManager /></ProtectedRoute>} />
              <Route path="/admin/drivers" element={<ProtectedRoute><DriversManager /></ProtectedRoute>} />
              <Route path="/admin/drivers/:driverId" element={<ProtectedRoute><DriverHistory /></ProtectedRoute>} />
              <Route path="/admin/alerts" element={<SuperAdminRoute><SuperAdminAlerts /></SuperAdminRoute>} />
              <Route path="/admin/settings" element={<ProtectedRoute><RestaurantSettings /></ProtectedRoute>} />
              <Route path="/admin/caisse" element={<ProtectedRoute><POS /></ProtectedRoute>} />

              {/* Super Admin */}
              <Route path="/super-admin" element={<SuperAdminRoute><SuperAdminDashboard /></SuperAdminRoute>} />

              {/* Delivery */}
              <Route path="/delivery" element={<DeliveryList />} />
              <Route path="/delivery/active" element={<ActiveDelivery />} />
              <Route path="/delivery/service" element={<StaffWorkspace />} />
              <Route path="/delivery/caisse" element={<Navigate to="/delivery/service" replace />} />

              {/* Catch-all */}
              <Route path="*" element={<NotFound />} />
            </Routes>
            </Suspense>
          </BrowserRouter>
        </CartProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
  );
};

export default App;

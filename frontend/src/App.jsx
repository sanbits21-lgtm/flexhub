import { Suspense, lazy, useState } from 'react';
import { BrowserRouter, Navigate, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import RoleRoute from './components/RoleRoute';
import FeatureRoute from './components/FeatureRoute';
import Sidebar from './components/Sidebar';
import TrialBanner from './components/TrialBanner';
import BrandMark from './components/BrandMark';
import { useBrand } from './context/BrandContext';
import Signup from './pages/Signup';
// The member app is its own section; staff never download it and members never need the staff pages.
const MemberApp = lazy(() => import('./member/MemberApp'));
import VerifyEmail from './pages/VerifyEmail';
import PlatformSettings from './pages/platform/PlatformSettings';

import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import PlatformAdmins from './pages/platform/PlatformAdmins';
import Tenants from './pages/platform/Tenants';
import Workspace from './pages/platform/Workspace';
import PlatformDashboard from './pages/platform/PlatformDashboard';
import AuditLogs from './pages/platform/AuditLogs';
import Branches from './pages/tenant/Branches';
import MembershipPlans from './pages/tenant/MembershipPlans';
import TrainerReport from './pages/tenant/TrainerReport';
import Reports from './pages/tenant/Reports';
import PaymentSettings from './pages/tenant/PaymentSettings';
import Branding from './pages/tenant/Branding';
import Members from './pages/branch/Members';
import Trainers from './pages/branch/Trainers';
import Equipment from './pages/branch/Equipment';
import Attendance from './pages/branch/Attendance';
import Payments from './pages/branch/Payments';
import MyMembers from './pages/trainer/MyMembers';

function AppLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { brand } = useBrand();

  return (
    <div className="md:flex min-h-screen bg-gray-50 dark:bg-gray-900">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="md:hidden flex items-center justify-between bg-gray-900 text-gray-100 px-4 py-3 pt-safe sticky top-0 z-20">
          <span className="flex items-center gap-2 min-w-0 font-semibold"><BrandMark brand={brand} size={24} /><span className="truncate">{brand?.name || 'FlexHub'}</span></span>
          <button onClick={() => setSidebarOpen(true)} aria-label="Open menu" className="p-1">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </header>

        <TrialBanner />
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/member/*" element={<Suspense fallback={<div className="p-8 text-center text-sm text-gray-500 dark:text-gray-400">Loading...</div>}><MemberApp /></Suspense>} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/platform-settings" element={<RoleRoute allow={['super-admin']}><AppLayout><PlatformSettings /></AppLayout></RoleRoute>} />

          <Route path="/" element={<RoleRoute><AppLayout><Dashboard /></AppLayout></RoleRoute>} />

          <Route path="/platform-admins" element={<RoleRoute allow={['super-admin']}><AppLayout><PlatformAdmins /></AppLayout></RoleRoute>} />
          <Route path="/tenants" element={<RoleRoute allow={['super-admin', 'platform-admin']}><AppLayout><Tenants /></AppLayout></RoleRoute>} />
          <Route path="/tenants/:id/workspace" element={<RoleRoute allow={['super-admin', 'platform-admin']}><AppLayout><Workspace /></AppLayout></RoleRoute>} />
          <Route path="/platform-dashboard" element={<RoleRoute allow={['super-admin', 'platform-admin']}><AppLayout><PlatformDashboard /></AppLayout></RoleRoute>} />
          <Route path="/audit-logs" element={<RoleRoute allow={['super-admin', 'platform-admin']}><AppLayout><AuditLogs /></AppLayout></RoleRoute>} />

          <Route path="/branches" element={<RoleRoute allow={['tenant-admin']}><AppLayout><Branches /></AppLayout></RoleRoute>} />
          <Route path="/trainer-report" element={<RoleRoute allow={['tenant-admin']}><AppLayout><FeatureRoute feature="pages:trainerReport"><TrainerReport /></FeatureRoute></AppLayout></RoleRoute>} />
          <Route path="/reports" element={<RoleRoute allow={['tenant-admin']}><AppLayout><FeatureRoute feature="pages:reports"><Reports /></FeatureRoute></AppLayout></RoleRoute>} />
          <Route path="/payment-settings" element={<RoleRoute allow={['tenant-admin']}><AppLayout><FeatureRoute feature="pages:paymentSettings"><PaymentSettings /></FeatureRoute></AppLayout></RoleRoute>} />
          <Route path="/branding" element={<RoleRoute allow={['tenant-admin']}><AppLayout><FeatureRoute feature="features:branding"><Branding /></FeatureRoute></AppLayout></RoleRoute>} />
          <Route path="/membership-plans" element={<RoleRoute allow={['tenant-admin', 'branch-manager']}><AppLayout><MembershipPlans /></AppLayout></RoleRoute>} />

          <Route path="/members" element={<RoleRoute allow={['branch-manager', 'tenant-admin']}><AppLayout><Members /></AppLayout></RoleRoute>} />
          <Route path="/trainers" element={<RoleRoute allow={['branch-manager', 'tenant-admin']}><AppLayout><Trainers /></AppLayout></RoleRoute>} />
          <Route path="/equipment" element={<RoleRoute allow={['branch-manager', 'tenant-admin']}><AppLayout><FeatureRoute feature="pages:equipment"><Equipment /></FeatureRoute></AppLayout></RoleRoute>} />
          <Route path="/attendance" element={<RoleRoute allow={['branch-manager', 'tenant-admin', 'trainer']}><AppLayout><FeatureRoute feature="pages:attendance"><Attendance /></FeatureRoute></AppLayout></RoleRoute>} />
          <Route path="/payments" element={<RoleRoute allow={['branch-manager', 'tenant-admin']}><AppLayout><Payments /></AppLayout></RoleRoute>} />

          <Route path="/my-members" element={<RoleRoute allow={['trainer']}><AppLayout><MyMembers /></AppLayout></RoleRoute>} />

          {/* A mistyped or outdated address goes home (or to the login page when signed out), not to a blank screen. */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

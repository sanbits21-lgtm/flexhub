import { useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import RoleRoute from './components/RoleRoute';
import FeatureRoute from './components/FeatureRoute';
import Sidebar from './components/Sidebar';

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
import Members from './pages/branch/Members';
import Trainers from './pages/branch/Trainers';
import Equipment from './pages/branch/Equipment';
import Attendance from './pages/branch/Attendance';
import Payments from './pages/branch/Payments';
import MyMembers from './pages/trainer/MyMembers';

function AppLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="md:flex min-h-screen bg-gray-50 dark:bg-gray-900">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="md:hidden flex items-center justify-between bg-gray-900 text-gray-100 px-4 py-3 pt-safe sticky top-0 z-20">
          <span className="font-semibold">FlexHub</span>
          <button onClick={() => setSidebarOpen(true)} aria-label="Open menu" className="p-1">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </header>

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
          <Route path="/login" element={<Login />} />

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
          <Route path="/membership-plans" element={<RoleRoute allow={['tenant-admin', 'branch-manager']}><AppLayout><MembershipPlans /></AppLayout></RoleRoute>} />

          <Route path="/members" element={<RoleRoute allow={['branch-manager', 'tenant-admin']}><AppLayout><Members /></AppLayout></RoleRoute>} />
          <Route path="/trainers" element={<RoleRoute allow={['branch-manager', 'tenant-admin']}><AppLayout><Trainers /></AppLayout></RoleRoute>} />
          <Route path="/equipment" element={<RoleRoute allow={['branch-manager', 'tenant-admin']}><AppLayout><FeatureRoute feature="pages:equipment"><Equipment /></FeatureRoute></AppLayout></RoleRoute>} />
          <Route path="/attendance" element={<RoleRoute allow={['branch-manager', 'tenant-admin', 'trainer']}><AppLayout><FeatureRoute feature="pages:attendance"><Attendance /></FeatureRoute></AppLayout></RoleRoute>} />
          <Route path="/payments" element={<RoleRoute allow={['branch-manager', 'tenant-admin']}><AppLayout><Payments /></AppLayout></RoleRoute>} />

          <Route path="/my-members" element={<RoleRoute allow={['trainer']}><AppLayout><MyMembers /></AppLayout></RoleRoute>} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

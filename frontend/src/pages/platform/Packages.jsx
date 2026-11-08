import PackagesManager from '../../components/PackagesManager';
import { useAuth } from '../../context/AuthContext';

// The plans a new gym can pick when it registers. Their own page (and menu item) so they are easy
// to find: the super-admin manages them, a platform admin can see what is on offer.
export default function Packages() {
  const { user } = useAuth();
  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Packages</h1>
      <PackagesManager readOnly={user?.role !== 'super-admin'} />
    </div>
  );
}

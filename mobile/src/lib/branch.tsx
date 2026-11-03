import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, type ManagerSummary } from './api';
import { useAuth } from './auth';

export type Branch = { _id: string; name: string; phone?: string; capacity?: number; isActive?: boolean };
export type BranchStats = { activeMembers: number; totalMembers: number; trainerCount: number; equipmentCount: number };

type BranchState = {
  /** All branches of the gym (tenant admin only; empty for everyone else). */
  branches: Branch[];
  /** Headline numbers per branch, so a branch can be recognised in a list without opening it. */
  stats: Record<string, BranchStats>;
  /** '' = every branch. Only a tenant admin can pick one; a branch manager is fixed to theirs by the server. */
  branchId: string;
  setBranchId: (id: string) => void;
  branchName: (id?: string) => string;
  /** Adds ?branchId= to an API path when a tenant admin has narrowed to one branch. */
  scoped: (path: string) => string;
  reloadBranches: () => Promise<void>;
};
const Ctx = createContext<BranchState | null>(null);

export function BranchProvider({ children }: { children: ReactNode }) {
  const { role } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState('');
  const [stats, setStats] = useState<Record<string, BranchStats>>({});

  const reloadBranches = async () => {
    if (role !== 'tenant-admin') { setBranches([]); setBranchId(''); return; }
    try { setBranches(await api.get<Branch[]>('/branches')); } catch { /* keep the old list */ }
    try {
      const s = await api.get<ManagerSummary>('/dashboard/summary');
      setStats(Object.fromEntries((s.perBranch ?? []).map((b) => [b.branchId, b])));
    } catch { /* the picker works without the numbers */ }
  };
  useEffect(() => { void reloadBranches(); }, [role]);

  const value = useMemo<BranchState>(() => ({
    branches,
    stats,
    branchId,
    setBranchId,
    branchName: (id) => branches.find((b) => b._id === id)?.name ?? '',
    scoped: (path) => (role === 'tenant-admin' && branchId ? `${path}${path.includes('?') ? '&' : '?'}branchId=${branchId}` : path),
    reloadBranches,
  }), [branches, stats, branchId, role]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useBranch = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useBranch outside BranchProvider');
  return v;
};

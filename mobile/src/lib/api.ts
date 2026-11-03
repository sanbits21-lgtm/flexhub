import { Platform } from 'react-native';
import Constants from 'expo-constants';

// Where the FlexHub API lives. Set EXPO_PUBLIC_API_URL for a real device or a deployed
// server. Otherwise: the Android emulator reaches the host machine at 10.0.2.2, a phone
// running Expo Go is pointed at the dev machine's LAN address (taken from the Metro host),
// and the iOS simulator / web use localhost.
const resolveBaseUrl = (): string => {
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL.replace(/\/$/, '');
  if (Platform.OS === 'web') return 'http://localhost:5000';
  const metroHost = Constants.expoConfig?.hostUri?.split(':')[0];
  if (metroHost && metroHost !== 'localhost' && metroHost !== '127.0.0.1') return `http://${metroHost}:5000`;
  return Platform.OS === 'android' ? 'http://10.0.2.2:5000' : 'http://localhost:5000';
};

export const BASE_URL = resolveBaseUrl();

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

let token: string | null = null;
let onUnauthorized: () => void = () => {};
export const setToken = (t: string | null) => { token = t; };
export const setUnauthorizedHandler = (fn: () => void) => { onUnauthorized = fn; };
export const authHeaders = (): Record<string, string> => (token ? { Authorization: `Bearer ${token}` } : {});

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/api${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('Cannot reach the gym server. Check your internet connection.', 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // An expired or revoked token on any call except login itself ends the session.
    if (res.status === 401 && path !== '/member-auth/login' && path !== '/auth/login') onUnauthorized();
    throw new ApiError(data?.message || `Request failed (${res.status})`, res.status);
  }
  return data as T;
}

export const api = {
  get: <T,>(path: string) => request<T>('GET', path),
  post: <T,>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T,>(path: string, body?: unknown) => request<T>('PUT', path, body),
  delete: <T,>(path: string, body?: unknown) => request<T>('DELETE', path, body),
};

// ---------- types (mirror backend/controllers/memberAppController.js) ----------

export type Profile = {
  _id: string;
  memberCode: string;
  name: string;
  email?: string;
  phone: string;
  hasPhoto: boolean;
  dob?: string | null;
  gender?: 'male' | 'female' | 'other' | 'prefer_not_say';
  weightKg: number | null;
  heightCm: number | null;
  healthNotes: string;
  fitnessGoal: 'lose_fat' | 'build_muscle' | 'stay_fit' | 'improve_endurance' | null;
  experienceLevel: 'beginner' | 'intermediate' | 'advanced' | null;
  dietPreference: 'veg' | 'eggetarian' | 'non_veg' | 'vegan' | null;
  emergencyContact: { name?: string; phone?: string };
  membershipStatus: 'active' | 'expired' | 'frozen' | 'cancelled';
  membershipStart?: string;
  membershipEnd?: string;
};

export type Summary = {
  membershipStatus: Profile['membershipStatus'];
  membershipEnd?: string;
  attendanceThisMonth: number;
};

export type Equipment = { _id: string; name: string; category?: string; status: string };
export type Trainer = { _id: string; name: string; specialization?: string };

export type WorkoutPlan = {
  title: string; summary: string; daysPerWeek: number; disclaimer: string; notes: string[];
  days: { day: string; focus: string; exercises: { name: string; sets: number; reps: string; restSec: number; equipment: string; notes: string }[] }[];
};
export type DietPlan = {
  title: string; summary: string; caloriesTarget: number; proteinG: number; disclaimer: string; tips: string[];
  meals: { name: string; items: string[]; calories: number }[];
};
export type StoredPlan<T> = {
  _id?: string; source: 'ai' | 'rules' | 'staff'; content: T; createdAt: string;
  createdByName?: string; // set on plans written by a trainer or branch manager
} | null;

// ---------- schedule ----------

export type PtSession = {
  _id: string;
  status: 'scheduled' | 'completed' | 'no-show' | 'cancelled';
  startAt: string;
  endAt: string;
  focus?: string;
  notes?: string;
  memberId: { _id: string; name: string; memberCode: string; phone?: string } | null;
  trainerId?: { _id: string; name: string } | null;
};

export type ClassSessionRow = {
  _id: string;
  status: 'scheduled' | 'completed' | 'cancelled';
  startAt: string;
  endAt: string;
  capacity: number | null;
  bookedCount: number;
  waitlistedCount: number;
  classTypeId: { _id: string; name: string; durationMinutes: number; defaultCapacity: number } | null;
};

export type ClassType = { _id: string; name: string; durationMinutes: number; defaultCapacity: number };

export type RosterBooking = {
  _id: string;
  status: 'booked' | 'waitlisted' | 'cancelled' | 'attended' | 'no-show';
  memberId: { _id: string; name: string; memberCode: string } | null;
};

export type TrainerMember = { _id: string; name: string; memberCode: string; membershipStatus: string; phone?: string };

export type MySessions = {
  training: { _id: string; status: PtSession['status']; startAt: string; endAt: string; focus: string; notes: string; trainerName: string | null }[];
  classes: { _id: string; status: 'booked' | 'waitlisted'; name: string; trainerName: string | null; startAt: string; endAt: string }[];
};

// ---------- manager (branch manager / tenant admin) ----------

export type MemberRow = {
  _id: string;
  memberCode: string;
  name: string;
  phone: string;
  email?: string;
  gender?: string;
  dob?: string;
  branchId: string;
  membershipPlanId?: string;
  membershipStart?: string;
  membershipEnd?: string;
  membershipStatus: 'active' | 'expired' | 'frozen' | 'cancelled';
  assignedTrainerId?: string | null;
  isActive: boolean;
  emergencyContact?: { name?: string; phone?: string };
};

export type ExpiryRow = Pick<MemberRow, '_id' | 'name' | 'phone' | 'memberCode' | 'membershipEnd' | 'membershipPlanId' | 'branchId'>;

export type ManagerSummary = {
  // branch manager
  activeMembers: number;
  todaysCheckins?: number;
  expiringSoon?: number;
  maintenanceDue?: number;
  // tenant admin
  expiringSoonCount?: number;
  branchCount?: number;
  perBranch?: { branchId: string; branchName: string; activeMembers: number; totalMembers: number; equipmentCount: number; trainerCount: number }[];
  membersByMonth?: { month: string; count: number }[];
  collectionsByMonth?: { month: string; amount: number }[];
  attendanceTrend?: { _id: string; count: number }[];
  // both
  revenueThisMonth: number;
  expiredCount?: number;
  expiredMembers: ExpiryRow[];
  expiringSoonMembers: ExpiryRow[];
};

export type PlanRow = { _id: string; name: string; durationUnit: 'monthly' | 'quarterly' | 'half_yearly' | 'yearly'; price: number; description?: string; branchId?: string | null; isActive: boolean };

export type PaymentRow = {
  _id: string;
  invoiceNumber: string;
  amount: number;
  method?: 'cash' | 'card' | 'upi' | 'netbanking' | 'other';
  status: 'pending' | 'paid' | 'failed' | 'refunded';
  paidAt?: string;
  createdAt: string;
  memberId: { _id: string; name: string; memberCode: string; phone?: string } | null;
  membershipPlanId?: { _id: string; name: string } | null;
};

export type StaffRow = { _id: string; name: string; email: string; phone: string; role: string; specialization?: string; branchId?: string; isActive: boolean; salary?: number | null };

export type EquipmentRow = { _id: string; name: string; category?: string; status: 'operational' | 'under_maintenance' | 'retired'; branchId: string; lastServicedAt?: string; nextServiceDue?: string; notes?: string };

export type AttendanceRow = { _id: string; memberId: { _id: string; name: string; memberCode: string } | null; checkInAt: string; checkOutAt?: string | null; method: string };

export type ReportSummary = {
  planMix: { planId: string; planName: string; activeMembers: number; monthlyValue: number }[];
  attendanceTrend: { date: string; count: number }[];
  equipmentByStatus: { status: string; count: number }[];
  equipmentOverdue: { _id: string; name: string; category?: string; branchId: string; nextServiceDue: string }[];
};

export type TrainerReportRow = { _id: string; name: string; email: string; branchName?: string; specialization?: string; assignedMemberCount: number; collections: number; salary: number | null };
export type TenantSettings = { name: string; upiId?: string; upiPaymentLink?: string };

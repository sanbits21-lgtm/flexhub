import axios from 'axios';
import { getToken, setToken } from './authToken';

// X-Requested-With: a page on another site cannot add this header, which is what lets the server
// trust the refresh cookie (see backend/utils/sessions.js).
const api = axios.create({ baseURL: '/api', headers: { 'X-Requested-With': 'flexhub' } });

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// The access token lasts minutes. When it runs out the server says TOKEN_EXPIRED; one refresh
// call gets a new one and the request is repeated. Several requests expiring together share a
// single refresh (a second one would present an already-used refresh token).
let refreshing = null;
export const refreshAccessToken = () => {
  if (!refreshing) {
    refreshing = axios.post('/api/auth/refresh', {}, { headers: { 'X-Requested-With': 'flexhub' } })
      .then((res) => { setToken(res.data.token); return res.data.token; })
      .finally(() => { refreshing = null; });
  }
  return refreshing;
};
const isAuthCall = (url = '') => /\/auth\/(login|refresh|logout)/.test(url);

// A token that expires mid-session used to leave a logged-in-looking UI behind: every
// call 401'd but nothing reacted until the next full page load. Clearing the token and
// bouncing to /login makes the session end visible at the moment it actually ends.
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { response, config } = error;
    if (response?.status === 401 && response.data?.code === 'TOKEN_EXPIRED' && config && !config._retried && !isAuthCall(config.url)) {
      let token = null;
      try {
        token = await refreshAccessToken();
      } catch (refreshError) {
        // No answer at all (offline) is not the end of the session; only a refusal is, and that
        // falls through to the session-ended handling below.
        if (!refreshError.response) return Promise.reject(error);
      }
      if (token) {
        config._retried = true;
        config.headers.Authorization = `Bearer ${token}`;
        return api(config); // whatever this answers (even an error) is the answer to the caller
      }
    }
    if (error.response?.status === 402) window.alert(error.response.data?.message || 'This needs a paid plan.');
    if (error.response?.status === 403 && error.response.data?.code === 'GYM_SUSPENDED') window.alert(error.response.data.message);
    // The member app (/member) has its own session; a stale STAFF token in the same browser must
    // not throw a member out to the staff login.
    const onMemberApp = window.location.pathname.startsWith('/member');
    if (error.response?.status === 401 && !onMemberApp && !isAuthCall(error.config?.url) && !['/login', '/signup', '/verify-email'].includes(window.location.pathname)) {
      setToken(null);
      window.location.assign('/login');
    }
    return Promise.reject(error);
  }
);

export const authAPI = {
  login: (email, password) => api.post('/auth/login', { email, password }),
  logout: () => api.post('/auth/logout'),
  logoutAll: () => api.post('/auth/logout-all'),
  signupConfig: () => api.get('/public/signup-config'),
  signup: (data) => api.post('/public/signup', data),
  verifyEmail: (token) => api.post('/public/verify-email', { token }),
  resendVerification: (email) => api.post('/public/resend-verification', { email }),
  me: () => api.get('/auth/me'),
};

export const platformAdminsAPI = {
  list: () => api.get('/platform-admins'),
  create: (data) => api.post('/platform-admins', data),
  update: (id, data) => api.put(`/platform-admins/${id}`, data),
  remove: (id) => api.delete(`/platform-admins/${id}`),
};

export const tenantsAPI = {
  list: () => api.get('/tenants'),
  getOne: (id) => api.get(`/tenants/${id}`),
  create: (data) => api.post('/tenants', data),
  update: (id, data) => api.put(`/tenants/${id}`, data),
  suspend: (id) => api.patch(`/tenants/${id}/suspend`),
  approve: (id, data) => api.post(`/tenants/${id}/approve`, data || {}),
  renew: (id, data) => api.post(`/tenants/${id}/renew`, data || {}),
  reject: (id, reason) => api.post(`/tenants/${id}/reject`, { reason }),
  createTenantAdmin: (id, data) => api.post(`/tenants/${id}/tenant-admins`, data),
  getFeatures: (id) => api.get(`/tenants/${id}/features`),
  updateFeatures: (id, features) => api.put(`/tenants/${id}/features`, { features }),
};

export const branchesAPI = {
  list: (branchId) => api.get('/branches', { params: branchId ? { branchId } : {} }),
  getOne: (id) => api.get(`/branches/${id}`),
  create: (data) => api.post('/branches', data),
  update: (id, data) => api.put(`/branches/${id}`, data),
  remove: (id) => api.delete(`/branches/${id}`),
  createManager: (id, data) => api.post(`/branches/${id}/managers`, data),
};

export const staffAPI = {
  list: (params) => api.get('/staff', { params }),
  createTrainer: (data) => api.post('/staff', data),
  update: (id, data) => api.put(`/staff/${id}`, data),
  remove: (id) => api.delete(`/staff/${id}`),
  assignedMembers: (id) => api.get(`/staff/${id}/assigned-members`),
  resetPassword: (id) => api.post(`/staff/${id}/reset-password`),
  trainerReport: () => api.get('/staff/trainer-report'),
};

export const membersAPI = {
  list: (params) => api.get('/members', { params }),
  getOne: (id) => api.get(`/members/${id}`),
  progress: (id) => api.get(`/members/${id}/progress`),
  create: (data) => api.post('/members', data),
  bulkCreate: (data) => api.post('/members/bulk', data),
  bulkCheck: (data) => api.post('/members/bulk/check', data),
  phoneCheck: (data) => api.post('/members/phone-check', data),
  update: (id, data) => api.put(`/members/${id}`, data),
  remove: (id) => api.delete(`/members/${id}`),
  renew: (id, data) => api.post(`/members/${id}/renew`, data),
  issueAppAccess: (id) => api.post(`/members/${id}/app-access`),
};

export const memberPlansAPI = {
  list: (memberId) => api.get(`/members/${memberId}/plans`),
  draft: (memberId, data) => api.post(`/members/${memberId}/plans/draft`, data),
  create: (memberId, data) => api.post(`/members/${memberId}/plans`, data),
  withdraw: (memberId, planId) => api.delete(`/members/${memberId}/plans/${planId}`),
};

export const equipmentAPI = {
  list: (params) => api.get('/equipment', { params }),
  maintenanceDue: () => api.get('/equipment/maintenance-due'),
  create: (data) => api.post('/equipment', data),
  update: (id, data) => api.put(`/equipment/${id}`, data),
  remove: (id) => api.delete(`/equipment/${id}`),
};

export const membershipPlansAPI = {
  list: (branchId) => api.get('/membership-plans', { params: branchId ? { branchId } : {} }),
  create: (data) => api.post('/membership-plans', data),
  update: (id, data) => api.put(`/membership-plans/${id}`, data),
  remove: (id) => api.delete(`/membership-plans/${id}`),
};

export const attendanceAPI = {
  list: (params) => api.get('/attendance', { params }),
  forMember: (id) => api.get(`/attendance/member/${id}`),
  checkIn: (memberId) => api.post('/attendance/check-in', { memberId }),
  checkOut: (attendanceId) => api.post('/attendance/check-out', { attendanceId }),
};

export const paymentsAPI = {
  list: (params) => api.get('/payments', { params }),
  forMember: (id) => api.get(`/payments/member/${id}`),
  create: (data) => api.post('/payments', data),
  update: (id, data) => api.put(`/payments/${id}`, data),
};

export const dashboardAPI = {
  summary: (branchId) => api.get('/dashboard/summary', { params: branchId ? { branchId } : {} }),
  platform: () => api.get('/dashboard/platform'),
};

export const auditLogsAPI = {
  list: (params) => api.get('/audit-logs', { params }),
};

export const reportsAPI = {
  summary: (branchId) => api.get('/reports/summary', { params: branchId ? { branchId } : {} }),
};

export const packagesAPI = {
  list: () => api.get('/packages'),
  create: (data) => api.post('/packages', data),
  update: (id, data) => api.put(`/packages/${id}`, data),
  remove: (id) => api.delete(`/packages/${id}`),
};

export const platformSettingsAPI = {
  get: () => api.get('/platform-settings'),
  emailStatus: () => api.get('/platform-settings/email-status'),
  testEmail: () => api.post('/platform-settings/test-email'),
  update: (data) => api.put('/platform-settings', data),
};

export const tenantSettingsAPI = {
  get: () => api.get('/tenant-settings'),
  getBranding: () => api.get('/tenant-settings/branding'),
  updateBranding: (data) => api.put('/tenant-settings/branding', data),
  update: (data) => api.put('/tenant-settings', data),
  getMemberFields: () => api.get('/tenant-settings/member-fields'),
  createMemberField: (data) => api.post('/tenant-settings/member-fields', data),
};

export default api;

import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// A token that expires mid-session used to leave a logged-in-looking UI behind: every
// call 401'd but nothing reacted until the next full page load. Clearing the token and
// bouncing to /login makes the session end visible at the moment it actually ends.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && window.location.pathname !== '/login') {
      localStorage.removeItem('token');
      window.location.assign('/login');
    }
    return Promise.reject(error);
  }
);

export const authAPI = {
  login: (email, password) => api.post('/auth/login', { email, password }),
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
  trainerReport: () => api.get('/staff/trainer-report'),
};

export const membersAPI = {
  list: (params) => api.get('/members', { params }),
  getOne: (id) => api.get(`/members/${id}`),
  progress: (id) => api.get(`/members/${id}/progress`),
  create: (data) => api.post('/members', data),
  bulkCreate: (data) => api.post('/members/bulk', data),
  update: (id, data) => api.put(`/members/${id}`, data),
  remove: (id) => api.delete(`/members/${id}`),
  renew: (id, data) => api.post(`/members/${id}/renew`, data),
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

export const tenantSettingsAPI = {
  get: () => api.get('/tenant-settings'),
  update: (data) => api.put('/tenant-settings', data),
};

export default api;

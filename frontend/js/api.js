const API_BASE = '/api';

class ApiClient {
  getToken() {
    return localStorage.getItem('meetmind_token');
  }

  setToken(token) {
    localStorage.setItem('meetmind_token', token);
  }

  clearToken() {
    localStorage.removeItem('meetmind_token');
    localStorage.removeItem('meetmind_user');
  }

  getUser() {
    const u = localStorage.getItem('meetmind_user');
    return u ? JSON.parse(u) : null;
  }

  setUser(user) {
    localStorage.setItem('meetmind_user', JSON.stringify(user));
  }

  async request(path, options = {}) {
    const headers = { ...options.headers };
    headers['ngrok-skip-browser-warning'] = 'true';
    const token = this.getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    if (!(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data.message || data.errors?.[0]?.msg || 'Request failed');
    }
    return data;
  }

  // Auth
  register(body) { return this.request('/auth/register', { method: 'POST', body: JSON.stringify(body) }); }
  login(body) { return this.request('/auth/login', { method: 'POST', body: JSON.stringify(body) }); }
  forgotPassword(email) { return this.request('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }); }
  resetPassword(body) { return this.request('/auth/reset-password', { method: 'POST', body: JSON.stringify(body) }); }
  getProfile() { return this.request('/auth/profile'); }
  updateProfile(body) { return this.request('/auth/profile', { method: 'PUT', body: JSON.stringify(body) }); }
  uploadPicture(file) {
    const fd = new FormData();
    fd.append('picture', file);
    return this.request('/auth/profile/picture', { method: 'POST', body: fd, headers: {} });
  }
  logout() { return this.request('/auth/logout', { method: 'POST' }); }

  // Meetings
  createMeeting(body) { return this.request('/meetings/create', { method: 'POST', body: JSON.stringify(body) }); }
  joinMeeting(body) { return this.request('/meetings/join', { method: 'POST', body: JSON.stringify(body) }); }
  getHistory() { return this.request('/meetings/history'); }
  getUpcoming() { return this.request('/meetings/upcoming'); }
  getMeeting(id) { return this.request(`/meetings/${id}`); }
  requestCameraExemption(id, reason) {
    return this.request(`/meetings/${id}/camera-exemption`, { method: 'POST', body: JSON.stringify({ reason }) });
  }
  getHostAnalytics(meetingId) { return this.request(`/meetings/${meetingId}/analytics/host`); }
  getParticipantAnalytics(meetingId) { return this.request(`/meetings/${meetingId}/analytics/participant`); }
  endMeeting(meetingId) { return this.request(`/meetings/${meetingId}/end`, { method: 'POST' }); }
  downloadReport(meetingId) {
    window.open(`${API_BASE}/meetings/${meetingId}/report/download?token=${this.getToken()}`, '_blank');
  }
  getCameraRequests(meetingId) { return this.request(`/meetings/${meetingId}/camera-requests`); }
  approveCamera(meetingId, participantId) {
    return this.request(`/meetings/${meetingId}/camera-requests/${participantId}/approve`, { method: 'POST' });
  }
  rejectCamera(meetingId, participantId) {
    return this.request(`/meetings/${meetingId}/camera-requests/${participantId}/reject`, { method: 'POST' });
  }

  // Notifications
  getNotifications() { return this.request('/notifications'); }
  markRead(id) { return this.request(`/notifications/${id}/read`, { method: 'PUT' }); }
  markAllRead() { return this.request('/notifications/read-all', { method: 'PUT' }); }
}

const api = new ApiClient();

function requireAuth() {
  if (!api.getToken()) {
    window.location.href = '/login.html';
    return false;
  }
  return true;
}

function redirectIfAuth() {
  if (api.getToken()) {
    window.location.href = '/dashboard.html';
  }
}

function showAlert(el, message, type = 'error') {
  if (!el) return;
  el.textContent = message;
  el.className = `alert alert-${type}`;
  el.classList.remove('hidden');
}

function formatDate(d) {
  if (!d) return 'N/A';
  return new Date(d).toLocaleString();
}

function formatDuration(minutes) {
  if (!minutes) return '0m';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

function formatSeconds(s) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function getInitials(name) {
  return (name || '?').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

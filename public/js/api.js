// ============================================================
// MAESAI SALA CONNECT — Central API Client
// Standard: Token persistence, defensive parsing, error handling
// ============================================================

const Api = {
  // Automatically detects if running under /sala prefix or root
  baseUrl: window.location.pathname.startsWith('/sala') ? '/sala/api' : '/api',

  getToken() {
    return localStorage.getItem('sala_token') || '';
  },

  setToken(token) {
    if (token) {
      localStorage.setItem('sala_token', token);
      document.cookie = `sala_token=${token}; path=/; max-age=86400; SameSite=Lax`;
    } else {
      localStorage.removeItem('sala_token');
      document.cookie = 'sala_token=; path=/; max-age=0;';
    }
  },

  getCurrentUser() {
    try {
      const u = localStorage.getItem('sala_user');
      return u ? JSON.parse(u) : null;
    } catch (e) {
      return null;
    }
  },

  setCurrentUser(user) {
    if (user) {
      localStorage.setItem('sala_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('sala_user');
    }
  },

  async request(endpoint, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const res = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        headers
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `HTTP error ${res.status}`);
      }
      return data;
    } catch (err) {
      console.error(`[API ERROR] ${endpoint}:`, err);
      throw err;
    }
  },

  // Auth Endpoints
  async login(username, password) {
    const data = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    if (data.token) {
      this.setToken(data.token);
      this.setCurrentUser(data.user);
    }
    return data;
  },

  async logout() {
    try {
      await this.request('/auth/logout', { method: 'POST' });
    } catch (e) {
      // Ignore network errors on logout
    }
    this.setToken(null);
    this.setCurrentUser(null);
  },

  async getMe() {
    return this.request('/auth/me');
  },

  // Settings & Stats
  async getSettings() {
    return this.request('/settings');
  },

  async updateSettings(settings) {
    return this.request('/settings', {
      method: 'POST',
      body: JSON.stringify(settings)
    });
  },

  async getStats() {
    return this.request('/stats');
  },

  // Proposals
  async getProposals(params = {}) {
    const query = new URLSearchParams();
    if (params.community && params.community !== 'all') query.set('community', params.community);
    if (params.status && params.status !== 'all') query.set('status', params.status);
    if (params.category && params.category !== 'all') query.set('category', params.category);
    if (params.search) query.set('search', params.search);
    if (params.public) query.set('public', 'true');

    const qs = query.toString();
    return this.request(`/proposals${qs ? '?' + qs : ''}`);
  },

  async getProposal(id) {
    return this.request(`/proposals/${id}`);
  },

  async createProposal(payload) {
    return this.request('/proposals', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  async updateProposal(id, payload) {
    return this.request(`/proposals/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
  },

  async deleteProposal(id) {
    return this.request(`/proposals/${id}`, {
      method: 'DELETE'
    });
  },

  async bulkUpdateStatus(ids, status) {
    return this.request('/proposals/bulk-status', {
      method: 'POST',
      body: JSON.stringify({ ids, status })
    });
  },

  // News
  async getNews() {
    return this.request('/news');
  },

  async createNews(payload) {
    return this.request('/news', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  async deleteNews(id) {
    return this.request(`/news/${id}`, {
      method: 'DELETE'
    });
  },

  // Users (Admin Only)
  async getUsers() {
    return this.request('/users');
  },

  async createUser(payload) {
    return this.request('/users', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  async updateUser(id, payload) {
    return this.request(`/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
  },

  async deleteUser(id) {
    return this.request(`/users/${id}`, {
      method: 'DELETE'
    });
  },

  // Security Logs
  async getLogs() {
    return this.request('/logs');
  }
};

// UI Notification Toast Helper
function showToast(message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}


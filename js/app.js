const STATUS = {
  NEW: 'new',
  PROCESSING: 'processing',
  READY: 'ready'
};

const api = {
  async request(url, options = {}) {
    const response = await fetch(url, {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      },
      ...options
    });

    const contentType = response.headers.get('content-type') || '';
    const data = contentType.includes('application/json') ? await response.json() : null;

    if (!response.ok) {
      const message = data?.error || `Ошибка ${response.status}`;
      throw new Error(message);
    }

    return data;
  },
  get(url) {
    return this.request(url);
  },
  post(url, body) {
    return this.request(url, { method: 'POST', body: JSON.stringify(body) });
  },
  put(url, body) {
    return this.request(url, { method: 'PUT', body: JSON.stringify(body) });
  },
  patch(url, body) {
    return this.request(url, { method: 'PATCH', body: JSON.stringify(body) });
  },
  delete(url) {
    return this.request(url, { method: 'DELETE' });
  }
};

const escapeHtml = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

const escapeJsString = (value = '') => String(value)
  .replaceAll('\\', '\\\\')
  .replaceAll("'", "\\'")
  .replace(/\r?\n/g, ' ');

const formatDate = (value) => {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('ru-RU');
};

const formatDateTime = (value) => {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('ru-RU');
};

const formatRequestNumber = (n) => `#${String(Number(n) || 0).padStart(4, '0')}`;
const formatUserNumber = (n) => `#${String(Number(n) || 0).padStart(4, '0')}`;

const statusMeta = (status) => {
  if (status === STATUS.PROCESSING) {
    return { className: 'status-processing', icon: '<i class="fas fa-spinner"></i>', text: 'В обработке' };
  }
  if (status === STATUS.READY) {
    return { className: 'status-ready', icon: '<i class="fas fa-check-circle"></i>', text: 'Готова' };
  }
  return { className: 'status-new', icon: '<i class="fas fa-clock"></i>', text: 'Новая' };
};

const showError = (container, message) => {
  if (!container) return;
  container.style.display = 'block';
  container.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${escapeHtml(message)}`;
};

const hideError = (container) => {
  if (!container) return;
  container.style.display = 'none';
  container.textContent = '';
};

async function getCurrentUser() {
  const result = await api.get('/api/auth/me');
  return result.user;
}

async function requireAuth() {
  try {
    return await getCurrentUser();
  } catch {
    window.location.href = './login.html';
    return null;
  }
}

async function requireAdmin() {
  const user = await requireAuth();
  if (!user) return null;
  if (user.role !== 'admin') {
    window.location.href = './login.html';
    return null;
  }
  return user;
}

document.addEventListener('DOMContentLoaded', async () => {
  const pathname = window.location.pathname;

  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const errorDiv = document.getElementById('error-message');
      hideError(errorDiv);

      const username = document.getElementById('username').value.trim();
      const password = document.getElementById('password').value;

      try {
        const { user } = await api.post('/api/auth/login', { username, password });
        window.location.href = user.role === 'admin' ? './admin.html' : './student.html';
      } catch (error) {
        showError(errorDiv, error.message);
      }
    });
  }

  const registerForm = document.getElementById('register-form');
  if (registerForm) {
    registerForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const errorDiv = document.getElementById('error-message');
      hideError(errorDiv);

      const payload = {
        fullname: document.getElementById('fullname').value.trim(),
        email: document.getElementById('email').value.trim(),
        username: document.getElementById('username').value.trim(),
        password: document.getElementById('password').value,
        group: document.getElementById('group').value.trim()
      };

      try {
        await api.post('/api/auth/register', payload);
        window.location.href = './student.html';
      } catch (error) {
        showError(errorDiv, error.message);
      }
    });
  }

  if (pathname.includes('student.html')) {
    const user = await requireAuth();
    if (!user) return;

    const userInfo = document.getElementById('user-info');
    if (userInfo) {
      userInfo.innerHTML = `
        <h2><i class="fas fa-user-graduate"></i> ${escapeHtml(user.fullname)}</h2>
        <div style="display: flex; gap: 20px; margin-top: 10px; flex-wrap: wrap;">
          <span style="background: #f1f5f9; padding: 4px 12px; border-radius: 20px; font-size: 14px;">
            <i class="fas fa-users"></i> Группа: ${escapeHtml(user.group || 'Не указана')}
          </span>
          <span style="background: #f1f5f9; padding: 4px 12px; border-radius: 20px; font-size: 14px;">
            <i class="fas fa-envelope"></i> ${escapeHtml(user.email || 'Не указан')}
          </span>
        </div>
      `;
    }

    const requestsList = document.getElementById('requests-list');
    if (requestsList) {
      const { requests } = await api.get('/api/requests');

      if (!requests.length) {
        requestsList.innerHTML = `
          <div style="background: white; padding: 48px; text-align: center; border-radius: 24px; border: 1px solid #e2e8f0;">
            <i class="fas fa-file-alt" style="font-size: 48px; color: #cbd5e1; margin-bottom: 16px;"></i>
            <p style="color: #64748b;">У вас пока нет заявок</p>
            <a href="./create-request.html" class="btn btn-primary" style="margin-top: 20px;">Создать первую заявку</a>
          </div>
        `;
      } else {
        const rows = requests.map((request) => {
          const st = statusMeta(request.status);
          return `<tr>
            <td>${escapeHtml(formatDate(request.createdAt))}</td>
            <td>${escapeHtml(request.type)}</td>
            <td>${escapeHtml(request.purpose)}</td>
            <td><span class="status-badge ${st.className}">${st.icon} ${st.text}</span></td>
          </tr>`;
        }).join('');

        requestsList.innerHTML = `<div class="requests-table"><table><thead><tr><th>Дата</th><th>Тип справки</th><th>Куда</th><th>Статус</th></tr></thead><tbody>${rows}</tbody></table></div>`;
      }
    }
  }

  const requestForm = document.getElementById('request-form');
  if (requestForm) {
    const user = await requireAuth();
    if (!user) return;

    const studentName = document.getElementById('studentName');
    if (studentName) studentName.value = user.fullname;

    requestForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const errorDiv = document.getElementById('error-message');
      hideError(errorDiv);

      const payload = {
        birthdate: document.getElementById('birthdate').value,
        admissionDate: document.getElementById('admissionDate').value,
        course: document.getElementById('course').value,
        type: document.getElementById('type').value,
        purpose: document.getElementById('purpose').value,
        comment: document.getElementById('comment').value
      };

      try {
        await api.post('/api/requests', payload);
        window.location.href = './student.html';
      } catch (error) {
        showError(errorDiv, error.message);
      }
    });
  }

  if (pathname.includes('admin.html')) {
    const user = await requireAdmin();
    if (!user) return;

    const { requests } = await api.get('/api/requests');

    const stats = {
      total: requests.length,
      new: requests.filter((r) => r.status === STATUS.NEW).length,
      processing: requests.filter((r) => r.status === STATUS.PROCESSING).length,
      ready: requests.filter((r) => r.status === STATUS.READY).length
    };

    const statsContainer = document.getElementById('stats');
    if (statsContainer) {
      statsContainer.innerHTML = `
        <div class="stat-card"><div class="stat-number">${stats.total}</div><div class="stat-label">Всего заявок</div></div>
        <div class="stat-card"><div class="stat-number">${stats.new}</div><div class="stat-label">Новые</div></div>
        <div class="stat-card"><div class="stat-number">${stats.processing}</div><div class="stat-label">В обработке</div></div>
        <div class="stat-card"><div class="stat-number">${stats.ready}</div><div class="stat-label">Готовы</div></div>
      `;
    }

    const tableBody = document.getElementById('requests-table-body');
    if (tableBody) {
      const rows = requests.map((request) => {
        const st = statusMeta(request.status);
        const safeId = escapeJsString(request.id);
        return `<tr>
          <td><strong>${escapeHtml(formatRequestNumber(request.requestNumber))}</strong></td>
          <td>${escapeHtml(formatDate(request.createdAt))}</td>
          <td>${escapeHtml(request.studentName)}</td>
          <td>${escapeHtml(request.studentGroup || '—')}</td>
          <td>${escapeHtml(request.type)}</td>
          <td><span class="status-badge ${st.className}">${st.icon} ${st.text}</span></td>
          <td>
            <div class="action-buttons">
              <a href="./view-request.html?id=${encodeURIComponent(request.id)}" class="btn-sm btn-secondary" title="Просмотр"><i class="fas fa-eye"></i></a>
              ${request.status === STATUS.NEW ? `<a href="#" onclick="updateStatus('${safeId}', 'processing'); return false;" class="btn-sm btn-primary" title="Взять в работу"><i class="fas fa-play"></i></a>` : ''}
              ${request.status === STATUS.PROCESSING ? `<a href="#" onclick="updateStatus('${safeId}', 'ready'); return false;" class="btn-sm btn-success" title="Отметить готовой"><i class="fas fa-check"></i></a>` : ''}
              <a href="#" onclick="deleteRequest('${safeId}'); return false;" class="btn-sm btn-danger" title="Удалить"><i class="fas fa-trash"></i></a>
            </div>
          </td>
        </tr>`;
      }).join('');

      tableBody.innerHTML = rows;
    }
  }

  if (pathname.includes('users.html')) {
    const user = await requireAdmin();
    if (!user) return;

    const { users } = await api.get('/api/users');

    const totalUsers = document.getElementById('total-users');
    if (totalUsers) totalUsers.innerHTML = `<i class="fas fa-user"></i> Всего: ${users.length}`;

    const usersTableBody = document.getElementById('users-table-body');
    if (usersTableBody) {
      usersTableBody.innerHTML = users.map((u) => {
        const roleBadge = u.role === 'admin'
          ? '<span class="role-badge admin"><i class="fas fa-crown"></i> Админ</span>'
          : '<span class="role-badge student"><i class="fas fa-user-graduate"></i> Студент</span>';

        const safeId = escapeJsString(u.id);

        return `<tr>
          <td style="font-weight: 600; color: #0f3b7a;">${escapeHtml(formatUserNumber(u.userNumber))}</td>
          <td>${escapeHtml(u.fullname)}</td>
          <td>${escapeHtml(u.email || '—')}</td>
          <td>${escapeHtml(u.username)}</td>
          <td>${escapeHtml(u.group || '—')}</td>
          <td>${roleBadge}</td>
          <td>${escapeHtml(formatDate(u.createdAt))}</td>
          <td>
            <div class="user-actions">
              <a href="./user-detail.html?id=${encodeURIComponent(u.id)}" class="btn-sm btn-secondary" title="Просмотр"><i class="fas fa-eye"></i></a>
              ${u.role !== 'admin' ? `<a href="#" onclick="deleteUser('${safeId}'); return false;" class="btn-sm btn-danger" title="Удалить"><i class="fas fa-trash"></i></a>` : ''}
            </div>
          </td>
        </tr>`;
      }).join('');
    }

    const userStats = document.getElementById('user-stats');
    if (userStats) {
      const groupsCount = new Set(users.map((u) => u.group).filter(Boolean)).size;
      userStats.innerHTML = `
        <div class="stat-item"><div class="stat-number-large" style="color: #0f3b7a;">${users.length}</div><div class="stat-label">Всего</div></div>
        <div class="stat-item"><div class="stat-number-large" style="color: #b45309;">${users.filter((u) => u.role === 'student').length}</div><div class="stat-label">Студентов</div></div>
        <div class="stat-item"><div class="stat-number-large" style="color: #0b3b7a;">${users.filter((u) => u.role === 'admin').length}</div><div class="stat-label">Админов</div></div>
        <div class="stat-item"><div class="stat-number-large" style="color: #0e7490;">${groupsCount}</div><div class="stat-label">Групп</div></div>
      `;
    }
  }

  if (pathname.includes('user-detail.html')) {
    const admin = await requireAdmin();
    if (!admin) return;

    const userId = new URLSearchParams(window.location.search).get('id');
    if (!userId) {
      window.location.href = './users.html';
      return;
    }

    const [{ user }, { requests }] = await Promise.all([
      api.get(`/api/users/${encodeURIComponent(userId)}`),
      api.get('/api/requests')
    ]);

    const userRequests = requests.filter((r) => r.userId === userId);
    let requestsHtml = '';

    if (!userRequests.length) {
      requestsHtml = '<p style="text-align: center; color: #64748b; padding: 30px;"><i class="fas fa-inbox" style="font-size: 40px; opacity: 0.3; margin-bottom: 10px; display: block;"></i>У пользователя нет заявок</p>';
    } else {
      const rows = userRequests.map((request) => {
        const st = statusMeta(request.status);
        return `<tr>
          <td>${escapeHtml(formatRequestNumber(request.requestNumber))}</td>
          <td>${escapeHtml(formatDate(request.createdAt))}</td>
          <td>${escapeHtml(request.type)}</td>
          <td>${escapeHtml(request.purpose)}</td>
          <td><span class="status-badge ${st.className}">${st.icon} ${st.text}</span></td>
          <td><a href="./view-request.html?id=${encodeURIComponent(request.id)}" class="btn-sm btn-secondary"><i class="fas fa-eye"></i></a></td>
        </tr>`;
      }).join('');
      requestsHtml = `<div class="requests-table"><table><thead><tr><th>Номер</th><th>Дата</th><th>Тип</th><th>Куда</th><th>Статус</th><th>Действие</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    }

    const container = document.getElementById('user-detail-container');
    if (container) {
      container.innerHTML = `
        <div class="info-section">
          <h3 class="section-title"><i class="fas fa-user-circle"></i> Информация о пользователе</h3>
          <div class="detail-grid"><div class="detail-label">ID:</div><div class="detail-value">${escapeHtml(formatUserNumber(user.userNumber))}</div></div>
          <div class="detail-grid"><div class="detail-label">ФИО:</div><div class="detail-value">${escapeHtml(user.fullname)}</div></div>
          <div class="detail-grid"><div class="detail-label">Email:</div><div class="detail-value">${escapeHtml(user.email || 'Не указан')}</div></div>
          <div class="detail-grid"><div class="detail-label">Логин:</div><div class="detail-value">${escapeHtml(user.username)}</div></div>
          <div class="detail-grid"><div class="detail-label">Группа:</div><div class="detail-value">${escapeHtml(user.group || '—')}</div></div>
          <div class="detail-grid"><div class="detail-label">Роль:</div><div class="detail-value">${user.role === 'admin' ? '<span style="background: #0f3b7a; color: white; padding: 4px 12px; border-radius: 100px;">Администратор</span>' : '<span style="background: #e2e8f0; color: #475569; padding: 4px 12px; border-radius: 100px;">Студент</span>'}</div></div>
          <div class="detail-grid"><div class="detail-label">Дата регистрации:</div><div class="detail-value">${escapeHtml(formatDateTime(user.createdAt))}</div></div>
        </div>

        <div class="info-section">
          <h3 class="section-title"><i class="fas fa-pen"></i> Редактирование пользователя</h3>
          <div id="user-edit-error" style="display: none; background: #fee2e2; color: #b91c1c; padding: 12px; border-radius: 12px; margin-bottom: 16px;"></div>
          <form id="user-edit-form" style="display: grid; gap: 12px; margin-bottom: 20px;">
            <input type="hidden" id="edit-user-id" value="${escapeHtml(user.id)}">
            <div class="form-group" style="margin-bottom: 0;"><label>ФИО</label><input class="form-control" id="edit-fullname" type="text" required value="${escapeHtml(user.fullname)}"></div>
            <div class="form-group" style="margin-bottom: 0;"><label>Email</label><input class="form-control" id="edit-email" type="email" required value="${escapeHtml(user.email || '')}"></div>
            <div class="form-group" style="margin-bottom: 0;"><label>Логин</label><input class="form-control" id="edit-username" type="text" required value="${escapeHtml(user.username)}"></div>
            <div class="form-group" style="margin-bottom: 0;"><label>Группа</label><input class="form-control" id="edit-group" type="text" required value="${escapeHtml(user.group || '')}"></div>
            <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Сохранить изменения</button>
          </form>
          <h3 class="section-title"><i class="fas fa-file-alt"></i> Заявки пользователя</h3>
          ${requestsHtml}
        </div>

        ${user.role !== 'admin' ? `
          <div style="display: flex; gap: 16px; margin-top: 20px;">
            <a href="#" onclick="deleteUser('${escapeJsString(user.id)}'); return false;" class="btn btn-danger" style="flex: 1; padding: 16px;"><i class="fas fa-trash"></i> Удалить пользователя</a>
          </div>
        ` : ''}
      `;

      const form = document.getElementById('user-edit-form');
      if (form) {
        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          await window.updateUserProfile();
        });
      }
    }
  }

  if (pathname.includes('view-request.html')) {
    const admin = await requireAdmin();
    if (!admin) return;

    const requestId = new URLSearchParams(window.location.search).get('id');
    if (!requestId) {
      window.location.href = './admin.html';
      return;
    }

    const { request } = await api.get(`/api/requests/${encodeURIComponent(requestId)}`);
    const { user: student } = await api.get(`/api/users/${encodeURIComponent(request.userId)}`);

    const st = statusMeta(request.status);
    const statusHtml = `<span class="status-badge ${st.className} status-large">${st.icon} ${st.text}</span>`;

    const container = document.getElementById('request-detail-container');
    if (container) {
      container.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 30px; background: white; padding: 20px 30px; border-radius: 20px; border: 1px solid #e2e8f0;">
          <div>
            <h2 style="font-size: 28px; color: #0f3b7a; margin-bottom: 5px;">Заявка ${escapeHtml(formatRequestNumber(request.requestNumber))}</h2>
            <p style="color: #64748b;">Создана: ${escapeHtml(formatDate(request.createdAt))}</p>
          </div>
          <div>${statusHtml}</div>
        </div>

        <div class="info-section">
          <h3 class="section-title"><i class="fas fa-user-graduate"></i> Информация о студенте</h3>
          <div class="detail-grid"><div class="detail-label"><i class="fas fa-user"></i> ФИО:</div><div class="detail-value">${escapeHtml(student.fullname)}</div></div>
          <div class="detail-grid"><div class="detail-label"><i class="fas fa-envelope"></i> Email:</div><div class="detail-value">${escapeHtml(student.email || 'Не указан')}</div></div>
          <div class="detail-grid"><div class="detail-label"><i class="fas fa-users"></i> Группа:</div><div class="detail-value">${escapeHtml(student.group || 'Не указана')}</div></div>
          <div class="detail-grid"><div class="detail-label"><i class="fas fa-calendar-alt"></i> Дата рождения:</div><div class="detail-value">${escapeHtml(formatDate(request.birthdate) || 'Не указана')}</div></div>
          <div class="detail-grid"><div class="detail-label"><i class="fas fa-layer-group"></i> Курс:</div><div class="detail-value">${escapeHtml(request.course)} курс</div></div>
          <div class="detail-grid"><div class="detail-label"><i class="fas fa-calendar-check"></i> Дата поступления:</div><div class="detail-value">${escapeHtml(formatDate(request.admissionDate) || 'Не указана')}</div></div>
        </div>

        <div class="info-section">
          <h3 class="section-title"><i class="fas fa-file-alt"></i> Детали заявки</h3>
          <div class="detail-grid"><div class="detail-label"><i class="fas fa-tag"></i> Тип справки:</div><div class="detail-value">${escapeHtml(request.type)}</div></div>
          <div class="detail-grid"><div class="detail-label"><i class="fas fa-map-pin"></i> Куда предоставляется:</div><div class="detail-value">${escapeHtml(request.purpose)}</div></div>
          <div class="detail-grid"><div class="detail-label"><i class="fas fa-comment"></i> Комментарий:</div><div class="detail-value">${escapeHtml(request.comment || 'Нет комментария')}</div></div>
          <div class="detail-grid"><div class="detail-label"><i class="fas fa-clock"></i> Дата создания:</div><div class="detail-value">${escapeHtml(formatDateTime(request.createdAt))}</div></div>
          <div class="detail-grid"><div class="detail-label"><i class="fas fa-history"></i> Последнее обновление:</div><div class="detail-value">${escapeHtml(formatDateTime(request.updatedAt) || 'Нет данных')}</div></div>
        </div>

        <div style="display: flex; gap: 16px; margin: 30px 0; flex-wrap: wrap;">
          ${request.status === STATUS.NEW ? `<a href="#" onclick="updateStatus('${escapeJsString(request.id)}', 'processing'); return false;" class="btn btn-primary" style="flex: 1; padding: 16px;"><i class="fas fa-play"></i> Взять в работу</a>` : ''}
          ${request.status === STATUS.PROCESSING ? `<a href="#" onclick="updateStatus('${escapeJsString(request.id)}', 'ready'); return false;" class="btn btn-success" style="flex: 1; padding: 16px;"><i class="fas fa-check"></i> Отметить готовой</a>` : ''}
          <a href="#" onclick="deleteRequest('${escapeJsString(request.id)}'); return false;" class="btn btn-danger" style="flex: 1; padding: 16px;"><i class="fas fa-trash"></i> Удалить</a>
        </div>
      `;
    }
  }
});

window.updateStatus = async (requestId, newStatus) => {
  try {
    const result = await api.patch(`/api/requests/${encodeURIComponent(requestId)}/status`, { status: newStatus });
    if (result.email?.status === 'failed') {
      alert('Статус обновлён, но письмо не отправлено. Проверьте SMTP и логи.');
    }
    window.location.reload();
  } catch (error) {
    alert(error.message);
  }
};

window.deleteRequest = async (requestId) => {
  if (!confirm('Удалить заявку?')) return;
  try {
    await api.delete(`/api/requests/${encodeURIComponent(requestId)}`);
    if (window.location.pathname.includes('view-request.html')) {
      window.location.href = './admin.html';
    } else {
      window.location.reload();
    }
  } catch (error) {
    alert(error.message);
  }
};

window.updateUserProfile = async () => {
  const userId = document.getElementById('edit-user-id')?.value;
  const payload = {
    fullname: document.getElementById('edit-fullname')?.value.trim() || '',
    email: document.getElementById('edit-email')?.value.trim() || '',
    username: document.getElementById('edit-username')?.value.trim() || '',
    group: document.getElementById('edit-group')?.value.trim() || ''
  };

  const errorDiv = document.getElementById('user-edit-error');
  hideError(errorDiv);

  try {
    await api.put(`/api/users/${encodeURIComponent(userId)}`, payload);
    alert('Данные пользователя обновлены.');
    window.location.reload();
  } catch (error) {
    showError(errorDiv, error.message);
  }
};

window.deleteUser = async (userId) => {
  if (!confirm('Удалить пользователя? Это действие нельзя отменить.')) return;
  try {
    await api.delete(`/api/users/${encodeURIComponent(userId)}`);
    window.location.href = './users.html';
  } catch (error) {
    alert(error.message);
  }
};

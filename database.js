const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data', 'db.json');

function loadDB() {
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch {
    return { users: [], schedules: [], shifts: [], swap_requests: [], notifications: [], _counters: { users: 0, schedules: 0, shifts: 0, swaps: 0, notifs: 0 } };
  }
}

function saveDB(data) {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
}

const db = {
  _data: null,

  load() { this._data = loadDB(); return this._data; },
  save() { saveDB(this._data); },
  get data() { if (!this._data) this.load(); return this._data; },

  // Users
  getUser(id) { return this.data.users.find(u => u.id === id); },
  getUserByLogin(login, password) { return this.data.users.find(u => u.login === login && u.password === password && u.active !== false); },
  getUsers(role) { return role ? this.data.users.filter(u => u.role === role) : this.data.users; },
  getAllActiveUsers() { return this.data.users.filter(u => u.active !== false); },
  addUser(user) {
    if (this.data.users.find(u => u.login === user.login)) throw new Error('Login já existe');
    user.id = ++this.data._counters.users;
    user.active = true;
    user.created_at = new Date().toISOString();
    this.data.users.push(user);
    this.save();
    return user;
  },
  updateUser(id, updates) {
    const u = this.getUser(id);
    if (!u) return null;
    Object.assign(u, updates);
    this.save();
    return u;
  },

  // Schedules - now supports 'programada' and 'executada' per month
  getSchedule(month, year, status) {
    return this.data.schedules.find(s => s.month == month && s.year == year && s.status === status);
  },
  getScheduleById(id) {
    return this.data.schedules.find(s => s.id === id);
  },
  getScheduleShifts(scheduleId) {
    return this.data.shifts.filter(s => s.schedule_id === scheduleId).map(s => {
      const doc = this.getUser(s.doctor_id);
      return { ...s, doctor_name: doc?.name || null, doctor_crm: doc?.crm || null };
    }).sort((a, b) => a.date.localeCompare(b.date) || b.period.localeCompare(a.period) || a.slot - b.slot);
  },

  // Save programada AND create/update executada as copy
  saveSchedule(month, year, shiftsData) {
    // Remove existing programada
    const existingProg = this.data.schedules.find(s => s.month == month && s.year == year && s.status === 'programada');
    if (existingProg) {
      this.data.shifts = this.data.shifts.filter(s => s.schedule_id !== existingProg.id);
      this.data.schedules = this.data.schedules.filter(s => s.id !== existingProg.id);
    }

    // Remove existing executada
    const existingExec = this.data.schedules.find(s => s.month == month && s.year == year && s.status === 'executada');
    if (existingExec) {
      this.data.shifts = this.data.shifts.filter(s => s.schedule_id !== existingExec.id);
      this.data.schedules = this.data.schedules.filter(s => s.id !== existingExec.id);
    }

    // Create programada
    const progSchedule = { id: ++this.data._counters.schedules, month: parseInt(month), year: parseInt(year), status: 'programada', created_at: new Date().toISOString() };
    this.data.schedules.push(progSchedule);

    for (const s of shiftsData) {
      this.data.shifts.push({ id: ++this.data._counters.shifts, schedule_id: progSchedule.id, date: s.date, period: s.period, slot: s.slot, doctor_id: s.doctor_id || null });
    }

    // Create executada as exact copy
    const execSchedule = { id: ++this.data._counters.schedules, month: parseInt(month), year: parseInt(year), status: 'executada', created_at: new Date().toISOString() };
    this.data.schedules.push(execSchedule);

    for (const s of shiftsData) {
      this.data.shifts.push({ id: ++this.data._counters.shifts, schedule_id: execSchedule.id, date: s.date, period: s.period, slot: s.slot, doctor_id: s.doctor_id || null });
    }

    this.save();
    return { programada: progSchedule, executada: execSchedule };
  },

  getShift(id) { return this.data.shifts.find(s => s.id === id); },
  updateShift(id, updates) {
    const s = this.getShift(id);
    if (s) Object.assign(s, updates);
    this.save();
    return s;
  },

  // Swaps
  getSwaps(userId, role) {
    let swaps = this.data.swap_requests;
    if (role !== 'admin') {
      swaps = swaps.filter(s => s.from_doctor_id === userId || s.to_doctor_id === userId);
    }
    return swaps.map(s => {
      const fromDoc = this.getUser(s.from_doctor_id);
      const toDoc = this.getUser(s.to_doctor_id);
      const shift = this.getShift(s.shift_id);
      return {
        ...s,
        from_name: fromDoc?.name, from_crm: fromDoc?.crm,
        to_name: toDoc?.name, to_crm: toDoc?.crm,
        date: shift?.date, period: shift?.period, slot: shift?.slot
      };
    }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  },
  addSwap(swap) {
    swap.id = ++this.data._counters.swaps;
    swap.status = 'pending_doctor';
    swap.doctor_confirmed = false;
    swap.admin_confirmed = false;
    swap.created_at = new Date().toISOString();
    this.data.swap_requests.push(swap);
    this.save();
    return swap;
  },
  getSwap(id) { return this.data.swap_requests.find(s => s.id === id); },
  updateSwap(id, updates) {
    const s = this.getSwap(id);
    if (s) Object.assign(s, updates);
    this.save();
    return s;
  },

  // Notifications
  getNotifications(userId) {
    return this.data.notifications.filter(n => n.user_id === userId).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 50);
  },
  getUnreadCount(userId) {
    return this.data.notifications.filter(n => n.user_id === userId && !n.read).length;
  },
  addNotification(userId, message, type, relatedSwapId) {
    const n = { id: ++this.data._counters.notifs, user_id: userId, message, type: type || 'info', read: false, related_swap_id: relatedSwapId || null, created_at: new Date().toISOString() };
    this.data.notifications.push(n);
    this.save();
    return n;
  },
  markAllRead(userId) {
    this.data.notifications.filter(n => n.user_id === userId).forEach(n => n.read = true);
    this.save();
  },

  // Confirmed dates (admin locks a day as verified)
  getConfirmedDates(scheduleId) {
    if (!this.data.confirmed_dates) this.data.confirmed_dates = [];
    return this.data.confirmed_dates.filter(c => c.schedule_id === scheduleId).map(c => c.date);
  },
  confirmDate(scheduleId, date) {
    if (!this.data.confirmed_dates) this.data.confirmed_dates = [];
    const existing = this.data.confirmed_dates.find(c => c.schedule_id === scheduleId && c.date === date);
    if (!existing) {
      this.data.confirmed_dates.push({ schedule_id: scheduleId, date, confirmed_at: new Date().toISOString() });
      this.save();
    }
  },
  unconfirmDate(scheduleId, date) {
    if (!this.data.confirmed_dates) this.data.confirmed_dates = [];
    this.data.confirmed_dates = this.data.confirmed_dates.filter(c => !(c.schedule_id === scheduleId && c.date === date));
    this.save();
  },

  // Summary - only counts shifts up to a given date
  getSummary(scheduleId, upToDate) {
    const shifts = this.data.shifts.filter(s => {
      if (s.schedule_id !== scheduleId) return false;
      if (!s.doctor_id) return false;
      if (s.period !== 'diurno') return false; // count each day once (24h)
      if (upToDate && s.date > upToDate) return false;
      return true;
    });
    const byDoctor = {};
    for (const s of shifts) {
      if (!byDoctor[s.doctor_id]) {
        const doc = this.getUser(s.doctor_id);
        byDoctor[s.doctor_id] = { id: s.doctor_id, name: doc?.name, crm: doc?.crm, total_days: 0, dates: new Set() };
      }
      byDoctor[s.doctor_id].dates.add(s.date);
    }
    return Object.values(byDoctor).map(d => ({
      id: d.id, name: d.name, crm: d.crm,
      total_days: d.dates.size,
      total_hours: d.dates.size * 24
    })).sort((a, b) => a.name.localeCompare(b.name));
  }
};

module.exports = db;

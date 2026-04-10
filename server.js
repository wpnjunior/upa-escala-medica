const express = require('express');
const session = require('express-session');
const path = require('path');
const PDFDocument = require('pdfkit');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: 'upa-maria-escala-2026',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Não autorizado' });
  next();
}
function requireAdmin(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Não autorizado' });
  if (req.session.role !== 'admin') return res.status(403).json({ error: 'Acesso negado' });
  next();
}

// ============ AUTH ============
app.post('/api/login', (req, res) => {
  const { login, password } = req.body;
  const user = db.getUserByLogin(login, password);
  if (!user) return res.status(401).json({ error: 'Login ou senha inválidos' });
  req.session.userId = user.id;
  req.session.role = user.role;
  req.session.userName = user.name;
  res.json({ id: user.id, name: user.name, role: user.role, crm: user.crm });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

app.get('/api/me', requireAuth, (req, res) => {
  const user = db.getUser(req.session.userId);
  if (!user) return res.status(401).json({ error: 'Não autorizado' });
  res.json({ id: user.id, name: user.name, crm: user.crm, login: user.login, role: user.role });
});

// ============ DOCTORS ============
app.get('/api/doctors', requireAuth, (req, res) => {
  res.json(db.getUsers('doctor').map(d => ({ id: d.id, name: d.name, crm: d.crm, login: d.login, role: d.role, active: d.active })));
});

app.get('/api/doctors/all', requireAuth, (req, res) => {
  res.json(db.data.users.map(d => ({ id: d.id, name: d.name, crm: d.crm, login: d.login, role: d.role, active: d.active })));
});

app.post('/api/doctors', requireAdmin, (req, res) => {
  try {
    const user = db.addUser({ ...req.body, role: 'doctor' });
    res.json({ id: user.id, name: user.name });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.put('/api/doctors/:id', requireAdmin, (req, res) => {
  const { name, crm, login, password, active } = req.body;
  const updates = { name, crm, login, active: active !== false };
  if (password) updates.password = password;
  db.updateUser(parseInt(req.params.id), updates);
  res.json({ ok: true });
});

app.delete('/api/doctors/:id', requireAdmin, (req, res) => {
  db.updateUser(parseInt(req.params.id), { active: false });
  res.json({ ok: true });
});

// ============ SCHEDULE ROUTES ============
// Get schedule by type: programada or executada
app.get('/api/schedule/:month/:year/:type', requireAuth, (req, res) => {
  const { month, year, type } = req.params;
  const schedule = db.getSchedule(month, year, type);
  if (!schedule) return res.json(null);
  const shifts = db.getScheduleShifts(schedule.id);
  res.json({ ...schedule, shifts });
});

// Default: returns executada (what doctors see)
app.get('/api/schedule/:month/:year', requireAuth, (req, res) => {
  const { month, year } = req.params;
  const schedule = db.getSchedule(month, year, 'executada') || db.getSchedule(month, year, 'programada');
  if (!schedule) return res.json(null);
  const shifts = db.getScheduleShifts(schedule.id);
  res.json({ ...schedule, shifts });
});

// Save programada (also creates executada copy)
app.post('/api/schedule', requireAdmin, (req, res) => {
  const { month, year, shifts } = req.body;
  const result = db.saveSchedule(month, year, shifts);
  res.json({ programada_id: result.programada.id, executada_id: result.executada.id });
});

// ============ ADMIN: EDIT EXECUTADA SHIFT DIRECTLY ============
app.put('/api/shift/:id', requireAdmin, (req, res) => {
  const { doctor_id } = req.body;
  const shift = db.getShift(parseInt(req.params.id));
  if (!shift) return res.status(404).json({ error: 'Plantão não encontrado' });

  // Block editing if day is confirmed
  const schedule = db.getScheduleById(shift.schedule_id);
  if (schedule) {
    const confirmedDates = db.getConfirmedDates(schedule.id);
    if (confirmedDates.includes(shift.date)) {
      return res.status(403).json({ error: 'Este dia já foi confirmado e travado. Desfaça a confirmação primeiro para editar.' });
    }
  }

  const oldDoctorId = shift.doctor_id;

  // Update this shift and mark as manually edited
  db.updateShift(shift.id, { doctor_id: doctor_id || null, edited: true });

  // Also update the matching period shift (diurno<->noturno, same day/slot/schedule)
  const otherPeriod = shift.period === 'diurno' ? 'noturno' : 'diurno';
  const matchingShift = db.data.shifts.find(s =>
    s.schedule_id === shift.schedule_id &&
    s.date === shift.date &&
    s.period === otherPeriod &&
    s.slot === shift.slot
  );
  if (matchingShift) {
    db.updateShift(matchingShift.id, { doctor_id: doctor_id || null, edited: true });
  }

  // Register as a swap record so it appears in the swaps list/PDF
  if (oldDoctorId !== (doctor_id || null)) {
    const swapRecord = {
      id: ++db.data._counters.swaps,
      schedule_id: shift.schedule_id,
      shift_id: shift.id,
      from_doctor_id: oldDoctorId || null,
      to_doctor_id: doctor_id || null,
      status: 'approved',
      doctor_confirmed: true,
      admin_confirmed: true,
      admin_edit: true,
      created_at: new Date().toISOString(),
      resolved_at: new Date().toISOString()
    };
    db.data.swap_requests.push(swapRecord);
    db.save();
  }

  const doc = doctor_id ? db.getUser(doctor_id) : null;
  res.json({ ok: true, doctor_name: doc?.name || null, doctor_crm: doc?.crm || null, shift_id: shift.id });
});

// Get changed shift IDs for a schedule (swaps approved + manual edits)
app.get('/api/changed-shifts/:month/:year', requireAuth, (req, res) => {
  const { month, year } = req.params;
  const execSched = db.getSchedule(month, year, 'executada');
  if (!execSched) return res.json([]);
  // Approved swaps
  const swapIds = db.data.swap_requests
    .filter(s => s.status === 'approved' && s.schedule_id === execSched.id)
    .map(s => s.shift_id);
  // Manually edited shifts
  const editedIds = db.data.shifts
    .filter(s => s.schedule_id === execSched.id && s.edited)
    .map(s => s.id);
  const allChanged = [...new Set([...swapIds, ...editedIds])];
  res.json(allChanged);
});

// ============ CONFIRMED DATES (admin locks days) ============
app.get('/api/confirmed-dates/:month/:year', requireAuth, (req, res) => {
  const { month, year } = req.params;
  const execSched = db.getSchedule(month, year, 'executada');
  if (!execSched) return res.json([]);
  res.json(db.getConfirmedDates(execSched.id));
});

app.post('/api/confirm-date', requireAdmin, (req, res) => {
  const { month, year, date } = req.body;
  const execSched = db.getSchedule(month, year, 'executada');
  if (!execSched) return res.status(404).json({ error: 'Escala não encontrada' });
  db.confirmDate(execSched.id, date);
  res.json({ ok: true });
});

app.post('/api/unconfirm-date', requireAdmin, (req, res) => {
  const { month, year, date } = req.body;
  const execSched = db.getSchedule(month, year, 'executada');
  if (!execSched) return res.status(404).json({ error: 'Escala não encontrada' });
  db.unconfirmDate(execSched.id, date);
  res.json({ ok: true });
});

// ============ SWAPS (modify executada only) ============
app.get('/api/swaps', requireAuth, (req, res) => {
  res.json(db.getSwaps(req.session.userId, req.session.role));
});

app.post('/api/swaps', requireAuth, (req, res) => {
  const { shift_id, to_doctor_id } = req.body;
  const shift = db.getShift(shift_id);
  if (!shift) return res.status(404).json({ error: 'Plantão não encontrado' });
  if (shift.doctor_id !== req.session.userId) return res.status(403).json({ error: 'Você só pode trocar seus próprios plantões' });

  const swap = db.addSwap({ schedule_id: shift.schedule_id, shift_id, from_doctor_id: req.session.userId, to_doctor_id });
  db.addNotification(to_doctor_id,
    `${req.session.userName} solicitou troca de plantão 24h (${shift.date})`,
    'swap_request', swap.id);
  res.json({ id: swap.id });
});

app.post('/api/swaps/:id/confirm-doctor', requireAuth, (req, res) => {
  const swap = db.getSwap(parseInt(req.params.id));
  if (!swap) return res.status(404).json({ error: 'Troca não encontrada' });
  if (swap.to_doctor_id !== req.session.userId) return res.status(403).json({ error: 'Acesso negado' });

  db.updateSwap(swap.id, { doctor_confirmed: true, status: 'pending_admin' });

  const admins = db.getUsers('admin');
  const fromDoc = db.getUser(swap.from_doctor_id);
  const toDoc = db.getUser(swap.to_doctor_id);
  const shift = db.getShift(swap.shift_id);

  for (const admin of admins) {
    db.addNotification(admin.id,
      `Troca confirmada por ${toDoc.name}: ${fromDoc.name} -> ${toDoc.name} (${shift.date} - Plantão 24h). Aguardando sua aprovação.`,
      'swap_pending_admin', swap.id);
  }
  res.json({ ok: true });
});

app.post('/api/swaps/:id/reject-doctor', requireAuth, (req, res) => {
  const swap = db.getSwap(parseInt(req.params.id));
  if (!swap) return res.status(404).json({ error: 'Troca não encontrada' });
  if (swap.to_doctor_id !== req.session.userId) return res.status(403).json({ error: 'Acesso negado' });

  db.updateSwap(swap.id, { status: 'rejected', resolved_at: new Date().toISOString() });
  db.addNotification(swap.from_doctor_id, `${req.session.userName} recusou sua solicitação de troca.`, 'swap_rejected', swap.id);
  res.json({ ok: true });
});

// Approve swap: updates EXECUTADA schedule
app.post('/api/swaps/:id/approve', requireAdmin, (req, res) => {
  const swap = db.getSwap(parseInt(req.params.id));
  if (!swap) return res.status(404).json({ error: 'Troca não encontrada' });

  db.updateSwap(swap.id, { admin_confirmed: true, status: 'approved', resolved_at: new Date().toISOString() });

  // Update the shift in executada
  db.updateShift(swap.shift_id, { doctor_id: swap.to_doctor_id });

  // Also update the matching noturno shift (same day, same slot, same schedule)
  const origShift = db.getShift(swap.shift_id);
  if (origShift) {
    const otherPeriod = origShift.period === 'diurno' ? 'noturno' : 'diurno';
    const matchingShift = db.data.shifts.find(s =>
      s.schedule_id === origShift.schedule_id &&
      s.date === origShift.date &&
      s.period === otherPeriod &&
      s.slot === origShift.slot
    );
    if (matchingShift) {
      db.updateShift(matchingShift.id, { doctor_id: swap.to_doctor_id });
    }
  }

  const fromDoc = db.getUser(swap.from_doctor_id);
  const toDoc = db.getUser(swap.to_doctor_id);
  db.addNotification(swap.from_doctor_id, `Troca aprovada: ${fromDoc.name} -> ${toDoc.name}`, 'swap_approved');
  db.addNotification(swap.to_doctor_id, `Troca aprovada: ${fromDoc.name} -> ${toDoc.name}`, 'swap_approved');
  res.json({ ok: true });
});

app.post('/api/swaps/:id/reject', requireAdmin, (req, res) => {
  const swap = db.getSwap(parseInt(req.params.id));
  if (!swap) return res.status(404).json({ error: 'Troca não encontrada' });

  db.updateSwap(swap.id, { status: 'rejected', resolved_at: new Date().toISOString() });
  db.addNotification(swap.from_doctor_id, 'Troca negada pela diretora.', 'swap_rejected');
  db.addNotification(swap.to_doctor_id, 'Troca negada pela diretora.', 'swap_rejected');
  res.json({ ok: true });
});

// Delete swap history (only resolved ones)
app.delete('/api/swaps/history', requireAdmin, (req, res) => {
  const before = db.data.swap_requests.length;
  db.data.swap_requests = db.data.swap_requests.filter(s => s.status === 'pending_doctor' || s.status === 'pending_admin');
  db.save();
  const deleted = before - db.data.swap_requests.length;
  res.json({ ok: true, deleted });
});

// Delete single swap from history
app.delete('/api/swaps/:id', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  const swap = db.getSwap(id);
  if (!swap) return res.status(404).json({ error: 'Troca não encontrada' });
  if (swap.status === 'pending_doctor' || swap.status === 'pending_admin') {
    return res.status(400).json({ error: 'Não é possível deletar trocas pendentes. Rejeite-a primeiro.' });
  }
  db.data.swap_requests = db.data.swap_requests.filter(s => s.id !== id);
  db.save();
  res.json({ ok: true });
});

// PDF of swaps
app.get('/api/pdf/swaps/:month/:year', requireAuth, (req, res) => {
  const { month, year } = req.params;
  const allSwaps = db.data.swap_requests.map(s => {
    const fromDoc = db.getUser(s.from_doctor_id);
    const toDoc = db.getUser(s.to_doctor_id);
    const shift = db.getShift(s.shift_id);
    const schedule = shift ? db.getScheduleById(shift.schedule_id) : null;
    return {
      ...s,
      from_name: fromDoc?.name, from_crm: fromDoc?.crm,
      to_name: toDoc?.name, to_crm: toDoc?.crm,
      date: shift?.date, schedule_month: schedule?.month, schedule_year: schedule?.year
    };
  });

  // Filter by month/year
  const swaps = allSwaps.filter(s => s.schedule_month == month && s.schedule_year == year)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  const monthNames = ['', 'Janeiro', 'Fevereiro', 'Marco', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const labels = { pending_doctor: 'Aguardando Medico', pending_admin: 'Aguardando Diretora', approved: 'Aprovada', rejected: 'Rejeitada' };

  const doc = new PDFDocument({ size: 'A4', layout: 'portrait', margin: 30 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=Trocas_${monthNames[month]}_${year}.pdf`);
  doc.pipe(res);

  doc.fontSize(16).font('Helvetica-Bold').text('RELATORIO DE TROCAS DE PLANTAO', { align: 'center' });
  doc.fontSize(12).text(`UPA AGDA MARIA - ${monthNames[month].toUpperCase()} ${year}`, { align: 'center' });
  doc.moveDown();

  if (swaps.length === 0) {
    doc.fontSize(12).font('Helvetica').text('Nenhuma troca registrada neste periodo.', { align: 'center' });
  } else {
    // Table header
    const headers = ['Data Plantao', 'De (Medico)', 'CRM', 'Para (Medico)', 'CRM', 'Tipo', 'Status', 'Data Solicitacao'];
    const widths = [60, 85, 60, 85, 60, 45, 60, 75];
    let sx = 30;
    let y = doc.y;

    doc.fontSize(7).font('Helvetica-Bold');
    doc.rect(30, y - 2, widths.reduce((a, b) => a + b, 0), 14).fill('#e8f0fe');
    doc.fill('#000');
    for (let i = 0; i < headers.length; i++) {
      doc.text(headers[i], sx, y, { width: widths[i], align: 'center' });
      sx += widths[i];
    }
    y += 16;

    doc.font('Helvetica').fontSize(7);
    for (const s of swaps) {
      if (y > 780) { doc.addPage(); y = 30; }

      // Alternate row colors
      if (swaps.indexOf(s) % 2 === 0) {
        doc.rect(30, y - 2, widths.reduce((a, b) => a + b, 0), 12).fill('#f8f9fa');
        doc.fill('#000');
      }

      const statusColor = s.status === 'approved' ? '#28a745' : s.status === 'rejected' ? '#dc3545' : '#856404';

      sx = 30;
      const tipoLabel = s.admin_edit ? 'Ed. Direta' : 'Troca';
      const vals = [
        s.date ? s.date.split('-').reverse().join('/') : '',
        (s.from_name || 'Vazio').substring(0, 16),
        (s.from_crm || '').replace('CRM ', ''),
        (s.to_name || 'Vazio').substring(0, 16),
        (s.to_crm || '').replace('CRM ', ''),
        tipoLabel,
        labels[s.status] || s.status,
        s.created_at ? new Date(s.created_at).toLocaleDateString('pt-BR') : ''
      ];
      for (let i = 0; i < vals.length; i++) {
        if (i === 5) {
          const tipoColor = s.admin_edit ? '#1a73e8' : '#555';
          doc.fill(tipoColor).text(String(vals[i]), sx, y, { width: widths[i], align: 'center' }).fill('#000');
        } else if (i === 6) {
          doc.fill(statusColor).text(String(vals[i]), sx, y, { width: widths[i], align: 'center' }).fill('#000');
        } else {
          doc.text(String(vals[i]), sx, y, { width: widths[i], align: 'center' });
        }
        sx += widths[i];
      }
      y += 12;
    }

    // Summary
    y += 10;
    doc.moveTo(30, y).lineTo(30 + widths.reduce((a, b) => a + b, 0), y).stroke();
    y += 8;
    const approved = swaps.filter(s => s.status === 'approved').length;
    const rejected = swaps.filter(s => s.status === 'rejected').length;
    const pending = swaps.filter(s => s.status === 'pending_doctor' || s.status === 'pending_admin').length;
    const adminEdits = swaps.filter(s => s.admin_edit).length;
    const doctorSwaps = swaps.filter(s => !s.admin_edit).length;
    doc.fontSize(9).font('Helvetica-Bold');
    doc.text(`Total: ${swaps.length}   |   Trocas: ${doctorSwaps}   |   Ed. Diretas: ${adminEdits}   |   Aprovadas: ${approved}   |   Rejeitadas: ${rejected}   |   Pendentes: ${pending}`, 30, y, { align: 'center' });
  }

  doc.end();
});

// ============ NOTIFICATIONS ============
app.get('/api/notifications', requireAuth, (req, res) => {
  res.json(db.getNotifications(req.session.userId));
});
app.get('/api/notifications/unread-count', requireAuth, (req, res) => {
  res.json({ count: db.getUnreadCount(req.session.userId) });
});
app.post('/api/notifications/read', requireAuth, (req, res) => {
  db.markAllRead(req.session.userId);
  res.json({ ok: true });
});

// ============ SUMMARY (programados + executados até hoje) ============
app.get('/api/summary/:month/:year', requireAuth, (req, res) => {
  const { month, year } = req.params;
  const progSched = db.getSchedule(month, year, 'programada');
  const execSched = db.getSchedule(month, year, 'executada');
  if (!progSched && !execSched) return res.json(null);

  const today = new Date().toISOString().split('T')[0];

  // Programados: all days (full month)
  const progSummary = progSched ? db.getSummary(progSched.id, null) : [];
  // Executados: only past days
  const execSummary = execSched ? db.getSummary(execSched.id, today) : [];

  // Merge into one table
  const allDoctorIds = new Set();
  const progMap = {};
  const execMap = {};
  for (const r of progSummary) { progMap[r.id] = r; allDoctorIds.add(r.id); }
  for (const r of execSummary) { execMap[r.id] = r; allDoctorIds.add(r.id); }

  const merged = [];
  for (const id of allDoctorIds) {
    const p = progMap[id] || {};
    const e = execMap[id] || {};
    merged.push({
      id,
      name: p.name || e.name,
      crm: p.crm || e.crm,
      plantoes_programados: p.total_days || 0,
      plantoes_executados: e.total_days || 0,
      horas_executadas: e.total_hours || 0
    });
  }
  merged.sort((a, b) => a.name.localeCompare(b.name));

  res.json({ merged, upToDate: today });
});

// Full summary (all days, for PDF)
app.get('/api/summary-full/:month/:year/:type', requireAuth, (req, res) => {
  const { month, year, type } = req.params;
  const schedule = db.getSchedule(month, year, type);
  if (!schedule) return res.json(null);
  const summary = db.getSummary(schedule.id, null); // no date filter
  res.json({ schedule, summary });
});

// ============ PDF GENERATION ============
app.get('/api/pdf/:month/:year/:type', requireAuth, (req, res) => {
  const { month, year, type } = req.params;
  const schedule = db.getSchedule(month, year, type);
  if (!schedule) return res.status(404).json({ error: 'Escala não encontrada' });

  const shifts = db.getScheduleShifts(schedule.id);
  const today = new Date().toISOString().split('T')[0];
  const summaryUpTo = type === 'executada' ? today : null;
  const summary = db.getSummary(schedule.id, summaryUpTo);

  const monthNames = ['', 'Janeiro', 'Fevereiro', 'Marco', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
  const typeLabel = type === 'programada' ? 'PROGRAMADA' : 'EXECUTADA';

  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=Escala_${typeLabel}_${monthNames[month]}_${year}.pdf`);
  doc.pipe(res);

  doc.fontSize(16).font('Helvetica-Bold').text('ESCALA MEDICA - UPA AGDA MARIA (PEDIATRICA)', { align: 'center' });
  doc.fontSize(14).text(`${monthNames[month].toUpperCase()} ${year} - ESCALA ${typeLabel}`, { align: 'center' });
  doc.moveDown(0.5);

  // Only diurno (24h shifts)
  const byDate = {};
  for (const s of shifts) {
    if (s.period === 'diurno') {
      if (!byDate[s.date]) byDate[s.date] = [];
      byDate[s.date].push(s);
    }
  }
  const dates = Object.keys(byDate).sort();

  const weeks = [];
  let currentWeek = [];
  for (const dateStr of dates) {
    const d = new Date(dateStr + 'T12:00:00');
    if (d.getDay() === 0 && currentWeek.length > 0) { weeks.push(currentWeek); currentWeek = []; }
    currentWeek.push(dateStr);
  }
  if (currentWeek.length > 0) weeks.push(currentWeek);

  const colWidth = 105;
  const startX = 30;
  let y = doc.y;

  for (const week of weeks) {
    if (y > 400) { doc.addPage(); y = 30; }

    doc.fontSize(7).font('Helvetica-Bold');
    for (let i = 0; i < week.length; i++) {
      const d = new Date(week[i] + 'T12:00:00');
      const dayNum = week[i].split('-')[2];
      const mon = week[i].split('-')[1];
      doc.text(`${dayNames[d.getDay()]} ${dayNum}/${mon}`, startX + i * colWidth, y, { width: colWidth - 5, align: 'center' });
    }
    y += 12;
    doc.moveTo(startX, y).lineTo(startX + week.length * colWidth, y).stroke();

    doc.fontSize(6).font('Helvetica-Bold').text('PLANTAO 24h (8h-8h)', startX, y + 2);
    y += 10;
    doc.font('Helvetica').fontSize(6);
    const maxD = Math.max(...week.map(d => (byDate[d] || []).length), 1);
    for (let row = 0; row < maxD; row++) {
      for (let i = 0; i < week.length; i++) {
        const docs2 = byDate[week[i]] || [];
        if (docs2[row]) {
          const dName = (docs2[row].doctor_name || '---').substring(0, 22);
          const dCrm = docs2[row].doctor_crm || '';
          doc.font('Helvetica-Bold').fontSize(6).text(dName, startX + i * colWidth, y, { width: colWidth - 5, align: 'center' });
          if (dCrm) {
            doc.font('Helvetica').fontSize(5).text(dCrm, startX + i * colWidth, y + 7, { width: colWidth - 5, align: 'center' });
          }
        }
      }
      y += 16;
    }

    y += 10;
    doc.moveTo(startX, y).lineTo(startX + week.length * colWidth, y).stroke();
    y += 5;
  }

  // Summary
  doc.addPage();
  const sumTitle = type === 'executada' ? `RESUMO DE PLANTOES REALIZADOS (ate ${today.split('-').reverse().join('/')})` : 'RESUMO DE PLANTOES PROGRAMADOS';
  doc.fontSize(14).font('Helvetica-Bold').text(sumTitle, { align: 'center' });
  doc.moveDown();

  const headers = ['Medico', 'CRM', 'Plantoes (24h)', 'Dias Trabalhados', 'Total Horas'];
  const widths = [220, 100, 100, 100, 100];
  let sx = 30; y = doc.y;

  doc.fontSize(8).font('Helvetica-Bold');
  for (let i = 0; i < headers.length; i++) {
    doc.text(headers[i], sx, y, { width: widths[i], align: 'center' });
    sx += widths[i];
  }
  y += 15;
  doc.moveTo(30, y).lineTo(30 + widths.reduce((a, b) => a + b, 0), y).stroke();
  y += 5;

  doc.font('Helvetica').fontSize(7);
  for (const row of summary) {
    sx = 30;
    const vals = [row.name, row.crm || '', row.total_days, row.total_days, row.total_hours + 'h'];
    for (let i = 0; i < vals.length; i++) {
      doc.text(String(vals[i]), sx, y, { width: widths[i], align: 'center' });
      sx += widths[i];
    }
    y += 12;
  }

  doc.end();
});

// Backward compat: default PDF is executada
app.get('/api/pdf/:month/:year', requireAuth, (req, res) => {
  req.params.type = 'executada';
  res.redirect(`/api/pdf/${req.params.month}/${req.params.year}/executada`);
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log('');
  console.log('========================================');
  console.log('  UPA Agda Maria - Sistema de Escalas');
  console.log('  http://localhost:' + PORT);
  console.log('========================================');
  console.log('  Admin: eliete / 123456');
  console.log('');
});

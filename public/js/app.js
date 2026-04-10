// ============ STATE ============
let currentUser = null;
let currentMonth = 4;
let currentYear = 2026;
let currentPage = 'calendar';
let doctors = [];

const monthNames = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const dayNamesFull = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

// ============ MOBILE MENU ============
(function setupMobileMenu() {
  const hamburger = document.getElementById('hamburgerBtn');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  function closeSidebar() { sidebar.classList.remove('open'); overlay.classList.remove('show'); }
  function openSidebar() { sidebar.classList.add('open'); overlay.classList.add('show'); }
  if (hamburger) {
    hamburger.addEventListener('click', () => { sidebar.classList.contains('open') ? closeSidebar() : openSidebar(); });
  }
  if (overlay) overlay.addEventListener('click', closeSidebar);
  // Close sidebar on nav click (mobile)
  if (sidebar) sidebar.addEventListener('click', (e) => {
    if (e.target.closest('a[data-page]') && window.innerWidth <= 768) closeSidebar();
  });
  // Show hamburger on mobile
  function checkMobile() {
    if (hamburger) hamburger.style.display = window.innerWidth <= 768 ? 'flex' : 'none';
  }
  window.addEventListener('resize', checkMobile);
  checkMobile();
})();

async function api(url, opts = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' }, ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  if (res.status === 401) { showLogin(); return null; }
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || 'Erro'); }
  if (res.headers.get('content-type')?.includes('json')) return res.json();
  return res;
}

// ============ AUTH ============
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const user = await api('/api/login', { method: 'POST', body: { login: document.getElementById('loginUser').value.trim(), password: document.getElementById('loginPass').value } });
    if (user) { currentUser = user; showApp(); }
  } catch (err) { document.getElementById('loginError').textContent = err.message; }
});
document.getElementById('logoutBtn').addEventListener('click', async () => { if(!confirm('Tem certeza que deseja sair do sistema?')) return; await api('/api/logout', { method: 'POST' }); currentUser = null; showLogin(); });

function showLogin() { document.getElementById('loginScreen').classList.remove('hidden'); document.getElementById('appScreen').classList.add('hidden'); }

async function showApp() {
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('appScreen').classList.remove('hidden');
  document.getElementById('userName').textContent = currentUser.name;
  document.getElementById('userRole').textContent = currentUser.role === 'admin' ? 'Diretora Médica' : 'Médico(a)';
  document.getElementById('adminMenu').classList.toggle('hidden', currentUser.role !== 'admin');
  doctors = await api('/api/doctors/all') || [];
  loadNotifications();
  navigateTo('calendar');
}

(async () => { try { const u = await api('/api/me'); if (u) { currentUser = u; showApp(); } } catch(e){} })();

// ============ NAVIGATION ============
document.getElementById('sidebar').addEventListener('click', (e) => {
  const link = e.target.closest('a[data-page]'); if (!link) return; e.preventDefault(); navigateTo(link.dataset.page);
});
function navigateTo(page) {
  currentPage = page;
  document.querySelectorAll('#sidebar a').forEach(a => a.classList.toggle('active', a.dataset.page === page));
  const c = document.getElementById('mainContent');
  switch(page) {
    case 'calendar': renderCalendar(c); break;
    case 'scale': renderScale(c); break;
    case 'swaps': renderSwaps(c); break;
    case 'summary': renderSummary(c); break;
    case 'admin-scale': renderAdminScale(c); break;
    case 'admin-doctors': renderAdminDoctors(c); break;
    case 'admin-swaps': renderAdminSwaps(c); break;
  }
}

// ============ NOTIFICATIONS ============
let notifOpen = false;
document.getElementById('notifBtn').addEventListener('click', () => { notifOpen = !notifOpen; document.getElementById('notifPanel').classList.toggle('show', notifOpen); if(notifOpen) loadNotifications(); });
document.getElementById('markReadBtn').addEventListener('click', async () => { await api('/api/notifications/read',{method:'POST'}); document.getElementById('notifCount').classList.add('hidden'); document.querySelectorAll('.notif-item').forEach(el=>el.classList.remove('unread')); });
document.addEventListener('click', (e) => { if(!e.target.closest('#notifPanel')&&!e.target.closest('#notifBtn')){notifOpen=false;document.getElementById('notifPanel').classList.remove('show');} });

async function loadNotifications() {
  const [notifs, cd] = await Promise.all([api('/api/notifications'), api('/api/notifications/unread-count')]);
  if(!notifs) return;
  const badge = document.getElementById('notifCount');
  if(cd.count>0){badge.textContent=cd.count;badge.classList.remove('hidden');}else{badge.classList.add('hidden');}
  const list = document.getElementById('notifList');
  list.innerHTML = notifs.length===0 ? '<div style="padding:20px;text-align:center;color:#999;">Nenhuma notificação</div>' :
    notifs.map(n=>`<div class="notif-item ${n.read?'':'unread'}"><div>${n.message}</div><div class="notif-time">${formatDate(n.created_at)}</div></div>`).join('');
}
setInterval(loadNotifications, 30000);

// Helper: get unique doctors per date (diurno only)
function getDoctorsByDate(shifts) {
  const byDate = {};
  if(!shifts) return byDate;
  for(const s of shifts) { if(s.period==='diurno') { if(!byDate[s.date]) byDate[s.date]=[]; byDate[s.date].push(s); } }
  return byDate;
}

function changeMonth(delta) { currentMonth+=delta; if(currentMonth>12){currentMonth=1;currentYear++;} if(currentMonth<1){currentMonth=12;currentYear--;} }

// ============ CALENDAR (shows executada) ============
async function renderCalendar(el) {
  el.innerHTML = `
    <div class="month-selector">
      <button class="btn btn-secondary" id="prevMonth">&larr;</button>
      <h2>${monthNames[currentMonth]} ${currentYear}</h2>
      <button class="btn btn-secondary" id="nextMonth">&rarr;</button>
    </div>
    <div class="card"><div class="calendar-grid" id="calendarGrid"></div></div>`;

  document.getElementById('prevMonth').onclick = () => { changeMonth(-1); renderCalendar(el); };
  document.getElementById('nextMonth').onclick = () => { changeMonth(1); renderCalendar(el); };

  const [schedule, changedShifts, confirmedDates] = await Promise.all([
    api(`/api/schedule/${currentMonth}/${currentYear}`),
    api(`/api/changed-shifts/${currentMonth}/${currentYear}`),
    api(`/api/confirmed-dates/${currentMonth}/${currentYear}`)
  ]);
  const changedSet = new Set(changedShifts || []);
  const confirmedSet = new Set(confirmedDates || []);
  const grid = document.getElementById('calendarGrid');
  const today = new Date().toISOString().split('T')[0];
  const isAdmin = currentUser?.role === 'admin';

  dayNames.forEach(d => { grid.innerHTML += `<div class="calendar-header">${d}</div>`; });
  const firstDay = new Date(currentYear, currentMonth-1, 1).getDay();
  const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
  for(let i=0;i<firstDay;i++) grid.innerHTML += '<div class="calendar-day empty"></div>';

  // Legend
  if (isAdmin) {
    el.querySelector('.card').insertAdjacentHTML('beforebegin', `
      <div style="display:flex;flex-wrap:wrap;gap:12px;justify-content:center;margin-bottom:10px;font-size:11px;">
        <span><span style="display:inline-block;width:12px;height:12px;background:#f0f0f0;border:1px solid #ccc;border-radius:2px;vertical-align:middle;"></span> Dia passado</span>
        <span><span style="display:inline-block;width:12px;height:12px;background:#e3f2fd;border:2px solid var(--primary);border-radius:2px;vertical-align:middle;"></span> Hoje</span>
        <span><span style="display:inline-block;width:12px;height:12px;background:#fef3e2;border:2px solid #e67e22;border-radius:2px;vertical-align:middle;"></span> Alteração</span>
        <span><span style="display:inline-block;width:12px;height:12px;background:#d4edda;border:2px solid #28a745;border-radius:2px;vertical-align:middle;"></span> ✅ Confirmado/Travado</span>
      </div>
    `);
  }

  const byDate = getDoctorsByDate(schedule?.shifts);

  for(let d=1; d<=daysInMonth; d++) {
    const dateStr = `${currentYear}-${String(currentMonth).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const docs = byDate[dateStr] || [];
    const isPast = dateStr <= today;
    const isToday = dateStr === today;
    const isConfirmed = confirmedSet.has(dateStr);
    let dayBg = '';
    if (isConfirmed) dayBg = 'background:#d4edda;border:2px solid #28a745;';
    else if (isToday) dayBg = 'background:#e3f2fd;border:2px solid var(--primary);';
    else if (isPast) dayBg = 'background:#f0f0f0;';
    let html = `<div class="calendar-day" data-date="${dateStr}" style="${dayBg}">`;
    html += `<div class="day-num">${d}`;
    if (isConfirmed) html += ' <span style="font-size:8px;color:#28a745;font-weight:700;">🔒</span>';
    else if (isToday) html += ' <span style="font-size:8px;color:var(--primary);font-weight:700;">HOJE</span>';
    else if (isPast) html += ' <span style="font-size:8px;color:#999;">&#10003;</span>';
    html += '</div>';
    if(docs.length>0) {
      docs.forEach(s => {
        const isOwn = s.doctor_id===currentUser?.id;
        const isChanged = changedSet.has(s.id);
        const name = s.doctor_name ? s.doctor_name.split(' ').slice(0,2).join(' ') : '---';
        const crm = s.doctor_crm ? `<span style="font-size:8px;display:block;opacity:0.7;">${s.doctor_crm}</span>` : '';
        let badgeStyle = '';
        if (isConfirmed) badgeStyle = 'font-weight:600;background:#d4edda;border:1px solid #28a745;';
        else if (isChanged) badgeStyle = 'font-weight:700;border:2px solid #e67e22;background:#fef3e2;';
        else if (isOwn) badgeStyle = 'font-weight:700;border:2px solid var(--primary);background:#d2e3fc;';
        html += `<span class="shift-badge shift-diurno" style="${badgeStyle}">${name}${crm}${isChanged&&!isConfirmed?'<span style="font-size:7px;color:#e67e22;display:block;">⟳ Alterado</span>':''}</span>`;
      });
    }
    if(!schedule) html += '<div style="font-size:10px;color:#999;margin-top:8px;">Sem escala</div>';
    html += '</div>';
    grid.innerHTML += html;
  }

  grid.querySelectorAll('.calendar-day:not(.empty)').forEach(dayEl => {
    dayEl.addEventListener('click', () => { if(schedule) showDayDetail(dayEl.dataset.date, schedule, changedSet, confirmedSet); });
  });
}

function showDayDetail(date, schedule, changedSet, confirmedSet) {
  const shifts = schedule.shifts.filter(s => s.date===date && s.period==='diurno');
  const d = new Date(date+'T12:00:00');
  const [y,m,day] = date.split('-');
  const today = new Date().toISOString().split('T')[0];
  const isPast = date <= today;
  const isAdmin = currentUser?.role === 'admin';
  const isConfirmed = confirmedSet && confirmedSet.has(date);

  let html = `<div class="card"><div class="card-header"><h2>${dayNamesFull[d.getDay()]} - ${day}/${m}/${y}</h2>`;
  if (isConfirmed) html += `<span style="background:#28a745;color:white;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600;">🔒 CONFIRMADO</span>`;
  else if (isPast) html += `<span style="background:#f0f0f0;color:#666;padding:4px 12px;border-radius:20px;font-size:12px;">Dia passado - Pendente confirmação</span>`;
  html += `</div>`;

  html += `<h3 style="margin:12px 0 8px;font-size:14px;color:var(--primary);">Plantão 24h (8h às 8h)</h3>`;
  html += '<div style="display:flex;flex-wrap:wrap;gap:8px;">';
  shifts.forEach(s => {
    const isOwn = s.doctor_id===currentUser?.id;
    const isChanged = changedSet && changedSet.has(s.id);
    let borderColor = isOwn ? 'var(--primary)' : 'var(--border)';
    let bgColor = isOwn ? '#e8f0fe' : 'white';
    if (isConfirmed) { borderColor = '#28a745'; bgColor = '#d4edda'; }
    else if (isChanged) { borderColor = '#e67e22'; bgColor = '#fef3e2'; }
    html += `<div style="padding:10px 16px;border-radius:8px;border:2px solid ${borderColor};background:${bgColor};min-width:180px;">`;
    html += `<div style="font-weight:600;font-size:13px;">${s.doctor_name||'---'}</div>`;
    html += `<div style="font-size:11px;color:var(--text-light);">${s.doctor_crm||''}</div>`;
    if (isChanged && !isConfirmed) html += `<div style="font-size:10px;color:#e67e22;margin-top:4px;">⟳ Alterado</div>`;
    if (isConfirmed) html += `<div style="font-size:10px;color:#28a745;margin-top:4px;">✅ Conferido</div>`;
    if(isOwn && !isConfirmed) html += `<button class="btn btn-sm btn-warning" style="margin-top:8px;" onclick="openSwapModal(${s.id},'${s.doctor_name}','${date}')">Solicitar Troca</button>`;
    html += '</div>';
  });
  html += '</div>';

  // Admin: confirm/unconfirm button for past days
  if (isAdmin && isPast && schedule) {
    html += '<div style="margin-top:16px;padding:16px;border-radius:8px;background:#f8f9fa;border:1px solid var(--border);">';
    if (isConfirmed) {
      html += `<div style="display:flex;align-items:center;gap:12px;">
        <span style="font-size:13px;color:#28a745;font-weight:600;">🔒 Dia confirmado e travado para a prefeitura</span>
        <button class="btn btn-sm btn-warning" onclick="unconfirmDay('${date}')">Destravar Dia</button>
      </div>`;
    } else {
      html += `<div style="display:flex;align-items:center;gap:12px;">
        <span style="font-size:13px;color:#666;">Confirme este dia para travar a escala executada e enviar para a prefeitura.</span>
        <button class="btn btn-sm btn-success" onclick="confirmDay('${date}')" style="padding:8px 20px;font-size:13px;">✅ Confirmar Dia</button>
      </div>`;
    }
    html += '</div>';
  }

  html += '</div><button class="btn btn-secondary" onclick="navigateTo(\'calendar\')" style="margin-top:10px;">Voltar</button>';
  document.getElementById('mainContent').innerHTML = html;
}

window.confirmDay = async function(date) {
  if(!confirm(`Tem certeza que deseja CONFIRMAR e TRAVAR o dia ${formatDateBR(date)}?\n\nOs plantões deste dia serão travados e não poderão ser alterados até destravar.`)) return;
  try {
    await api('/api/confirm-date', { method: 'POST', body: { month: currentMonth, year: currentYear, date } });
    alert(`✅ Dia ${formatDateBR(date)} confirmado e travado com sucesso!`);
    navigateTo('calendar');
  } catch(e) { alert('Erro: ' + e.message); }
};

window.unconfirmDay = async function(date) {
  if(!confirm(`Tem certeza que deseja DESTRAVAR o dia ${formatDateBR(date)}?\n\nOs plantões deste dia poderão ser alterados novamente.`)) return;
  try {
    await api('/api/unconfirm-date', { method: 'POST', body: { month: currentMonth, year: currentYear, date } });
    alert(`Dia ${formatDateBR(date)} destravado.`);
    navigateTo('calendar');
  } catch(e) { alert('Erro: ' + e.message); }
};

// ============ SWAP MODAL ============
let pendingSwapShiftId = null;
window.openSwapModal = function(shiftId, doctorName, date) {
  pendingSwapShiftId = shiftId;
  document.getElementById('swapModalInfo').innerHTML = `<p style="margin-bottom:12px;"><strong>Plantão 24h:</strong> ${formatDateBR(date)}</p><p style="margin-bottom:12px;"><strong>Seu nome:</strong> ${doctorName}</p>`;
  const select = document.getElementById('swapDoctorSelect');
  select.innerHTML = '<option value="">Selecione o médico...</option>';
  doctors.filter(d=>d.id!==currentUser.id&&d.role==='doctor'&&d.active).forEach(d=>{ select.innerHTML+=`<option value="${d.id}">${d.name} - ${d.crm||''}</option>`; });
  document.getElementById('swapModal').classList.add('show');
};
document.getElementById('swapCancelBtn').addEventListener('click', () => document.getElementById('swapModal').classList.remove('show'));
document.getElementById('swapConfirmBtn').addEventListener('click', async () => {
  const toDoctorId = parseInt(document.getElementById('swapDoctorSelect').value);
  if(!toDoctorId){alert('Selecione um médico!');return;}
  const selectedDoc = doctors.find(d=>d.id===toDoctorId);
  if(!confirm(`Tem certeza que deseja solicitar troca com ${selectedDoc?.name||''}?\n\nA troca precisará ser confirmada pelo médico e aprovada pela diretora.`)) return;
  try { await api('/api/swaps',{method:'POST',body:{shift_id:pendingSwapShiftId,to_doctor_id:toDoctorId}}); document.getElementById('swapModal').classList.remove('show'); alert('✅ Troca enviada com sucesso! Aguardando confirmação.'); loadNotifications(); }
  catch(err){alert('Erro: '+err.message);}
});

// ============ SCALE PAGE (admin sees both, doctors see executada) ============
async function renderScale(el) {
  const isAdmin = currentUser?.role === 'admin';
  el.innerHTML = `
    <div class="month-selector">
      <button class="btn btn-secondary" id="scalePrev">&larr;</button>
      <h2>${monthNames[currentMonth]} ${currentYear}</h2>
      <button class="btn btn-secondary" id="scaleNext">&rarr;</button>
    </div>
    ${isAdmin ? `
    <div class="tabs" id="scaleTabs">
      <div class="tab active" data-tab="programada">Escala Programada</div>
      <div class="tab" data-tab="executada">Escala Executada</div>
    </div>` : ''}
    <div style="margin-bottom:12px;text-align:right;">
      ${isAdmin ? `
      <a class="btn btn-success btn-sm" id="pdfProgBtn" href="/api/pdf/${currentMonth}/${currentYear}/programada" target="_blank">PDF Programada</a>
      <a class="btn btn-primary btn-sm" id="pdfExecBtn" href="/api/pdf/${currentMonth}/${currentYear}/executada" target="_blank">PDF Executada</a>
      ` : `<a class="btn btn-success btn-sm" href="/api/pdf/${currentMonth}/${currentYear}/executada" target="_blank">Gerar PDF</a>`}
    </div>
    <div class="card" id="scaleContent"><div class="loading">Carregando...</div></div>`;

  document.getElementById('scalePrev').onclick = () => { changeMonth(-1); renderScale(el); };
  document.getElementById('scaleNext').onclick = () => { changeMonth(1); renderScale(el); };

  let activeTab = isAdmin ? 'programada' : 'executada';

  async function loadScale(type) {
    const container = document.getElementById('scaleContent');
    const [schedule, changedShifts, confirmedDates] = await Promise.all([
      api(`/api/schedule/${currentMonth}/${currentYear}/${type}`),
      type === 'executada' ? api(`/api/changed-shifts/${currentMonth}/${currentYear}`) : Promise.resolve([]),
      type === 'executada' ? api(`/api/confirmed-dates/${currentMonth}/${currentYear}`) : Promise.resolve([])
    ]);
    if(!schedule){container.innerHTML='<p style="text-align:center;color:#999;padding:40px;">Escala não disponível.</p>';return;}
    const changedSet = new Set(changedShifts || []);
    const confirmedSet = new Set(confirmedDates || []);
    const today = new Date().toISOString().split('T')[0];

    const byDate = getDoctorsByDate(schedule.shifts);
    const dates = Object.keys(byDate).sort();
    const weeks=[]; let cw=[];
    for(const ds of dates){const d=new Date(ds+'T12:00:00');if(d.getDay()===0&&cw.length>0){weeks.push(cw);cw=[];}cw.push(ds);}
    if(cw.length>0)weeks.push(cw);

    const typeLabel = type==='programada' ? 'PROGRAMADA' : 'EXECUTADA';
    const canEdit = isAdmin && type === 'executada';
    let html = `<div style="text-align:center;margin-bottom:12px;">
      <span style="font-size:13px;font-weight:600;color:${type==='programada'?'#856404':'var(--primary)'};">ESCALA ${typeLabel}</span>
      ${canEdit ? '<br><span style="font-size:11px;color:var(--text-light);">Clique em qualquer médico para alterar</span>' : ''}
    </div>`;
    if (type === 'executada') {
      html += `<div style="display:flex;gap:16px;justify-content:center;margin-bottom:10px;font-size:11px;">
        <span><span style="display:inline-block;width:12px;height:12px;background:#f0f0f0;border:1px solid #ccc;border-radius:2px;vertical-align:middle;"></span> Dia passado</span>
        <span><span style="display:inline-block;width:12px;height:12px;background:#e3f2fd;border:2px solid var(--primary);border-radius:2px;vertical-align:middle;"></span> Hoje</span>
        <span><span style="display:inline-block;width:12px;height:12px;background:#fef3e2;border:2px solid #e67e22;border-radius:2px;vertical-align:middle;"></span> Troca/Alteração</span>
      </div>`;
    }

    weeks.forEach((week,wi) => {
      html += `<h3 style="margin:16px 0 8px;">Semana ${wi+1}</h3>`;
      html += '<table class="scale-table"><thead><tr><th></th>';
      week.forEach(ds => {
        const d=new Date(ds+'T12:00:00');
        const isPast = ds < today;
        const isToday = ds === today;
        const isConf = confirmedSet.has(ds);
        let thStyle = '';
        if (isConf) thStyle = 'background:#d4edda;color:#28a745;font-weight:700;';
        else if (isToday) thStyle = 'background:#e3f2fd;color:var(--primary);font-weight:700;';
        else if (isPast) thStyle = 'background:#f0f0f0;color:#888;';
        html += `<th style="${thStyle}">${dayNames[d.getDay()]} ${ds.split('-')[2]}/${String(currentMonth).padStart(2,'0')}${isConf?' 🔒':''}${isToday&&!isConf?' ★':''}</th>`;
      });
      html += '</tr></thead><tbody><tr><td class="period-label" style="background:#d2e3fc;color:#1a73e8;">PLANTÃO<br>24h<br>(8h-8h)</td>';
      week.forEach(ds => {
        const docs = byDate[ds]||[];
        const isPast = ds < today;
        const isToday = ds === today;
        const isConf = confirmedSet.has(ds);
        let tdStyle = '';
        if (isConf) tdStyle = 'background:#d4edda;';
        else if (isToday) tdStyle = 'background:#e3f2fd;';
        else if (isPast) tdStyle = 'background:#f8f8f8;';
        html += `<td style="${tdStyle}">`;
        docs.forEach(s => {
          const isOwn = s.doctor_id===currentUser?.id;
          const isChanged = changedSet.has(s.id);
          let cellClass = 'doctor-cell';
          if (isConf) cellClass += ' confirmed-cell';
          else if (isChanged) cellClass += ' changed-cell';
          else if (isOwn) cellClass += ' own';
          // Only allow editing if NOT confirmed
          if (canEdit && !isConf) cellClass += ' editable-cell';
          const editAttr = (canEdit && !isConf) ? `data-shift-id="${s.id}" style="cursor:pointer;" title="Clique para alterar"` : `title="${s.doctor_name||''}\n${s.doctor_crm||''}${isConf?'\n🔒 Dia confirmado':''}"`;
          html += `<div class="${cellClass}" ${editAttr}>${s.doctor_name?s.doctor_name.split(' ').slice(0,2).join(' '):'---'}<span style="font-size:8px;display:block;color:var(--text-light);">${s.doctor_crm||''}</span>${isConf?'<span style="font-size:7px;color:#28a745;">🔒</span>':''}${isChanged&&!isConf?'<span style="font-size:7px;color:#e67e22;">⟳</span>':''}</div>`;
        });
        html += '</td>';
      });
      html += '</tr></tbody></table>';
    });
    container.innerHTML = html;

    // Admin can click to edit executada cells
    if (canEdit) {
      container.querySelectorAll('.editable-cell').forEach(cell => {
        cell.addEventListener('click', () => {
          if (cell.querySelector('select')) return;
          const shiftId = cell.dataset.shiftId;
          const currentShift = schedule.shifts.find(s=>s.id===parseInt(shiftId));
          const currentDocName = currentShift?.doctor_name || 'Vazio';
          const options = doctors.filter(d=>d.active!==0).map(d=>`<option value="${d.id}">${d.name} - ${d.crm||''}</option>`).join('');
          const currentDocId = currentShift?.doctor_id || '';
          cell.innerHTML = `<select style="width:100%;font-size:10px;padding:2px;" class="exec-select">
            <option value="">-- Vazio --</option>${options}</select>`;
          const sel = cell.querySelector('select');
          if (currentDocId) sel.value = currentDocId;
          sel.focus();

          async function saveChange() {
            const newDocId = sel.value ? parseInt(sel.value) : null;
            const newDoc = newDocId ? doctors.find(d=>d.id===newDocId) : null;
            const newName = newDoc ? newDoc.name : 'Vazio';
            if (!confirm(`Tem certeza que deseja alterar a escala executada?\n\nDe: ${currentDocName}\nPara: ${newName}\nData: ${formatDateBR(currentShift?.date)}`)) {
              // Restore original cell
              const origDoc = currentDocId ? doctors.find(d=>d.id===parseInt(currentDocId)) : null;
              cell.innerHTML = `${origDoc ? origDoc.name.split(' ').slice(0,2).join(' ') : '---'}<span style="font-size:8px;display:block;color:var(--text-light);">${origDoc?.crm||''}</span>`;
              return;
            }
            try {
              const result = await api(`/api/shift/${shiftId}`, { method: 'PUT', body: { doctor_id: newDocId } });
              if (result) {
                cell.innerHTML = `${newDoc ? newDoc.name.split(' ').slice(0,2).join(' ') : '---'}<span style="font-size:8px;display:block;color:var(--text-light);">${newDoc?.crm||''}</span><span style="font-size:7px;color:#e67e22;">⟳</span>`;
                cell.classList.add('changed-cell');
                cell.classList.remove('own');
                // Update the shift in local data
                const sh = schedule.shifts.find(s=>s.id===parseInt(shiftId));
                if(sh) { sh.doctor_id = newDocId; sh.doctor_name = newDoc?.name||null; sh.doctor_crm = newDoc?.crm||null; }
                changedSet.add(parseInt(shiftId));
              }
            } catch(e) { alert('Erro: ' + e.message); loadScale(type); }
          }

          sel.addEventListener('change', saveChange);
          sel.addEventListener('blur', () => { setTimeout(() => { if(cell.querySelector('select')) saveChange(); }, 150); });
        });
      });
    }
  }

  loadScale(activeTab);

  if(isAdmin) {
    document.getElementById('scaleTabs').addEventListener('click', (e) => {
      const tab = e.target.closest('.tab');
      if(!tab) return;
      document.querySelectorAll('#scaleTabs .tab').forEach(t=>t.classList.remove('active'));
      tab.classList.add('active');
      activeTab = tab.dataset.tab;
      loadScale(activeTab);
    });
  }
}

// ============ SWAPS ============
async function renderSwaps(el) {
  el.innerHTML = `<div class="card"><div class="card-header" style="display:flex;justify-content:space-between;align-items:center;">
    <h2>Minhas Trocas</h2>
    <a class="btn btn-success btn-sm" href="/api/pdf/swaps/${currentMonth}/${currentYear}" target="_blank">📄 PDF das Trocas</a>
  </div><div id="swapsList"><div class="loading">Carregando...</div></div></div>`;
  const swaps = await api('/api/swaps');
  const list = document.getElementById('swapsList');
  if(!swaps||swaps.length===0){list.innerHTML='<p style="color:#999;text-align:center;padding:20px;">Nenhuma troca.</p>';return;}
  list.innerHTML = swaps.map(s => {
    const labels = {pending_doctor:'Aguardando Médico',pending_admin:'Aguardando Diretora',approved:'Aprovada',rejected:'Rejeitada'};
    let actions = '';
    if(s.status==='pending_doctor'&&s.to_doctor_id===currentUser?.id) actions = `<button class="btn btn-sm btn-success" onclick="confirmSwapDoctor(${s.id})">Aceitar</button><button class="btn btn-sm btn-danger" onclick="rejectSwapDoctor(${s.id})">Recusar</button>`;
    return `<div class="swap-item"><div class="swap-info"><div class="swap-doctors">${s.from_name} <span style="font-size:11px;color:var(--text-light);">(${s.from_crm||''})</span> &rarr; ${s.to_name} <span style="font-size:11px;color:var(--text-light);">(${s.to_crm||''})</span></div><div class="swap-detail">${formatDateBR(s.date)} - Plantão 24h | ${formatDate(s.created_at)}</div></div><div class="swap-actions"><span class="swap-status ${s.status}">${labels[s.status]}</span>${actions}</div></div>`;
  }).join('');
}
window.confirmSwapDoctor = async function(id){if(!confirm('Tem certeza que deseja ACEITAR esta troca de plantão?\n\nApós aceitar, a troca será enviada para aprovação da diretora.'))return;try{await api(`/api/swaps/${id}/confirm-doctor`,{method:'POST'});alert('✅ Troca confirmada! Aguardando aprovação da diretora.');renderSwaps(document.getElementById('mainContent'));loadNotifications();}catch(e){alert(e.message);}};
window.rejectSwapDoctor = async function(id){if(!confirm('Tem certeza que deseja RECUSAR esta troca de plantão?\n\nEsta ação não pode ser desfeita.'))return;try{await api(`/api/swaps/${id}/reject-doctor`,{method:'POST'});alert('Troca recusada.');renderSwaps(document.getElementById('mainContent'));}catch(e){alert(e.message);}};

// ============ SUMMARY (only past shifts) ============
async function renderSummary(el) {
  el.innerHTML = `
    <div class="month-selector">
      <button class="btn btn-secondary" id="sumPrev">&larr;</button>
      <h2>${monthNames[currentMonth]} ${currentYear}</h2>
      <button class="btn btn-secondary" id="sumNext">&rarr;</button>
      <a class="btn btn-success btn-sm" href="/api/pdf/${currentMonth}/${currentYear}/executada" target="_blank">PDF Executada</a>
    </div>
    <div class="card" id="summaryContent"><div class="loading">Carregando...</div></div>`;
  document.getElementById('sumPrev').onclick = () => { changeMonth(-1); renderSummary(el); };
  document.getElementById('sumNext').onclick = () => { changeMonth(1); renderSummary(el); };

  const data = await api(`/api/summary/${currentMonth}/${currentYear}`);
  const c = document.getElementById('summaryContent');
  if(!data){c.innerHTML='<p style="text-align:center;color:#999;padding:40px;">Sem dados.</p>';return;}

  const today = data.upToDate || new Date().toISOString().split('T')[0];
  let totalProg=0, totalExec=0, totalHoras=0;
  data.merged.forEach(r=>{totalProg+=r.plantoes_programados;totalExec+=r.plantoes_executados;totalHoras+=r.horas_executadas;});

  let html = `<div style="margin-bottom:12px;text-align:center;"><span style="font-size:12px;color:var(--text-light);">Plantões executados contabilizados até <strong>${formatDateBR(today)}</strong></span></div>`;
  html += `<table class="summary-table"><thead><tr>
    <th>Médico</th><th>CRM</th><th>Plantões Programados</th><th>Plantões Executados</th><th>Horas Executadas</th>
  </tr></thead><tbody>`;
  data.merged.forEach(r => {
    html += `<tr>
      <td style="text-align:left;font-weight:600;">${r.name}</td>
      <td>${r.crm||''}</td>
      <td>${r.plantoes_programados}</td>
      <td>${r.plantoes_executados}</td>
      <td>${r.horas_executadas}h</td>
    </tr>`;
  });
  html += `<tr class="total-row"><td colspan="2" style="text-align:right;">TOTAL</td><td>${totalProg}</td><td>${totalExec}</td><td>${totalHoras}h</td></tr></tbody></table>`;
  c.innerHTML = html;
}

// ============ ADMIN: DOCTORS ============
async function renderAdminDoctors(el) {
  el.innerHTML = `<div class="card"><div class="card-header"><h2>Gerenciar Médicos</h2><button class="btn btn-primary" id="addDoctorBtn">+ Novo Médico</button></div><div id="doctorsTable"></div></div>
    <div class="modal-overlay" id="doctorModal"><div class="modal"><h2 id="doctorModalTitle">Novo Médico</h2>
    <div class="form-group"><label>Nome Completo</label><input type="text" id="docName"></div>
    <div class="form-group"><label>CRM</label><input type="text" id="docCRM" placeholder="Ex: CRM 5260179-3"></div>
    <div class="form-group"><label>Login</label><input type="text" id="docLogin"></div>
    <div class="form-group"><label>Senha</label><input type="text" id="docPassword" value="123456"></div>
    <div class="modal-actions"><button class="btn btn-secondary" id="docCancelBtn">Cancelar</button><button class="btn btn-primary" id="docSaveBtn">Salvar</button></div></div></div>`;

  const allDocs = await api('/api/doctors');
  let html = '<table class="summary-table"><thead><tr><th>Nome</th><th>CRM</th><th>Login</th><th>Status</th><th>Ações</th></tr></thead><tbody>';
  (allDocs||[]).forEach(d => { html += `<tr><td style="text-align:left;">${d.name}</td><td>${d.crm||''}</td><td>${d.login}</td><td>${d.active?'<span style="color:var(--success);">Ativo</span>':'<span style="color:var(--danger);">Inativo</span>'}</td><td><button class="btn btn-sm btn-secondary" onclick="editDoctor(${d.id})">Editar</button>${d.active?`<button class="btn btn-sm btn-danger" onclick="deactivateDoctor(${d.id})">Desativar</button>`:''}</td></tr>`; });
  html += '</tbody></table>';
  document.getElementById('doctorsTable').innerHTML = html;

  let editingId = null;
  document.getElementById('addDoctorBtn').onclick = () => { editingId=null; document.getElementById('doctorModalTitle').textContent='Novo Médico'; ['docName','docCRM','docLogin'].forEach(id=>document.getElementById(id).value=''); document.getElementById('docPassword').value='123456'; document.getElementById('doctorModal').classList.add('show'); };
  document.getElementById('docCancelBtn').onclick = () => document.getElementById('doctorModal').classList.remove('show');
  window.editDoctor = function(id) { const doc=(allDocs||[]).find(d=>d.id===id); if(!doc)return; editingId=id; document.getElementById('doctorModalTitle').textContent='Editar'; document.getElementById('docName').value=doc.name; document.getElementById('docCRM').value=doc.crm||''; document.getElementById('docLogin').value=doc.login; document.getElementById('docPassword').value=''; document.getElementById('doctorModal').classList.add('show'); };
  window.deactivateDoctor = async function(id){const doc=(allDocs||[]).find(d=>d.id===id);if(!confirm(`Tem certeza que deseja DESATIVAR o médico?\n\nNome: ${doc?.name||''}\nCRM: ${doc?.crm||''}\n\nO médico não poderá mais acessar o sistema.`))return;await api(`/api/doctors/${id}`,{method:'DELETE'});alert('Médico desativado.');renderAdminDoctors(el);};
  document.getElementById('docSaveBtn').onclick = async () => {
    const d = {name:document.getElementById('docName').value.trim(),crm:document.getElementById('docCRM').value.trim(),login:document.getElementById('docLogin').value.trim(),password:document.getElementById('docPassword').value,active:true};
    if(!d.name||!d.login){alert('Preencha nome e login!');return;}
    const actionLabel = editingId ? 'salvar as alterações deste médico' : 'cadastrar este novo médico';
    if(!confirm(`Tem certeza que deseja ${actionLabel}?\n\nNome: ${d.name}\nCRM: ${d.crm}\nLogin: ${d.login}`)) return;
    try{if(editingId){await api(`/api/doctors/${editingId}`,{method:'PUT',body:d});}else{if(!d.password){alert('Senha obrigatória!');return;}await api('/api/doctors',{method:'POST',body:d});}document.getElementById('doctorModal').classList.remove('show');doctors=await api('/api/doctors/all')||[];alert('✅ Médico salvo com sucesso!');renderAdminDoctors(el);}catch(e){alert(e.message);}
  };
}

// ============ ADMIN: CREATE/EDIT SCALE (with typing option) ============
async function renderAdminScale(el) {
  el.innerHTML = `<div class="card">
    <div class="card-header"><h2>Criar/Editar Escala Programada</h2></div>
    <div class="month-selector">
      <button class="btn btn-secondary" id="asPrev">&larr;</button>
      <h2>${monthNames[currentMonth]} ${currentYear}</h2>
      <button class="btn btn-secondary" id="asNext">&rarr;</button>
    </div>
    <div style="margin-bottom:12px;display:flex;align-items:center;gap:12px;">
      <button class="btn btn-warning btn-sm" id="copyPrevBtn">Copiar Escala do Mês Anterior</button>
      <span style="font-size:12px;color:var(--text-light);">Arraste médicos ou clique no slot para selecionar. Ao salvar, cria Programada + Executada.</span>
    </div>
    <div class="scale-editor">
      <div class="doctor-palette" id="doctorPalette"><h3>Médicos</h3><div id="paletteList"></div></div>
      <div class="week-editor" id="weekEditor"></div>
    </div>
    <div style="margin-top:20px;text-align:center;">
      <button class="btn btn-primary" id="saveScaleBtn" style="padding:14px 40px;font-size:16px;">Salvar Escala Programada</button>
    </div></div>`;

  document.getElementById('asPrev').onclick = () => { changeMonth(-1); renderAdminScale(el); };
  document.getElementById('asNext').onclick = () => { changeMonth(1); renderAdminScale(el); };

  // COPY FROM PREVIOUS MONTH
  document.getElementById('copyPrevBtn').onclick = async () => {
    let prevMonth = currentMonth - 1;
    let prevYear = currentYear;
    if (prevMonth < 1) { prevMonth = 12; prevYear--; }

    const prevSchedule = await api(`/api/schedule/${prevMonth}/${prevYear}/programada`);
    if (!prevSchedule || !prevSchedule.shifts || prevSchedule.shifts.length === 0) {
      alert(`Não existe escala programada para ${monthNames[prevMonth]} ${prevYear}.`);
      return;
    }

    if (!confirm(`Copiar a escala de ${monthNames[prevMonth]} ${prevYear} para ${monthNames[currentMonth]} ${currentYear}?\n\nOs médicos serão copiados baseado no dia da semana (segunda com segunda, terça com terça, etc).`)) return;

    // Build map: dayOfWeek -> slot -> doctor_id from previous month
    const prevByDow = {};
    for (const s of prevSchedule.shifts) {
      if (s.period !== 'diurno') continue;
      const d = new Date(s.date + 'T12:00:00');
      const dow = d.getDay();
      if (!prevByDow[dow]) prevByDow[dow] = {};
      // Use the first occurrence of each dow+slot
      if (!prevByDow[dow][s.slot]) {
        prevByDow[dow][s.slot] = { id: s.doctor_id, name: s.doctor_name, crm: s.doctor_crm||'' };
      }
    }

    // Fill current month slots
    const slots = document.querySelectorAll('#weekEditor .slot');
    slots.forEach(slot => {
      const key = slot.dataset.key;
      const match = key.match(/(\d{4})-(\d{2})-(\d{2})-(\d+)/);
      if (!match) return;
      const [, y, m, d, slotNum] = match;
      const date = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
      const dow = date.getDay();
      const prev = prevByDow[dow]?.[parseInt(slotNum)];
      if (prev && prev.id) {
        slot.dataset.doctorId = prev.id;
        slot.classList.add('filled');
        slot.innerHTML = `${prev.name.split(' ').slice(0, 2).join(' ')}<span style="font-size:8px;display:block;opacity:0.7;">${prev.crm||''}</span><span class="remove-doc">&times;</span>`;
      }
    });

    alert(`Escala copiada de ${monthNames[prevMonth]} ${prevYear}! Revise e clique em Salvar.`);
  };

  // Palette
  const palette = document.getElementById('paletteList');
  doctors.filter(d=>d.active!==0).forEach(d => {
    const chip = document.createElement('div');
    chip.className='doctor-chip'; chip.innerHTML=`${d.name.split(' ').slice(0,2).join(' ')}<span style="font-size:9px;display:block;opacity:0.7;">${d.crm||''}</span>`;
    chip.dataset.doctorId=d.id; chip.dataset.doctorName=d.name; chip.dataset.doctorCrm=d.crm||''; chip.draggable=true;
    chip.addEventListener('dragstart', e=>{e.dataTransfer.setData('text/plain',JSON.stringify({id:d.id,name:d.name,crm:d.crm||''}));chip.classList.add('dragging');});
    chip.addEventListener('dragend', ()=>chip.classList.remove('dragging'));
    palette.appendChild(chip);
  });

  // Load existing programada
  const existing = await api(`/api/schedule/${currentMonth}/${currentYear}/programada`);
  const editorSlots = {};
  if(existing?.shifts) { for(const s of existing.shifts) { if(s.period==='diurno') editorSlots[`${s.date}-${s.slot}`]={id:s.doctor_id,name:s.doctor_name,crm:s.doctor_crm||''}; } }

  const editor = document.getElementById('weekEditor');
  const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
  const weeks=[]; let week=[];
  for(let d=1;d<=daysInMonth;d++){const dt=new Date(currentYear,currentMonth-1,d);if(dt.getDay()===0&&week.length>0){weeks.push(week);week=[];}week.push(d);}
  if(week.length>0) weeks.push(week);

  weeks.forEach((weekDays,wi) => {
    let html = `<h3 style="margin:16px 0 8px;">Semana ${wi+1}</h3><table><thead><tr><th></th>`;
    weekDays.forEach(d=>{const dt=new Date(currentYear,currentMonth-1,d);html+=`<th>${dayNames[dt.getDay()]} ${String(d).padStart(2,'0')}/${String(currentMonth).padStart(2,'0')}</th>`;});
    html += '</tr></thead><tbody><tr><td style="background:#d2e3fc;font-weight:600;font-size:10px;text-align:center;padding:4px;color:#1a73e8;">PLANTÃO<br>24h</td>';

    weekDays.forEach(d => {
      const dateStr = `${currentYear}-${String(currentMonth).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      html += '<td>';
      for(let slot=1;slot<=4;slot++) {
        const key = `${dateStr}-${slot}`;
        const ex = editorSlots[key];
        const filled = ex&&ex.id ? 'filled' : '';
        const name = ex ? ex.name?.split(' ').slice(0,2).join(' ')||'' : '';
        const docId = ex ? ex.id : '';
        const crmInfo = ex?.crm || '';
        html += `<div class="slot ${filled}" data-key="${key}" data-doctor-id="${docId}" title="Clique para selecionar ou arraste um médico">`;
        html += name ? `${name}<span style="font-size:8px;display:block;opacity:0.7;">${crmInfo}</span><span class="remove-doc">&times;</span>` : `Slot ${slot}`;
        html += '</div>';
      }
      html += '</td>';
    });
    html += '</tr></tbody></table>';
    editor.innerHTML += html;
  });

  // Drag & drop
  editor.querySelectorAll('.slot').forEach(slot => {
    slot.addEventListener('dragover', e=>{e.preventDefault();slot.classList.add('drag-over');});
    slot.addEventListener('dragleave', ()=>slot.classList.remove('drag-over'));
    slot.addEventListener('drop', e=>{
      e.preventDefault(); slot.classList.remove('drag-over');
      try{const d=JSON.parse(e.dataTransfer.getData('text/plain'));fillSlot(slot,d.id,d.name,d.crm);}catch(err){}
    });

    // CLICK TO SELECT (single click)
    slot.addEventListener('click', (ev)=>{
      if(ev.target.classList.contains('remove-doc')) return;
      if(slot.querySelector('select')) return;
      const options = doctors.filter(d=>d.active!==0).map(d=>`<option value="${d.id}">${d.name} - ${d.crm||''}</option>`).join('');
      const currentId = slot.dataset.doctorId;
      slot.innerHTML = `<select style="width:100%;font-size:10px;padding:2px;" class="slot-select">
        <option value="">-- Selecione --</option>${options}</select>`;
      const sel = slot.querySelector('select');
      if(currentId) sel.value = currentId;
      sel.focus();
      sel.addEventListener('change', ()=>{
        const id = parseInt(sel.value);
        if(id) { const doc = doctors.find(d=>d.id===id); fillSlot(slot,id,doc.name,doc.crm); }
        else { clearSlot(slot); }
      });
      sel.addEventListener('blur', ()=>{
        setTimeout(()=>{
          if(slot.querySelector('select')){
            const id = parseInt(sel.value);
            if(id){const doc=doctors.find(d=>d.id===id);fillSlot(slot,id,doc.name,doc.crm);}
            else clearSlot(slot);
          }
        },150);
      });
    });
  });

  function fillSlot(slot, id, name, crm) {
    slot.dataset.doctorId = id;
    slot.classList.add('filled');
    const doc = doctors.find(d=>d.id===id);
    const crmText = crm || doc?.crm || '';
    slot.innerHTML = `${name.split(' ').slice(0,2).join(' ')}<span style="font-size:8px;display:block;opacity:0.7;">${crmText}</span><span class="remove-doc">&times;</span>`;
  }
  function clearSlot(slot) {
    const slotNum = slot.dataset.key.split('-').pop();
    slot.dataset.doctorId = '';
    slot.classList.remove('filled');
    slot.innerHTML = `Slot ${slotNum}`;
  }

  editor.addEventListener('click', e=>{
    if(e.target.classList.contains('remove-doc')){
      e.stopPropagation();
      clearSlot(e.target.closest('.slot'));
    }
  });

  // Save: creates BOTH programada and executada
  document.getElementById('saveScaleBtn').onclick = async () => {
    const shifts = [];
    editor.querySelectorAll('.slot').forEach(slot => {
      const key = slot.dataset.key;
      const match = key.match(/(\d{4})-(\d{2})-(\d{2})-(\d+)/);
      if(!match) return;
      const [,y,m,d,slotNum] = match;
      const doctorId = slot.dataset.doctorId ? parseInt(slot.dataset.doctorId) : null;
      const date = `${y}-${m}-${d}`;
      shifts.push({date,period:'diurno',slot:parseInt(slotNum),doctor_id:doctorId});
      shifts.push({date,period:'noturno',slot:parseInt(slotNum),doctor_id:doctorId});
    });
    if(!confirm(`Tem certeza que deseja salvar a escala programada de ${monthNames[currentMonth]} ${currentYear}?\n\nIsso irá criar/substituir a escala PROGRAMADA e a EXECUTADA.`)) return;
    try{await api('/api/schedule',{method:'POST',body:{month:currentMonth,year:currentYear,shifts}});alert('✅ Escala Programada salva com sucesso!\nExecutada criada como cópia.');}catch(e){alert(e.message);}
  };
}

// ============ ADMIN: APPROVE SWAPS ============
async function renderAdminSwaps(el) {
  el.innerHTML = `<div class="card">
    <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
      <h2>Aprovar Trocas</h2>
      <div style="display:flex;gap:8px;">
        <a class="btn btn-success btn-sm" href="/api/pdf/swaps/${currentMonth}/${currentYear}" target="_blank">📄 PDF das Trocas</a>
        <button class="btn btn-danger btn-sm" id="clearHistoryBtn">🗑 Limpar Histórico</button>
      </div>
    </div>
    <div id="adminSwapsList"><div class="loading">Carregando...</div></div>
  </div>`;

  document.getElementById('clearHistoryBtn').onclick = async () => {
    if(!confirm('Tem certeza que deseja DELETAR todo o histórico de trocas?\n\nApenas trocas já finalizadas (aprovadas/rejeitadas) serão removidas.\nTrocas pendentes NÃO serão afetadas.\n\nEsta ação não pode ser desfeita!')) return;
    try {
      const result = await api('/api/swaps/history', { method: 'DELETE' });
      alert(`✅ Histórico limpo! ${result.deleted} registro(s) removido(s).`);
      renderAdminSwaps(el);
    } catch(e) { alert('Erro: ' + e.message); }
  };

  const swaps = await api('/api/swaps');
  const list = document.getElementById('adminSwapsList');
  const pending = (swaps||[]).filter(s=>s.status==='pending_admin');
  const pendingDoc = (swaps||[]).filter(s=>s.status==='pending_doctor');
  const others = (swaps||[]).filter(s=>s.status!=='pending_admin'&&s.status!=='pending_doctor');
  if(!pending.length&&!pendingDoc.length&&!others.length){list.innerHTML='<p style="color:#999;text-align:center;padding:20px;">Nenhuma troca.</p>';return;}
  let html = '';
  if(pending.length>0){html+='<h3 style="margin-bottom:12px;color:var(--warning);">Aguardando Sua Aprovação</h3>';html+=pending.map(s=>swapItemHTML(s,true)).join('');}
  if(pendingDoc.length>0){html+='<h3 style="margin:20px 0 12px;color:#6c757d;">Aguardando Confirmação do Médico</h3>';html+=pendingDoc.map(s=>swapItemHTML(s,false)).join('');}
  if(others.length>0){
    html+='<h3 style="margin:20px 0 12px;">Histórico</h3>';
    html+=others.map(s=>swapItemHTML(s,false,true)).join('');
  }
  list.innerHTML = html;
}

function swapItemHTML(s, showActions, showDelete) {
  const labels={pending_doctor:'Aguardando Médico',pending_admin:'Aguardando Aprovação',approved:'Aprovada',rejected:'Rejeitada'};
  let actions = '';
  if (showActions) actions = `<button class="btn btn-sm btn-success" onclick="approveSwap(${s.id})">Aprovar</button><button class="btn btn-sm btn-danger" onclick="rejectSwap(${s.id})">Rejeitar</button>`;
  const deleteBtn = showDelete ? `<button class="btn btn-sm btn-secondary" onclick="deleteSwap(${s.id})" title="Remover do histórico" style="padding:2px 8px;font-size:10px;">✕</button>` : '';
  const isAdminEdit = s.admin_edit;
  const typeTag = isAdminEdit ? '<span style="font-size:9px;background:#e3f2fd;color:var(--primary);padding:2px 6px;border-radius:4px;margin-left:6px;">Edição Direta</span>' : '';
  const fromName = s.from_name || '<em style="color:#999;">Vazio</em>';
  const toName = s.to_name || '<em style="color:#999;">Vazio</em>';
  const fromCrm = s.from_crm ? `<span style="font-size:11px;color:var(--text-light);">(${s.from_crm})</span>` : '';
  const toCrm = s.to_crm ? `<span style="font-size:11px;color:var(--text-light);">(${s.to_crm})</span>` : '';
  return `<div class="swap-item"><div class="swap-info"><div class="swap-doctors">${fromName} ${fromCrm} &rarr; ${toName} ${toCrm}${typeTag}</div><div class="swap-detail">${formatDateBR(s.date)} - Plantão 24h | ${formatDate(s.created_at)}</div></div><div class="swap-actions"><span class="swap-status ${s.status}">${labels[s.status]}</span>${actions}${deleteBtn}</div></div>`;
}
window.approveSwap = async function(id){if(!confirm('Tem certeza que deseja APROVAR esta troca?\n\nA escala executada será atualizada automaticamente com esta mudança.'))return;try{await api(`/api/swaps/${id}/approve`,{method:'POST'});alert('✅ Troca aprovada! Escala executada atualizada.');renderAdminSwaps(document.getElementById('mainContent'));loadNotifications();}catch(e){alert(e.message);}};
window.rejectSwap = async function(id){if(!confirm('Tem certeza que deseja REJEITAR esta troca?\n\nAmbos os médicos serão notificados da rejeição.'))return;try{await api(`/api/swaps/${id}/reject`,{method:'POST'});alert('Troca rejeitada.');renderAdminSwaps(document.getElementById('mainContent'));}catch(e){alert(e.message);}};
window.deleteSwap = async function(id){if(!confirm('Tem certeza que deseja remover esta troca do histórico?\n\nEsta ação não pode ser desfeita.'))return;try{await api(`/api/swaps/${id}`,{method:'DELETE'});renderAdminSwaps(document.getElementById('mainContent'));}catch(e){alert('Erro: '+e.message);}};

// ============ HELPERS ============
function formatDate(s){if(!s)return '';const d=new Date(s);return d.toLocaleDateString('pt-BR')+' '+d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});}
function formatDateBR(s){if(!s)return '';const p=s.split('-');return `${p[2]}/${p[1]}/${p[0]}`;}

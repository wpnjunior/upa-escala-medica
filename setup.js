const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data', 'db.json');

const data = {
  users: [],
  schedules: [],
  shifts: [],
  swap_requests: [],
  notifications: [],
  _counters: { users: 0, schedules: 0, shifts: 0, swaps: 0, notifs: 0 }
};

let userId = 0;
let shiftId = 0;
let schedId = 0;

function addUser(name, crm, login, password, role) {
  const user = { id: ++userId, name, crm, login, password, role, active: true, created_at: new Date().toISOString() };
  data.users.push(user);
  return user;
}

addUser('ELIETE GOMES ANSEL', 'CRM 52409210', 'eliete', '123456', 'admin');

const doctorList = [
  ['ERIKA S. DE ABRIL', 'CRM 52712116-0', 'erika'],
  ['ACYR PIRES', 'CRM 5260179-3', 'acyr'],
  ['GABRIEL C. LOUZADA', 'CRM 5201124196', 'gabriel'],
  ['FLAVIA REZENDE', 'CRM 5200748110', 'flavia'],
  ['KELLY C. M. S. GAMA SILVA', 'CRM 5201108000', 'kelly'],
  ['PRISCILA S. CONCEICAO', 'CRM 521074598', 'priscila'],
  ['WAGNER PEREIRA', 'CRM 520127554-2', 'wagner'],
  ['ROSIANE MACIEL', 'CRM 52135917-7', 'rosiane'],
  ['CARLOS HENRIQUE MIRANDA', 'CRM 52597389', 'carlos'],
  ['MARCELO A. AGUIAR', 'CRM 5204227-0', 'marcelo'],
  ['LUIZ EDUARDO S. GARCIA', 'CRM 521313282', 'luiz'],
  ['GABRIELLA MOTO', 'CRM 52135143-5', 'gabriella'],
  ['GEOVANA RODRIGUES', 'CRM 5201289306', 'geovana'],
  ['LUCAS FERREIRA BARBOSA', 'CRM 520131702-4', 'lucas'],
  ['NILO SEBE TONZAR', 'CRM 5241353-6', 'nilo'],
  ['BRUNA BARBIERI', 'CRM 5292202-1', 'bruna'],
  ['MARIA BRENDA DE MOURA', 'CRM 520016917', 'brenda'],
  ['ANNA LUISA T. PIVETTA', 'CRM 520131327-4', 'anna'],
  ['ROSANE SALOMAO', 'CRM 520131641-9', 'rosane'],
  ['ISIS FABIANA GIL DE LIMA', 'CRM 5213746667', 'isis'],
  ['VINICIUS MULT DE ANDRADE', 'CRM 5252804-7', 'vinicius'],
];

for (const [name, crm, login] of doctorList) {
  addUser(name, crm, login, '123456', 'doctor');
}

data._counters.users = userId;

const nameToId = {};
for (const u of data.users) nameToId[u.name] = u.id;
function did(name) { return nameToId[name] || null; }

// Weekly patterns
const patA = {
  0: ['ERIKA S. DE ABRIL', 'ACYR PIRES', 'GABRIEL C. LOUZADA', 'FLAVIA REZENDE'],
  1: ['ERIKA S. DE ABRIL', 'ACYR PIRES', 'ELIETE GOMES ANSEL', 'ROSANE SALOMAO'],
  2: ['KELLY C. M. S. GAMA SILVA', 'PRISCILA S. CONCEICAO', 'WAGNER PEREIRA', 'ROSIANE MACIEL'],
  3: ['CARLOS HENRIQUE MIRANDA', 'KELLY C. M. S. GAMA SILVA', 'MARCELO A. AGUIAR', 'LUIZ EDUARDO S. GARCIA'],
  4: ['GABRIELLA MOTO', 'GEOVANA RODRIGUES', 'MARCELO A. AGUIAR', 'LUCAS FERREIRA BARBOSA'],
  5: ['NILO SEBE TONZAR', 'BRUNA BARBIERI', 'ROSIANE MACIEL', 'MARIA BRENDA DE MOURA'],
  6: ['ANNA LUISA T. PIVETTA', 'FLAVIA REZENDE', 'ROSANE SALOMAO', 'GABRIEL C. LOUZADA']
};
const patB = {
  0: ['ACYR PIRES', 'ELIETE GOMES ANSEL', 'GABRIEL C. LOUZADA', 'FLAVIA REZENDE'],
  1: ['ACYR PIRES', 'ELIETE GOMES ANSEL', 'ERIKA S. DE ABRIL', 'WAGNER PEREIRA'],
  2: ['WAGNER PEREIRA', 'KELLY C. M. S. GAMA SILVA', 'PRISCILA S. CONCEICAO', 'GABRIEL C. LOUZADA'],
  3: ['KELLY C. M. S. GAMA SILVA', 'MARCELO A. AGUIAR', 'LUIZ EDUARDO S. GARCIA', 'CARLOS HENRIQUE MIRANDA'],
  4: ['GABRIELLA MOTO', 'GEOVANA RODRIGUES', 'MARCELO A. AGUIAR', 'LUCAS FERREIRA BARBOSA'],
  5: ['NILO SEBE TONZAR', 'BRUNA BARBIERI', 'ROSIANE MACIEL', 'LUCAS FERREIRA BARBOSA'],
  6: ['ANNA LUISA T. PIVETTA', 'GABRIEL C. LOUZADA', 'MARCELO A. AGUIAR', 'ROSANE SALOMAO']
};

function createSchedule(status) {
  const sid = ++schedId;
  data.schedules.push({ id: sid, month: 4, year: 2026, status, created_at: new Date().toISOString() });

  for (let day = 1; day <= 30; day++) {
    const date = `2026-04-${String(day).padStart(2, '0')}`;
    const d = new Date(2026, 3, day);
    const dow = d.getDay();
    const weekNum = Math.floor((day - 1) / 7);
    const names = (weekNum % 2 === 0) ? patA[dow] : patB[dow];

    for (let i = 0; i < names.length; i++) {
      shiftId++;
      data.shifts.push({ id: shiftId, schedule_id: sid, date, period: 'diurno', slot: i + 1, doctor_id: did(names[i]) });
      shiftId++;
      data.shifts.push({ id: shiftId, schedule_id: sid, date, period: 'noturno', slot: i + 1, doctor_id: did(names[i]) });
    }
  }
  return sid;
}

// Create BOTH programada and executada
createSchedule('programada');
createSchedule('executada');

data._counters.schedules = schedId;
data._counters.shifts = shiftId;

fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');

console.log('');
console.log('=== Setup Completo! ===');
console.log('Medicos: ' + (doctorList.length + 1));
console.log('Escala Programada + Executada de Abril 2026 criadas');
console.log('');
console.log('LOGINS:');
console.log('  ADMIN:   eliete / 123456');
console.log('  MEDICOS: nome em minusculo / 123456');
console.log('');

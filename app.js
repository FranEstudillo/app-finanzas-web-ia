/* ============================================================
   FinanzApp – app.js
   Base de datos: Supabase (PostgreSQL)
   ============================================================ */

const supabaseUrl = 'https://ixizwkzpuwjijtrmztub.supabase.co';
const supabaseKey = 'sb_publishable_hhHysg3Z4R7WCXzCzw6btg_m9gH2ZCE';
const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);

let currentUser = null;

// ---- State ----
let accounts = [];
let activeAccountId = null;
let selectedIcon = '🏦';
let balanceOffset = 0;
let _prevBalanceOffset = 0;

let credits = [];
let activeCreditId = null;
let selectedCreditIcon = '💳';
let activeTab = 'cuentas';

// ---- Auth Logic ----
async function checkUser() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) {
    currentUser = session.user;
    await fetchData();
  } else {
    currentUser = null;
    window.location.replace('login.html');
  }
}

async function logoutUser() {
  await supabaseClient.auth.signOut();
  window.location.replace('login.html');
}

// ---- Data Fetching ----
async function fetchData() {
  if (!currentUser) return;
  const [resAcc, resCred] = await Promise.all([
    supabaseClient.from('accounts').select('*').order('created_at', { ascending: true }),
    supabaseClient.from('credits').select('*').order('created_at', { ascending: true })
  ]);
  if (resAcc.data) {
    accounts = resAcc.data.map(a => ({
      id: a.id, name: a.name, icon: a.icon, balance: a.balance, createdAt: a.created_at
    }));
  }
  if (resCred.data) {
    credits = resCred.data.map(c => ({
      id: c.id, name: c.name, icon: c.icon, limit: c.limit_amount, balance: c.balance, 
      cutDay: c.cut_day, payDay: c.pay_day, createdAt: c.created_at
    }));
  }
  render();
  renderCredits();
}

async function recordMovement({ accountId, accountName, accountIcon, type, amount, description }) {
  if(!currentUser) return;
  await supabaseClient.from('movements').insert({
    user_id: currentUser.id,
    account_id: accountId,
    account_name: accountName,
    account_icon: accountIcon,
    type: type,
    amount: amount,
    description: description || ''
  });
}

// ---- DB Key for Local Settings ----
const DB_KEY_LABELS = 'finanzapp_labels';


// ---- Navigation ----
function switchTab(tabId) {
  activeTab = tabId;
  document.getElementById('tabCuentas').classList.toggle('active', tabId === 'cuentas');
  document.getElementById('tabCreditos').classList.toggle('active', tabId === 'creditos');

  document.getElementById('sectionCuentas').style.display = tabId === 'cuentas' ? 'block' : 'none';
  document.getElementById('sectionCreditos').style.display = tabId === 'creditos' ? 'block' : 'none';

  if (tabId === 'cuentas') render();
  else renderCredits();
}

// ---- Helpers ----
function formatCurrency(value) {
  return '$' + Number(value).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function showToast(message, type = 'default') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.style.borderColor =
    type === 'income'  ? 'rgba(34,211,160,.4)'  :
    type === 'expense' ? 'rgba(255,92,124,.4)'  :
    type === 'error'   ? 'rgba(255,92,124,.4)'  :
    'var(--border-light)';
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2800);
}

// ---- Render ----
function render() {
  const grid = document.getElementById('accountsGrid');
  const emptyState = document.getElementById('emptyState');
  const totalBalanceEl = document.getElementById('totalBalance');
  const totalAccountsEl = document.getElementById('totalAccounts');

  // Summary
  const calcTotal = accounts.reduce((sum, a) => sum + a.balance, 0);
  const displayTotal = calcTotal + balanceOffset;
  totalBalanceEl.textContent = formatCurrency(displayTotal);
  totalAccountsEl.textContent = accounts.length;

  // Empty state
  if (accounts.length === 0) {
    grid.innerHTML = '';
    emptyState.style.display = 'block';
    return;
  }
  emptyState.style.display = 'none';

  // Cards
  grid.innerHTML = accounts.map(acc => {
    const balanceClass = acc.balance > 0 ? 'positive' : acc.balance < 0 ? 'negative' : '';
    return `
      <div class="account-card" id="card-${acc.id}">
        <div class="card-header">
          <span class="card-icon">${acc.icon}</span>
          <div style="flex:1">
            <p class="card-title">${escapeHtml(acc.name)}</p>
            <p class="card-subtitle">Creada ${formatDate(acc.createdAt)}</p>
          </div>
          <button class="btn-delete-card" onclick="openDeleteModal('${acc.id}')" title="Eliminar cuenta">🗑</button>
        </div>

        <div class="card-balance">
          <p class="balance-label">Saldo disponible</p>
          <p class="balance-amount ${balanceClass}" id="balance-${acc.id}">
            ${formatCurrency(acc.balance)}
          </p>
        </div>

        <div class="card-actions">
          <button class="btn btn-income" onclick="openIncomeModal('${acc.id}')">
            <span class="btn-icon">↑</span> Ingreso
          </button>
          <button class="btn btn-expense" onclick="openExpenseModal('${acc.id}')">
            <span class="btn-icon">↓</span> Gasto
          </button>
          <button class="btn btn-transfer" onclick="openTransferModal('${acc.id}')">
            <span class="btn-icon">⇄</span> Transferencia
          </button>
        </div>
      </div>
    `;
  }).join('');
}

// ---- Render Credits ----
function renderCredits() {
  const grid = document.getElementById('creditsGrid');
  const emptyState = document.getElementById('emptyStateCredits');
  const valDebt = document.getElementById('totalDebt');
  const valAvail = document.getElementById('totalAvailable');
  const valTotal = document.getElementById('totalCredits');

  // Summary
  const tDebt = credits.reduce((sum, c) => sum + c.balance, 0); // balance is debt
  const tAvail = credits.reduce((sum, c) => sum + (c.limit - c.balance), 0);
  
  valDebt.textContent = formatCurrency(tDebt);
  valAvail.textContent = formatCurrency(tAvail);
  valTotal.textContent = credits.length;

  if (credits.length === 0) {
    grid.innerHTML = '';
    emptyState.style.display = 'block';
    return;
  }
  emptyState.style.display = 'none';

  // Cards
  grid.innerHTML = credits.map(c => {
    const available = c.limit - c.balance;
    // Debt > 0 is negative (red). Debt == 0 is positive (green)
    const debtClass = c.balance > 0 ? 'negative' : 'positive';

    return `
      <div class="account-card" id="card-${c.id}" style="border-top-color: var(--credit)">
        <div class="card-header">
          <span class="card-icon">${c.icon}</span>
          <div style="flex:1">
            <p class="card-title">${escapeHtml(c.name)}</p>
            <p class="card-subtitle">Corte: ${c.cutDay} | Pago: ${c.payDay}</p>
          </div>
          <button class="btn-delete-card" onclick="openDeleteCreditModal('${c.id}')" title="Eliminar crédito">🗑</button>
        </div>

        <div class="card-balance">
          <p class="balance-label">Deuda actual / Límite</p>
          <p class="balance-amount ${debtClass}" id="balance-${c.id}" style="font-size: 1.6rem">
            ${formatCurrency(c.balance)} <span style="font-size: 0.9rem; color: var(--text-muted); font-weight: normal">/ ${formatCurrency(c.limit)}</span>
          </p>
          <p class="balance-label" style="margin-top: 0.2rem; color: var(--income)">Disponible: ${formatCurrency(available)}</p>
        </div>

        <div class="card-actions">
          <button class="btn btn-expense" onclick="openCargoModal('${c.id}')">
            <span class="btn-icon">📅</span> Cargo
          </button>
          <button class="btn btn-income" onclick="openPagoModal('${c.id}')">
            <span class="btn-icon">✅</span> Abono
          </button>
          <button class="btn btn-transfer" onclick="openPayCreditModal('${c.id}')">
            <span class="btn-icon">💳</span> Pagar
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.appendChild(document.createTextNode(str));
  return d.innerHTML;
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ---- NEW ACCOUNT MODAL ----
function openNewAccountModal() {
  document.getElementById('inputAccountName').value = '';
  document.getElementById('inputInitialBalance').value = '';
  selectedIcon = '🏦';
  document.querySelectorAll('.icon-option').forEach(el => {
    el.classList.toggle('selected', el.dataset.icon === selectedIcon);
  });
  document.getElementById('modalNewAccount').classList.add('open');
  setTimeout(() => document.getElementById('inputAccountName').focus(), 150);
}

function closeNewAccountModal() {
  document.getElementById('modalNewAccount').classList.remove('open');
}

async function saveNewAccount() {
  if (!currentUser) return;
  const name = document.getElementById('inputAccountName').value.trim();
  const initialStr = document.getElementById('inputInitialBalance').value;
  const initial = initialStr === '' ? 0 : parseFloat(initialStr);

  if (!name) { showToast('⚠️ Ingresa un nombre para la cuenta', 'error'); return; }
  if (isNaN(initial) || initial < 0) { showToast('⚠️ Monto inválido', 'error'); return; }

  const newAccount = {
    user_id: currentUser.id,
    name,
    icon: selectedIcon,
    balance: initial
  };

  const { data, error } = await supabaseClient.from('accounts').insert(newAccount).select();
  if (error) { showToast('⚠️ Error al crear cuenta', 'error'); return; }
  
  accounts.push(data[0]);
  closeNewAccountModal();
  render();
  showToast(`✅ Cuenta "${name}" creada`);
}

// ---- INCOME MODAL ----
function openIncomeModal(accountId) {
  activeAccountId = accountId;
  const acc = accounts.find(a => a.id === accountId);
  document.getElementById('incomeAccountName').textContent = `${acc.icon}  ${acc.name}`;
  document.getElementById('inputIncomeAmount').value = '';
  document.getElementById('inputIncomeDesc').value = '';
  document.getElementById('modalIncome').classList.add('open');
  setTimeout(() => document.getElementById('inputIncomeAmount').focus(), 150);
}

function closeIncomeModal() {
  document.getElementById('modalIncome').classList.remove('open');
  activeAccountId = null;
}

async function saveIncome() {
  const amount = parseFloat(document.getElementById('inputIncomeAmount').value);
  const desc   = document.getElementById('inputIncomeDesc').value.trim();
  if (isNaN(amount) || amount <= 0) { showToast('⚠️ Ingresa un monto válido', 'error'); return; }

  const idx = accounts.findIndex(a => a.id === activeAccountId);
  if (idx === -1) return;
  
  const newBalance = accounts[idx].balance + amount;
  const { error } = await supabaseClient.from('accounts').update({ balance: newBalance }).eq('id', accounts[idx].id);
  if (error) { showToast('⚠️ Error al actualizar', 'error'); return; }

  accounts[idx].balance = newBalance;
  await recordMovement({ accountId: accounts[idx].id, accountName: accounts[idx].name, accountIcon: accounts[idx].icon, type: 'income', amount, description: desc });
  
  closeIncomeModal();
  render();
  showToast(`↑ +${formatCurrency(amount)} agregado`, 'income');
}

// ---- EXPENSE MODAL ----
function openExpenseModal(accountId) {
  activeAccountId = accountId;
  const acc = accounts.find(a => a.id === accountId);
  document.getElementById('expenseAccountName').textContent = `${acc.icon}  ${acc.name}`;
  document.getElementById('inputExpenseAmount').value = '';
  document.getElementById('inputExpenseDesc').value = '';
  document.getElementById('modalExpense').classList.add('open');
  setTimeout(() => document.getElementById('inputExpenseAmount').focus(), 150);
}

function closeExpenseModal() {
  document.getElementById('modalExpense').classList.remove('open');
  activeAccountId = null;
}

async function saveExpense() {
  const amount = parseFloat(document.getElementById('inputExpenseAmount').value);
  const desc   = document.getElementById('inputExpenseDesc').value.trim();
  if (isNaN(amount) || amount <= 0) { showToast('⚠️ Ingresa un monto válido', 'error'); return; }

  const idx = accounts.findIndex(a => a.id === activeAccountId);
  if (idx === -1) return;
  
  const newBalance = accounts[idx].balance - amount;
  const { error } = await supabaseClient.from('accounts').update({ balance: newBalance }).eq('id', accounts[idx].id);
  if (error) { showToast('⚠️ Error al actualizar', 'error'); return; }

  accounts[idx].balance = newBalance;
  await recordMovement({ accountId: accounts[idx].id, accountName: accounts[idx].name, accountIcon: accounts[idx].icon, type: 'expense', amount, description: desc });
  
  closeExpenseModal();
  render();
  showToast(`↓ -${formatCurrency(amount)} restado`, 'expense');
}

// ---- BALANCE AMOUNT EDITING ----
function startEditBalance() {
  const span  = document.getElementById('totalBalance');
  const input = document.getElementById('inputBalanceAmount');
  const btn   = document.getElementById('btnEditBalance');
  const calcTotal = accounts.reduce((sum, a) => sum + a.balance, 0);
  _prevBalanceOffset = balanceOffset;
  input.value = (calcTotal + balanceOffset).toFixed(2);
  span.style.display  = 'none';
  btn.style.display   = 'none';
  input.style.display = 'block';
  input.focus();
  input.select();
}

function saveBalance() {
  const span  = document.getElementById('totalBalance');
  const input = document.getElementById('inputBalanceAmount');
  const btn   = document.getElementById('btnEditBalance');
  const entered = parseFloat(input.value);
  if (!isNaN(entered)) {
    const calcTotal  = accounts.reduce((sum, a) => sum + a.balance, 0);
    balanceOffset = entered - calcTotal;
    // Persist
    const labels = loadLabels();
    labels.balanceOffset = balanceOffset;
    localStorage.setItem(DB_KEY_LABELS, JSON.stringify(labels));
  }
  span.style.display  = '';
  btn.style.display   = '';
  input.style.display = 'none';
  render();
  applyStoredLabel();
}

function cancelBalance() {
  const span  = document.getElementById('totalBalance');
  const input = document.getElementById('inputBalanceAmount');
  const btn   = document.getElementById('btnEditBalance');
  balanceOffset = _prevBalanceOffset;
  span.style.display  = '';
  btn.style.display   = '';
  input.style.display = 'none';
}

// ---- BALANCE SETTINGS (offset persistence) ----
function loadLabels() {
  try { return JSON.parse(localStorage.getItem(DB_KEY_LABELS)) || {}; }
  catch { return {}; }
}

function applyStoredOffset() {
  const labels = loadLabels();
  if (typeof labels.balanceOffset === 'number') {
    balanceOffset = labels.balanceOffset;
    render();
  }
}

// ---- DELETE ACCOUNT MODAL ----
function openDeleteModal(accountId) {
  activeAccountId = accountId;
  const acc = accounts.find(a => a.id === accountId);
  document.getElementById('deleteAccountName').textContent = `${acc.icon}  ${acc.name}`;
  document.getElementById('modalDelete').classList.add('open');
}

function closeDeleteModal() {
  document.getElementById('modalDelete').classList.remove('open');
  activeAccountId = null;
}

async function confirmDelete() {
  const acc = accounts.find(a => a.id === activeAccountId);
  if (!acc) return;
  const name = acc.name;
  
  const { error } = await supabaseClient.from('accounts').delete().eq('id', activeAccountId);
  if (error) { showToast('⚠️ Error al eliminar', 'error'); return; }

  accounts = accounts.filter(a => a.id !== activeAccountId);
  // Movements are kept intentionally in the DB, as they don't CASCADE delete by default unless specified
  closeDeleteModal();
  render();
  showToast(`🗑 Cuenta "${name}" eliminada`);
}

// ---- NEW CREDIT MODAL ----
function openNewCreditModal() {
  document.getElementById('inputCreditName').value = '';
  document.getElementById('inputCreditLimit').value = '';
  document.getElementById('inputCreditCutDay').value = '';
  document.getElementById('inputCreditPayDay').value = '';
  selectedCreditIcon = '💳';
  document.querySelectorAll('#creditIconPicker .icon-option').forEach(el => {
    el.classList.toggle('selected', el.dataset.icon === selectedCreditIcon);
  });
  document.getElementById('modalNewCredit').classList.add('open');
  setTimeout(() => document.getElementById('inputCreditName').focus(), 150);
}

function closeNewCreditModal() {
  document.getElementById('modalNewCredit').classList.remove('open');
}

async function saveNewCredit() {
  if (!currentUser) return;
  const name = document.getElementById('inputCreditName').value.trim();
  const limitStr = document.getElementById('inputCreditLimit').value;
  const cutStr = document.getElementById('inputCreditCutDay').value;
  const payStr = document.getElementById('inputCreditPayDay').value;
  
  const limit = parseFloat(limitStr);
  const cutDay = parseInt(cutStr, 10);
  const payDay = parseInt(payStr, 10);

  if (!name) { showToast('⚠️ Ingresa nombre del crédito', 'error'); return; }
  if (isNaN(limit) || limit <= 0) { showToast('⚠️ El límite debe ser mayor a 0', 'error'); return; }
  if (isNaN(cutDay) || cutDay < 1 || cutDay > 31) { showToast('⚠️ Día de corte inválido (1-31)', 'error'); return; }
  if (isNaN(payDay) || payDay < 1 || payDay > 31) { showToast('⚠️ Día límite inválido (1-31)', 'error'); return; }

  const newCredit = {
    user_id: currentUser.id,
    name,
    icon: selectedCreditIcon,
    limit_amount: limit,
    balance: 0, // balance here means debt
    cut_day: cutDay,
    pay_day: payDay
  };

  const { data, error } = await supabaseClient.from('credits').insert(newCredit).select();
  if (error) { showToast('⚠️ Error al crear crédito', 'error'); return; }

  // Supabase returns the matched row, push to local state but adapt camelCase for UI
  const c = data[0];
  credits.push({
    id: c.id, name: c.name, icon: c.icon, limit: c.limit_amount, balance: c.balance, cutDay: c.cut_day, payDay: c.pay_day, createdAt: c.created_at
  });
  
  closeNewCreditModal();
  renderCredits();
  showToast(`💳 Crédito "${name}" creado`);
}

// ---- CARGO MODAL (Credits) ----
function openCargoModal(creditId) {
  activeCreditId = creditId;
  const c = credits.find(i => i.id === creditId);
  document.getElementById('cargoCreditName').textContent = `${c.icon}  ${c.name}`;
  document.getElementById('inputCargoAmount').value = '';
  document.getElementById('inputCargoDesc').value = '';
  document.getElementById('modalCargo').classList.add('open');
  setTimeout(() => document.getElementById('inputCargoAmount').focus(), 150);
}

function closeCargoModal() {
  document.getElementById('modalCargo').classList.remove('open');
  activeCreditId = null;
}

async function saveCargo() {
  const amount = parseFloat(document.getElementById('inputCargoAmount').value);
  const desc   = document.getElementById('inputCargoDesc').value.trim();
  if (isNaN(amount) || amount <= 0) { showToast('⚠️ Ingresa un monto válido', 'error'); return; }

  const idx = credits.findIndex(i => i.id === activeCreditId);
  if (idx === -1) return;
  const newBalance = credits[idx].balance + amount;

  const { error } = await supabaseClient.from('credits').update({ balance: newBalance }).eq('id', credits[idx].id);
  if (error) { showToast('⚠️ Error al registrar cargo', 'error'); return; }

  credits[idx].balance = newBalance;
  await recordMovement({ accountId: credits[idx].id, accountName: credits[idx].name, accountIcon: credits[idx].icon, type: 'cargo', amount, description: desc });
  
  closeCargoModal();
  renderCredits();
  showToast(`📅 Cargo de ${formatCurrency(amount)} registrado`, 'expense');
}

// ---- PAGO MODAL (Credits) ----
function openPagoModal(creditId) {
  activeCreditId = creditId;
  const c = credits.find(i => i.id === creditId);
  document.getElementById('pagoCreditName').textContent = `${c.icon}  ${c.name}`;
  document.getElementById('inputPagoAmount').value = '';
  document.getElementById('inputPagoDesc').value = '';
  document.getElementById('modalPago').classList.add('open');
  setTimeout(() => document.getElementById('inputPagoAmount').focus(), 150);
}

function closePagoModal() {
  document.getElementById('modalPago').classList.remove('open');
  activeCreditId = null;
}

async function savePago() {
  const amount = parseFloat(document.getElementById('inputPagoAmount').value);
  const desc   = document.getElementById('inputPagoDesc').value.trim();
  if (isNaN(amount) || amount <= 0) { showToast('⚠️ Ingresa un monto válido', 'error'); return; }

  const idx = credits.findIndex(i => i.id === activeCreditId);
  if (idx === -1) return;
  
  let newBalance = credits[idx].balance - amount;
  if (newBalance < 0) newBalance = 0; // cannot owe negative

  const { error } = await supabaseClient.from('credits').update({ balance: newBalance }).eq('id', credits[idx].id);
  if (error) { showToast('⚠️ Error al registrar pago', 'error'); return; }

  credits[idx].balance = newBalance;
  await recordMovement({ accountId: credits[idx].id, accountName: credits[idx].name, accountIcon: credits[idx].icon, type: 'pago', amount, description: desc });
  
  closePagoModal();
  renderCredits();
  showToast(`✅ Pago de ${formatCurrency(amount)} registrado`, 'income');
}

// ---- DELETE CREDIT MODAL ----
function openDeleteCreditModal(creditId) {
  activeCreditId = creditId;
  const c = credits.find(i => i.id === creditId);
  document.getElementById('deleteCreditName').textContent = `${c.icon}  ${c.name}`;
  document.getElementById('modalDeleteCredit').classList.add('open');
}

function closeDeleteCreditModal() {
  document.getElementById('modalDeleteCredit').classList.remove('open');
  activeCreditId = null;
}

async function confirmDeleteCredit() {
  const c = credits.find(i => i.id === activeCreditId);
  if (!c) return;
  const name = c.name;

  const { error } = await supabaseClient.from('credits').delete().eq('id', activeCreditId);
  if (error) { showToast('⚠️ Error al eliminar', 'error'); return; }

  credits = credits.filter(i => i.id !== activeCreditId);
  closeDeleteCreditModal();
  renderCredits();
  showToast(`🗑 Crédito "${name}" eliminado`);
}

// ---- TRANSFER MODAL ----
function openTransferModal(accountId) {
  activeAccountId = accountId;
  const origin = accounts.find(a => a.id === accountId);
  document.getElementById('transferOriginName').textContent = `Desde: ${origin.icon}  ${origin.name}`;
  document.getElementById('inputTransferAmount').value = '';
  document.getElementById('inputTransferDesc').value = '';
  
  // Populate destinations
  const select = document.getElementById('selectTransferDest');
  let html = `<option value="" disabled selected>Selecciona destino...</option>`;
  
  // Optgroup for other accounts
  const otherAccs = accounts.filter(a => a.id !== accountId);
  if (otherAccs.length > 0) {
    html += `<optgroup label="Mis Cuentas">`;
    otherAccs.forEach(a => {
      html += `<option value="acc_${a.id}">${a.icon} ${a.name} (Disponible: ${formatCurrency(a.balance)})</option>`;
    });
    html += `</optgroup>`;
  }
  
  // Optgroup for credits
  if (credits.length > 0) {
    html += `<optgroup label="Mis Créditos (Pago)">`;
    credits.forEach(c => {
      html += `<option value="cred_${c.id}">${c.icon} ${c.name} (Deuda: ${formatCurrency(c.balance)})</option>`;
    });
    html += `</optgroup>`;
  }
  
  select.innerHTML = html;
  document.getElementById('modalTransfer').classList.add('open');
  setTimeout(() => document.getElementById('inputTransferAmount').focus(), 150);
}

function closeTransferModal() {
  document.getElementById('modalTransfer').classList.remove('open');
  activeAccountId = null;
}

async function saveTransfer() {
  const amount = parseFloat(document.getElementById('inputTransferAmount').value);
  const desc   = document.getElementById('inputTransferDesc').value.trim() || 'Transferencia';
  const destVal = document.getElementById('selectTransferDest').value;
  
  if (isNaN(amount) || amount <= 0) { showToast('⚠️ Ingresa un monto válido', 'error'); return; }
  if (!destVal) { showToast('⚠️ Selecciona un destino', 'error'); return; }

  const destType = destVal.startsWith('acc_') ? 'account' : 'credit';
  const destId = destVal.substring(4);
  
  const originIdx = accounts.findIndex(a => a.id === activeAccountId);
  if (originIdx === -1) return;
  const origin = accounts[originIdx];
  
  if (destType === 'account') {
    const destIdx = accounts.findIndex(a => a.id === destId);
    if (destIdx === -1) return;
    const dest = accounts[destIdx];
    
    // DB Updates
    const originBal = origin.balance - amount;
    const destBal = dest.balance + amount;
    const { error: err1 } = await supabaseClient.from('accounts').update({ balance: originBal }).eq('id', origin.id);
    const { error: err2 } = await supabaseClient.from('accounts').update({ balance: destBal }).eq('id', dest.id);
    
    if (err1 || err2) { showToast('⚠️ Error al transferir', 'error'); return; }

    origin.balance = originBal;
    dest.balance = destBal;
    
    await recordMovement({ accountId: origin.id, accountName: origin.name, accountIcon: origin.icon, type: 'expense', amount, description: `${desc} (hacia ${dest.name})` });
    await recordMovement({ accountId: dest.id, accountName: dest.name, accountIcon: dest.icon, type: 'income', amount, description: `${desc} (desde ${origin.name})` });
    
    showToast(`⇄ ${formatCurrency(amount)} transferidos a ${dest.name}`);
  } else {
    // Credit destination
    const destIdx = credits.findIndex(c => c.id === destId);
    if (destIdx === -1) return;
    const dest = credits[destIdx];
    
    const originBal = origin.balance - amount;
    let destBal = dest.balance - amount;
    if (destBal < 0) destBal = 0;

    const { error: err1 } = await supabaseClient.from('accounts').update({ balance: originBal }).eq('id', origin.id);
    const { error: err2 } = await supabaseClient.from('credits').update({ balance: destBal }).eq('id', dest.id);
    
    if (err1 || err2) { showToast('⚠️ Error al abonar crédito', 'error'); return; }

    origin.balance = originBal;
    dest.balance = destBal;
    
    await recordMovement({ accountId: origin.id, accountName: origin.name, accountIcon: origin.icon, type: 'expense', amount, description: `Pago de crédito (${dest.name})` });
    await recordMovement({ accountId: dest.id, accountName: dest.name, accountIcon: dest.icon, type: 'pago', amount, description: `Abono desde cuenta ${origin.name}` });
    
    showToast(`✅ ${formatCurrency(amount)} abonados a ${dest.name}`);
  }
  
  closeTransferModal();
  render();
  renderCredits();
}

// ---- PAY CREDIT MODAL ----
function openPayCreditModal(creditId) {
  activeCreditId = creditId;
  const c = credits.find(i => i.id === creditId);
  document.getElementById('payCreditDestName').textContent = `Pagar: ${c.icon}  ${c.name} (Deuda: ${formatCurrency(c.balance)})`;
  document.getElementById('inputPayCreditAmount').value = '';
  document.getElementById('inputPayCreditDesc').value = '';
  
  const select = document.getElementById('selectPayCreditOrigin');
  let html = `<option value="" disabled selected>Selecciona cuenta origen...</option>`;
  if (accounts.length > 0) {
    accounts.forEach(a => {
      html += `<option value="${a.id}">${a.icon} ${a.name} (Disponible: ${formatCurrency(a.balance)})</option>`;
    });
  }
  select.innerHTML = html;
  
  document.getElementById('modalPayCredit').classList.add('open');
  setTimeout(() => document.getElementById('inputPayCreditAmount').focus(), 150);
}

function closePayCreditModal() {
  document.getElementById('modalPayCredit').classList.remove('open');
  activeCreditId = null;
}

async function savePayCredit() {
  const amount = parseFloat(document.getElementById('inputPayCreditAmount').value);
  const desc   = document.getElementById('inputPayCreditDesc').value.trim() || 'Pago de tarjeta';
  const originId = document.getElementById('selectPayCreditOrigin').value;
  
  if (isNaN(amount) || amount <= 0) { showToast('⚠️ Ingresa un monto válido', 'error'); return; }
  if (!originId) { showToast('⚠️ Selecciona una cuenta origen', 'error'); return; }

  const destIdx = credits.findIndex(c => c.id === activeCreditId);
  if (destIdx === -1) return;
  const dest = credits[destIdx];
  
  const originIdx = accounts.findIndex(a => a.id === originId);
  if (originIdx === -1) return;
  const origin = accounts[originIdx];
  
  // Process payment
  const originBal = origin.balance - amount;
  let destBal = dest.balance - amount;
  if (destBal < 0) destBal = 0;

  const { error: err1 } = await supabaseClient.from('accounts').update({ balance: originBal }).eq('id', origin.id);
  const { error: err2 } = await supabaseClient.from('credits').update({ balance: destBal }).eq('id', dest.id);
  
  if (err1 || err2) { showToast('⚠️ Error al registrar pago', 'error'); return; }

  origin.balance = originBal;
  dest.balance = destBal;
  
  await recordMovement({ accountId: origin.id, accountName: origin.name, accountIcon: origin.icon, type: 'expense', amount, description: `${desc} (${dest.name})` });
  await recordMovement({ accountId: dest.id, accountName: dest.name, accountIcon: dest.icon, type: 'pago', amount, description: `Abono desde cuenta ${origin.name}` });
  
  closePayCreditModal();
  render();
  renderCredits();
  showToast(`💳 ${formatCurrency(amount)} pagados a ${dest.name}`);
}

// ---- EVENT LISTENERS ----
document.addEventListener('DOMContentLoaded', () => {

  // New account
  document.getElementById('btnNewAccount').addEventListener('click', openNewAccountModal);
  document.getElementById('btnCloseNewAccount').addEventListener('click', closeNewAccountModal);
  document.getElementById('btnCancelNew').addEventListener('click', closeNewAccountModal);
  document.getElementById('btnSaveNewAccount').addEventListener('click', saveNewAccount);

  // Income
  document.getElementById('btnCloseIncome').addEventListener('click', closeIncomeModal);
  document.getElementById('btnCancelIncome').addEventListener('click', closeIncomeModal);
  document.getElementById('btnSaveIncome').addEventListener('click', saveIncome);

  // Expense
  document.getElementById('btnCloseExpense').addEventListener('click', closeExpenseModal);
  document.getElementById('btnCancelExpense').addEventListener('click', closeExpenseModal);
  document.getElementById('btnSaveExpense').addEventListener('click', saveExpense);

  // Delete account
  document.getElementById('btnCloseDelete').addEventListener('click', closeDeleteModal);
  document.getElementById('btnCancelDelete').addEventListener('click', closeDeleteModal);
  document.getElementById('btnConfirmDelete').addEventListener('click', confirmDelete);

  // New Credit
  document.getElementById('btnNewCredit').addEventListener('click', openNewCreditModal);
  document.getElementById('btnCloseNewCredit').addEventListener('click', closeNewCreditModal);
  document.getElementById('btnCancelNewCredit').addEventListener('click', closeNewCreditModal);
  document.getElementById('btnSaveNewCredit').addEventListener('click', saveNewCredit);

  // Cargo (Credit)
  document.getElementById('btnCloseCargo').addEventListener('click', closeCargoModal);
  document.getElementById('btnCancelCargo').addEventListener('click', closeCargoModal);
  document.getElementById('btnSaveCargo').addEventListener('click', saveCargo);

  // Pago (Credit)
  document.getElementById('btnClosePago').addEventListener('click', closePagoModal);
  document.getElementById('btnCancelPago').addEventListener('click', closePagoModal);
  document.getElementById('btnSavePago').addEventListener('click', savePago);

  // Delete credit
  document.getElementById('btnCloseDeleteCredit').addEventListener('click', closeDeleteCreditModal);
  document.getElementById('btnCancelDeleteCredit').addEventListener('click', closeDeleteCreditModal);
  document.getElementById('btnConfirmDeleteCredit').addEventListener('click', confirmDeleteCredit);

  // Close modals clicking outside
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) {
        overlay.classList.remove('open');
        activeAccountId = null;
        activeCreditId = null;
      }
    });
  });

  // Transfer
  document.getElementById('btnCloseTransfer').addEventListener('click', closeTransferModal);
  document.getElementById('btnCancelTransfer').addEventListener('click', closeTransferModal);
  document.getElementById('btnSaveTransfer').addEventListener('click', saveTransfer);

  // Pay Credit
  document.getElementById('btnClosePayCredit').addEventListener('click', closePayCreditModal);
  document.getElementById('btnCancelPayCredit').addEventListener('click', closePayCreditModal);
  document.getElementById('btnSavePayCredit').addEventListener('click', savePayCredit);

  // Icon picker (Accounts)
  document.getElementById('iconPicker').addEventListener('click', e => {
    const option = e.target.closest('.icon-option');
    if (!option) return;
    document.querySelectorAll('#iconPicker .icon-option').forEach(el => el.classList.remove('selected'));
    option.classList.add('selected');
    selectedIcon = option.dataset.icon;
  });

  // Icon picker (Credits)
  document.getElementById('creditIconPicker').addEventListener('click', e => {
    const option = e.target.closest('.icon-option');
    if (!option) return;
    document.querySelectorAll('#creditIconPicker .icon-option').forEach(el => el.classList.remove('selected'));
    option.classList.add('selected');
    selectedCreditIcon = option.dataset.icon;
  });

  // Enter key support in modals
  document.getElementById('inputAccountName').addEventListener('keydown', e => { if (e.key === 'Enter') saveNewAccount(); });
  document.getElementById('inputIncomeAmount').addEventListener('keydown', e => { if (e.key === 'Enter') saveIncome(); });
  document.getElementById('inputExpenseAmount').addEventListener('keydown', e => { if (e.key === 'Enter') saveExpense(); });
  
  document.getElementById('inputCreditName').addEventListener('keydown', e => { if (e.key === 'Enter') saveNewCredit(); });
  document.getElementById('inputCreditLimit').addEventListener('keydown', e => { if (e.key === 'Enter') saveNewCredit(); });
  document.getElementById('inputCargoAmount').addEventListener('keydown', e => { if (e.key === 'Enter') saveCargo(); });
  document.getElementById('inputPagoAmount').addEventListener('keydown', e => { if (e.key === 'Enter') savePago(); });
  document.getElementById('inputPayCreditAmount').addEventListener('keydown', e => { if (e.key === 'Enter') savePayCredit(); });
  
  // Auth event listeners
  document.getElementById('btnLogout').addEventListener('click', logoutUser);
  
  // Initial auth check -> starts data fetching if logged in
  checkUser();
  applyStoredOffset();
});

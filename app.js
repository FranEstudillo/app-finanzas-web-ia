/* ============================================================
   FinanzApp – app.js
   ============================================================ */

const supabaseUrl = "https://ixizwkzpuwjijtrmztub.supabase.co";
const supabaseKey = "sb_publishable_hhHysg3Z4R7WCXzCzw6btg_m9gH2ZCE";
const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);

let currentUser = null;

// ---- Global State ----
let accounts = [];
let credits = [];
let plannedPurchases = [];

// Payments State
let paymentConfig = null;
let paymentSavings = [];
let paymentItems = [];
let activePayQuincena = "q1";
const LS_PAY_TAB = "finanzapp_pay_tab";
const LS_PAY_MONTH = "finanzapp_pay_month";

let activeAccountId = null;
let activeCreditId = null;
let activePurchaseId = null;
let selectedIcon = "🏦";
let selectedCreditIcon = "💳";
let balanceOffset = 0;
let _prevBalanceOffset = 0;

// ---- Quincenas State (persisted in localStorage) ----
const LS_QUINCENAS = "finanzapp_quincenas";
let quincenas = []; // Array of date strings 'YYYY-MM-DD' always day 15 or 30

// ---- Categories ----
const DEFAULT_INCOME_CATEGORIES = [
  { emoji: "💰", label: "Salario" },
  { emoji: "💼", label: "Freelance" },
  { emoji: "📈", label: "Inversión" },
  { emoji: "🎁", label: "Regalo" },
  { emoji: "🏠", label: "Renta" },
  { emoji: "💵", label: "Venta" },
  { emoji: "↩️", label: "Reembolso" },
  { emoji: "❓", label: "Otro" },
];
const DEFAULT_EXPENSE_CATEGORIES = [
  { emoji: "🍔", label: "Comida" },
  { emoji: "🏠", label: "Hogar" },
  { emoji: "⛽", label: "Gasolina" },
  { emoji: "💊", label: "Salud" },
  { emoji: "🎉", label: "Entrete." },
  { emoji: "👕", label: "Ropa" },
  { emoji: "💡", label: "Servicios" },
  { emoji: "✈️", label: "Viajes" },
  { emoji: "💼", label: "Trabajo" },
  { emoji: "🛒", label: "Super" },
  { emoji: "❓", label: "Otro" },
];
let INCOME_CATEGORIES = [];
let EXPENSE_CATEGORIES = [];

let selectedExpenseCategory = "";
let selectedCargoCategory = "";
let selectedIncomeCategory = "";

const DB_KEY_LABELS = "finanzapp_labels";
const DB_KEY_CATEGORIES = "finanzapp_categories";

// ============================================================
// AUTH
// ============================================================
async function checkUser() {
  const {
    data: { session },
  } = await supabaseClient.auth.getSession();
  if (session) {
    currentUser = session.user;
    supabaseClient.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") window.location.replace("login.html");
    });
    await fetchData();
  } else {
    window.location.replace("login.html");
  }
}

async function logoutUser() {
  await supabaseClient.auth.signOut();
  window.location.replace("login.html");
}

// ============================================================
// DATA FETCHING
// ============================================================
async function fetchData() {
  if (!currentUser) return;
  const [resAcc, resCred, resPP, resCfg, resSav, resItems] = await Promise.all([
    supabaseClient
      .from("accounts")
      .select("*")
      .order("created_at", { ascending: true }),
    supabaseClient
      .from("credits")
      .select("*")
      .order("created_at", { ascending: true }),
    supabaseClient
      .from("planned_purchases")
      .select("*")
      .order("created_at", { ascending: true }),
    supabaseClient
      .from("payment_config")
      .select("*")
      .eq("user_id", currentUser.id)
      .maybeSingle(),
    supabaseClient
      .from("payment_savings")
      .select("*")
      .eq("user_id", currentUser.id),
    supabaseClient
      .from("payment_items")
      .select("*")
      .eq("user_id", currentUser.id)
      .order("sort_order", { ascending: true }),
  ]);

  if (resAcc.data) {
    accounts = resAcc.data.map((a) => ({
      id: a.id,
      name: a.name,
      icon: a.icon,
      balance: a.balance,
      createdAt: a.created_at,
    }));
  }
  if (resCred.data) {
    credits = resCred.data.map((c) => ({
      id: c.id,
      name: c.name,
      icon: c.icon,
      limit: c.limit_amount,
      balance: c.balance,
      cutDay: c.cut_day,
      payDay: c.pay_day,
      createdAt: c.created_at,
    }));
  }
  if (resPP.data) {
    plannedPurchases = resPP.data.map((p) => ({
      id: p.id,
      creditId: p.credit_id,
      creditName: p.credit_name,
      cutDate: p.cut_date,
      payDate: p.pay_date,
      totalBalance: parseFloat(p.total_balance) || 0,
      accountBalance: parseFloat(p.account_balance) || 0,
      quincenaAmounts: p.quincena_amounts || {},
      createdAt: p.created_at,
    }));
  }
  if (resCfg.data) {
    paymentConfig = {
      id: resCfg.data.id,
      monthlyIncome: parseFloat(resCfg.data.monthly_income) || 0,
      savingsPct: parseFloat(resCfg.data.savings_pct) || 0,
      fixedPct: parseFloat(resCfg.data.fixed_pct) || 0,
    };
  }
  if (resSav.data) paymentSavings = resSav.data;
  if (resItems.data) paymentItems = resItems.data;

  render();
  renderCredits();
  renderPlannedPurchases();
  if (activeView === "payments") renderPayments();
}

async function recordMovement({
  accountId,
  accountName,
  accountIcon,
  type,
  amount,
  description,
  category,
}) {
  if (!currentUser) return;
  const { error } = await supabaseClient.from("movements").insert({
    user_id: currentUser.id,
    account_id: accountId,
    account_name: accountName,
    account_icon: accountIcon,
    type,
    amount,
    description: description || "",
    category: category || "",
  });
  if (error) showToast("⚠️ Error de historial: " + error.message, "error");
}

// ============================================================
// NAVIGATION – SIDEBAR
// ============================================================
let activeView = "cuentas";

function switchView(viewId) {
  activeView = viewId;
  document
    .querySelectorAll(".section-view")
    .forEach((el) => el.classList.remove("active"));
  document
    .querySelectorAll('.nav-item[id^="nav"]')
    .forEach((el) => el.classList.remove("active"));

  const viewMap = {
    cuentas: "viewCuentas",
    creditos: "viewCreditos",
    planned: "viewPlanned",
    payments: "viewPayments",
  };
  const navMap = {
    cuentas: "navCuentas",
    creditos: "navCreditos",
    planned: "navPlanned",
    payments: "navPayments",
  };

  const viewEl = document.getElementById(viewMap[viewId]);
  const navEl = document.getElementById(navMap[viewId]);
  if (viewEl) viewEl.classList.add("active");
  if (navEl) navEl.classList.add("active");

  if (viewId === "cuentas") render();
  if (viewId === "creditos") renderCredits();
  if (viewId === "planned") renderPlannedPurchases();
  if (viewId === "payments") renderPayments();
}

// ============================================================
// HELPERS
// ============================================================
function formatCurrency(value) {
  return (
    "$" +
    Number(value).toLocaleString("es-MX", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

function formatDate(iso) {
  const d = new Date(iso);
  return (
    d.toLocaleDateString("es-MX", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }) +
    " " +
    d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })
  );
}

function formatDateShort(dateStr) {
  if (!dateStr) return "—";
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y.slice(2)}`;
}

function escapeHtml(str) {
  const d = document.createElement("div");
  d.appendChild(document.createTextNode(str));
  return d.innerHTML;
}

function showToast(message, type = "default") {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.style.borderColor =
    type === "income"
      ? "rgba(34,211,160,.4)"
      : type === "expense"
        ? "rgba(255,92,124,.4)"
        : type === "error"
          ? "rgba(255,92,124,.4)"
          : "var(--border-light)";
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2800);
}

function loadLabels() {
  try {
    return JSON.parse(localStorage.getItem(DB_KEY_LABELS)) || {};
  } catch {
    return {};
  }
}

function applyStoredOffset() {
  const labels = loadLabels();
  if (typeof labels.balanceOffset === "number") {
    balanceOffset = labels.balanceOffset;
    render();
  }
}

// ============================================================
// CATEGORIES
// ============================================================
function initCategories() {
  try {
    const stored = JSON.parse(localStorage.getItem(DB_KEY_CATEGORIES)) || {};
    INCOME_CATEGORIES =
      stored.income && stored.income.length > 0
        ? stored.income
        : [...DEFAULT_INCOME_CATEGORIES];
    EXPENSE_CATEGORIES =
      stored.expense && stored.expense.length > 0
        ? stored.expense
        : [...DEFAULT_EXPENSE_CATEGORIES];
  } catch {
    INCOME_CATEGORIES = [...DEFAULT_INCOME_CATEGORIES];
    EXPENSE_CATEGORIES = [...DEFAULT_EXPENSE_CATEGORIES];
  }
}

function saveCategoriesToStorage() {
  localStorage.setItem(
    DB_KEY_CATEGORIES,
    JSON.stringify({ income: INCOME_CATEGORIES, expense: EXPENSE_CATEGORIES }),
  );
}

function renderCategoryPicker(
  containerId,
  currentSelected,
  onSelect,
  categories,
) {
  const cats = categories || EXPENSE_CATEGORIES;
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = cats
    .map((cat) => {
      const isSelected = currentSelected === cat.label;
      return `<button type="button" class="cat-chip${isSelected ? " selected" : ""}" data-label="${cat.label}">
      <span class="cat-emoji">${cat.emoji}</span>${cat.label}
    </button>`;
    })
    .join("");
  container._onSelect = onSelect;
  container.onclick = (e) => {
    const chip = e.target.closest(".cat-chip");
    if (!chip) return;
    const label = chip.dataset.label;
    container._onSelect(label);
    container
      .querySelectorAll(".cat-chip")
      .forEach((c) =>
        c.classList.toggle("selected", c.dataset.label === label),
      );
  };
}

// ============================================================
// RENDER: ACCOUNTS
// ============================================================
function render() {
  const grid = document.getElementById("accountsGrid");
  const emptyState = document.getElementById("emptyState");
  const totalBalanceEl = document.getElementById("totalBalance");
  const totalAccountsEl = document.getElementById("totalAccounts");

  const calcTotal = accounts.reduce((sum, a) => sum + a.balance, 0);
  totalBalanceEl.textContent = formatCurrency(calcTotal + balanceOffset);
  totalAccountsEl.textContent = accounts.length;

  if (accounts.length === 0) {
    grid.innerHTML = "";
    emptyState.style.display = "block";
    return;
  }
  emptyState.style.display = "none";

  grid.innerHTML = accounts
    .map((acc) => {
      const balClass =
        acc.balance > 0 ? "positive" : acc.balance < 0 ? "negative" : "";
      return `<div class="account-card" onclick="openAccountDetail('${acc.id}')">
      <div class="card-header">
        <span class="card-icon">${acc.icon}</span>
        <div style="flex:1">
          <p class="card-title">${escapeHtml(acc.name)}</p>
          <p class="card-subtitle">Creada ${formatDate(acc.createdAt)}</p>
        </div>
      </div>
      <div class="card-balance">
        <p class="balance-label">Saldo disponible</p>
        <p class="balance-amount ${balClass}">${formatCurrency(acc.balance)}</p>
      </div>
    </div>`;
    })
    .join("");
}

// ============================================================
// RENDER: CREDITS
// ============================================================
function renderCredits() {
  const grid = document.getElementById("creditsGrid");
  const emptyState = document.getElementById("emptyStateCredits");

  const tDebt = credits.reduce((s, c) => s + c.balance, 0);
  const tAvail = credits.reduce((s, c) => s + (c.limit - c.balance), 0);
  document.getElementById("totalDebt").textContent = formatCurrency(tDebt);
  document.getElementById("totalAvailable").textContent =
    formatCurrency(tAvail);
  document.getElementById("totalCredits").textContent = credits.length;

  if (credits.length === 0) {
    grid.innerHTML = "";
    emptyState.style.display = "block";
    return;
  }
  emptyState.style.display = "none";

  grid.innerHTML = credits
    .map((c) => {
      const available = c.limit - c.balance;
      const debtClass = c.balance > 0 ? "negative" : "positive";
      return `<div class="account-card" style="border-top-color:var(--credit)" onclick="openCreditDetail('${c.id}')">
      <div class="card-header">
        <span class="card-icon">${c.icon}</span>
        <div style="flex:1">
          <p class="card-title">${escapeHtml(c.name)}</p>
          <p class="card-subtitle">Corte: ${c.cutDay} | Pago: ${c.payDay}</p>
        </div>
      </div>
      <div class="card-balance">
        <p class="balance-label">Deuda actual / Límite</p>
        <p class="balance-amount ${debtClass}" style="font-size:1.6rem">
          ${formatCurrency(c.balance)} <span style="font-size:.9rem;color:var(--text-muted);font-weight:normal">/ ${formatCurrency(c.limit)}</span>
        </p>
        <p class="balance-label" style="margin-top:.2rem;color:var(--income)">Disponible: ${formatCurrency(available)}</p>
      </div>
    </div>`;
    })
    .join("");
}

// ============================================================
// QUINCENAS MANAGER
// ============================================================
function loadQuincenas() {
  try {
    const stored = JSON.parse(localStorage.getItem(LS_QUINCENAS));
    if (Array.isArray(stored) && stored.length > 0) {
      quincenas = stored;
    } else {
      // Default: current month quincenas
      const now = new Date();
      quincenas = getQuincenasForMonth(now.getFullYear(), now.getMonth() + 1);
    }
  } catch {
    const now = new Date();
    quincenas = getQuincenasForMonth(now.getFullYear(), now.getMonth() + 1);
  }
}

function saveQuincenas() {
  localStorage.setItem(LS_QUINCENAS, JSON.stringify(quincenas));
}

function getQuincenasForMonth(year, month) {
  const mm = String(month).padStart(2, "0");
  return [`${year}-${mm}-15`, `${year}-${mm}-30`];
}

function openQuincenaManager() {
  renderQManagerList();
  // Set default month input to next month
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  document.getElementById("inputNewQuincenaMonth").value =
    `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}`;
  document.getElementById("modalQuincenas").classList.add("open");
}

function closeQuincenaManager() {
  document.getElementById("modalQuincenas").classList.remove("open");
  renderPlannedPurchases();
}

function renderQManagerList() {
  const list = document.getElementById("qManagerList");
  if (quincenas.length === 0) {
    list.innerHTML = `<p style="font-size:.82rem;color:var(--text-muted);text-align:center;padding:1rem">No hay quincenas configuradas</p>`;
    return;
  }
  list.innerHTML = quincenas
    .map((q, idx) => {
      const [y, m, d] = q.split("-");
      const label = `${d}/${m}/${y}`;
      return `<div class="q-manager-item">
      <span class="q-manager-item-label">📅 ${label}</span>
      <button class="row-btn delete" onclick="removeQuincena(${idx})">🗑</button>
    </div>`;
    })
    .join("");
}

function addQuincenasForMonth() {
  const val = document.getElementById("inputNewQuincenaMonth").value;
  if (!val) {
    showToast("⚠️ Selecciona un mes", "error");
    return;
  }
  const [y, m] = val.split("-").map(Number);
  const newQs = getQuincenasForMonth(y, m);
  let added = 0;
  newQs.forEach((q) => {
    if (!quincenas.includes(q)) {
      quincenas.push(q);
      added++;
    }
  });
  quincenas.sort();
  saveQuincenas();
  renderQManagerList();
  if (added > 0) showToast(`✅ ${added} quincena(s) agregada(s)`);
  else showToast("Ya están agregadas esas quincenas");
}

function removeQuincena(idx) {
  const removed = quincenas.splice(idx, 1)[0];
  saveQuincenas();
  renderQManagerList();
  showToast(`🗑 Quincena ${removed} eliminada`);
}

// ============================================================
// RENDER: PLANNED PURCHASES
// ============================================================
function renderPlannedPurchases() {
  const emptyState = document.getElementById("emptyStatePlanned");
  const table = document.getElementById("ppTable");

  if (plannedPurchases.length === 0) {
    table.style.display = "none";
    emptyState.style.display = "block";
    updatePPSummary();
    return;
  }
  table.style.display = "";
  emptyState.style.display = "none";

  renderPPHead();
  renderPPBody();
  updatePPSummary();
}

function renderPPHead() {
  const thead = document.getElementById("ppTableHead");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const monthNames = [
    "Ene",
    "Feb",
    "Mar",
    "Abr",
    "May",
    "Jun",
    "Jul",
    "Ago",
    "Sep",
    "Oct",
    "Nov",
    "Dic",
  ];

  const qCols = quincenas
    .map((q) => {
      const [y, m, d] = q.split("-");
      const qDate = new Date(q + "T00:00:00");
      const diffDays = Math.ceil((qDate - today) / (1000 * 60 * 60 * 24));

      let pillHtml;
      if (diffDays < 0) {
        pillHtml = `<div class="q-days-pill q-days-past" title="Esta quincena ya pasó">${diffDays}d</div>`;
      } else if (diffDays === 0) {
        pillHtml = `<div class="q-days-pill q-days-today" title="¡Es hoy!">hoy</div>`;
      } else {
        pillHtml = `<div class="q-days-pill q-days-future" title="Faltan ${diffDays} días para esta quincena">+${diffDays}d</div>`;
      }

      return `<th class="q-header">
      <div class="q-day">${d}</div>
      <div class="q-month">${monthNames[parseInt(m, 10) - 1]} ${y.slice(2)}</div>
      ${pillHtml}
    </th>`;
    })
    .join("");

  thead.innerHTML = `<tr>
    <th style="width:110px">Crédito</th>
    <th style="width:80px">F. corte</th>
    <th style="width:80px">F. límite</th>
    <th style="width:90px">Saldo total</th>
    <th style="width:90px">Saldo cuenta</th>
    <th style="width:100px">Días falt.</th>
    <th style="width:90px">Pendiente</th>
    ${qCols}
    <th style="width:60px"></th>
  </tr>`;
}

function renderPPBody() {
  const tbody = document.getElementById("ppTableBody");
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Data rows
  let rowsHtml = plannedPurchases
    .map((p) => {
      const pending = Math.max(0, p.totalBalance - p.accountBalance);
      const hasDates = !!p.payDate;

      // Days calculation
      let daysHtml = "—";
      if (hasDates) {
        const payD = new Date(p.payDate + "T00:00:00");
        const diffMs = payD - today;
        const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

        let barClass, textClass, barWidth;
        if (diffDays < 0) {
          barClass = "overdue";
          textClass = "overdue";
          barWidth = 100;
          daysHtml = `<div class="days-bar">
          <div class="days-bar-track"><div class="days-bar-fill ${barClass}" style="width:${barWidth}%"></div></div>
          <span class="days-text ${textClass}">${diffDays}d</span>
        </div>`;
        } else if (diffDays <= 7) {
          barClass = "urgent";
          textClass = "urgent";
          barWidth = Math.max(10, 100 - diffDays * 10);
          daysHtml = buildDaysBar(
            barClass,
            textClass,
            barWidth,
            `${diffDays}d`,
          );
        } else if (diffDays <= 20) {
          barClass = "warning";
          textClass = "warning";
          barWidth = Math.max(20, 70 - diffDays * 2);
          daysHtml = buildDaysBar(
            barClass,
            textClass,
            barWidth,
            `${diffDays}d`,
          );
        } else {
          barClass = "ok";
          textClass = "ok";
          barWidth = Math.max(10, 40);
          daysHtml = buildDaysBar(
            barClass,
            textClass,
            barWidth,
            `${diffDays}d`,
          );
        }
      }

      // Pending cell
      let pendingHtml;
      if (p.totalBalance === 0) {
        pendingHtml = `<span class="badge-free">Libre</span>`;
      } else if (pending <= 0) {
        pendingHtml = `<span class="badge-paid">✓ Cubierto</span>`;
      } else {
        pendingHtml = `<span class="pending-amount has-debt">${formatCurrency(pending)}</span>`;
      }

      // Days to pay limit (for quincena warning)
      let daysToPayLimit = null;
      if (hasDates) {
        const payD = new Date(p.payDate + "T00:00:00");
        daysToPayLimit = Math.ceil((payD - today) / (1000 * 60 * 60 * 24));
      }

      // Quincena cells
      const qCells = quincenas
        .map((q) => {
          const val = p.quincenaAmounts[q] || "";
          const displayVal = val ? formatCurrency(val) : "";

          // Days until this quincena
          const qDate = new Date(q + "T00:00:00");
          const daysToQ = Math.ceil((qDate - today) / (1000 * 60 * 60 * 24));

          // Warning: quincena is after or same day as pay limit → can't count on it
          let warningHtml = "";
          if (daysToPayLimit !== null && daysToQ > daysToPayLimit) {
            const tooltip = `Esta quincena cae después de tu fecha límite de pago (${daysToQ}d vs ${daysToPayLimit}d). No puedes considerar este ingreso para cubrir esta deuda.`;
            warningHtml = `<span class="q-warn-icon" title="${tooltip}">⚠</span>`;
          } else if (daysToPayLimit !== null && daysToQ === daysToPayLimit) {
            const tooltip = `Esta quincena cae el mismo día que tu fecha límite. Úsala solo si puedes pagar el mismo día.`;
            warningHtml = `<span class="q-warn-icon q-warn-caution" title="${tooltip}">!</span>`;
          }

          const tdClass =
            daysToPayLimit !== null && daysToQ > daysToPayLimit
              ? " q-cell-warn"
              : "";

          return `<td class="q-cell${tdClass}">
        <div class="q-amount-wrap">
          <input class="q-input${!val ? " empty" : ""}"
            type="text"
            value="${displayVal}"
            placeholder="—"
            data-purchase-id="${p.id}"
            data-quincena="${q}"
            onblur="saveQuincenaAmount(this)"
            onfocus="this.value=this.value.replace(/[$,]/g,''); this.select()"
          />${warningHtml}
        </div>
      </td>`;
        })
        .join("");

      const cutDateClass =
        hasDates && new Date(p.cutDate + "T00:00:00") < today ? "overdue" : "";
      const payDateClass =
        hasDates && new Date(p.payDate + "T00:00:00") < today ? "overdue" : "";

      return `<tr data-id="${p.id}">
      <td>
        <div class="credit-badge">
          <div class="credit-dot"></div>
          ${escapeHtml(p.creditName)}
        </div>
      </td>
      <td class="date-cell ${cutDateClass}">${formatDateShort(p.cutDate)}</td>
      <td class="date-cell ${payDateClass}">${formatDateShort(p.payDate)}</td>
      <td>${p.totalBalance > 0 ? formatCurrency(p.totalBalance) : '<span style="color:var(--text-muted)">—</span>'}</td>
      <td>${p.accountBalance > 0 ? formatCurrency(p.accountBalance) : '<span style="color:var(--text-muted)">—</span>'}</td>
      <td>${daysHtml}</td>
      <td>${pendingHtml}</td>
      ${qCells}
      <td>
        <div class="row-actions">
          <button class="row-btn" onclick="openEditPurchaseModal('${p.id}')" title="Editar">✏️</button>
          <button class="row-btn delete" onclick="deletePurchase('${p.id}')" title="Eliminar">🗑</button>
        </div>
      </td>
    </tr>`;
    })
    .join("");

  // Totals row
  const totalPending = plannedPurchases.reduce(
    (s, p) => s + Math.max(0, p.totalBalance - p.accountBalance),
    0,
  );
  const qTotals = quincenas
    .map((q) => {
      const total = plannedPurchases.reduce((s, p) => {
        const v = parseFloat(p.quincenaAmounts[q]) || 0;
        return s + v;
      }, 0);
      return `<td class="q-total">${total > 0 ? formatCurrency(total) : "—"}</td>`;
    })
    .join("");

  tbody.innerHTML =
    rowsHtml +
    `
    <tr class="pp-total-row">
      <td colspan="5" class="total-label">Total</td>
      <td></td>
      <td class="total-amount">${formatCurrency(totalPending)}</td>
      ${qTotals}
      <td></td>
    </tr>`;
}

function buildDaysBar(barClass, textClass, width, label) {
  return `<div class="days-bar">
    <div class="days-bar-track"><div class="days-bar-fill ${barClass}" style="width:${width}%"></div></div>
    <span class="days-text ${textClass}">${label}</span>
  </div>`;
}

function updatePPSummary() {
  const totalPending = plannedPurchases.reduce(
    (s, p) => s + Math.max(0, p.totalBalance - p.accountBalance),
    0,
  );
  document.getElementById("ppChipTotal").textContent =
    `Total pendiente: ${formatCurrency(totalPending)}`;

  // Next quincena total
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const nextQ =
    quincenas.find((q) => new Date(q + "T00:00:00") >= today) || quincenas[0];
  let nextQTotal = 0;
  if (nextQ) {
    nextQTotal = plannedPurchases.reduce((s, p) => {
      return s + (parseFloat(p.quincenaAmounts[nextQ]) || 0);
    }, 0);
    const [y, m, d] = nextQ.split("-");
    document.getElementById("ppChipNext").textContent =
      `Quincena ${d}/${m}: ${formatCurrency(nextQTotal)}`;
  } else {
    document.getElementById("ppChipNext").textContent =
      "Sin quincenas configuradas";
  }
}

// ============================================================
// QUINCENA AMOUNT – inline edit
// ============================================================
async function saveQuincenaAmount(input) {
  const purchaseId = input.dataset.purchaseId;
  const quincena = input.dataset.quincena;
  const rawVal = input.value.replace(/[$,\s]/g, "");
  const amount = rawVal === "" ? 0 : parseFloat(rawVal);

  if (isNaN(amount) || amount < 0) {
    showToast("⚠️ Monto inválido", "error");
    input.value = "";
    return;
  }

  const idx = plannedPurchases.findIndex((p) => p.id === purchaseId);
  if (idx === -1) return;

  const newAmounts = { ...plannedPurchases[idx].quincenaAmounts };
  if (amount === 0) delete newAmounts[quincena];
  else newAmounts[quincena] = amount;

  const { error } = await supabaseClient
    .from("planned_purchases")
    .update({ quincena_amounts: newAmounts })
    .eq("id", purchaseId);

  if (error) {
    showToast("⚠️ Error al guardar", "error");
    return;
  }

  plannedPurchases[idx].quincenaAmounts = newAmounts;

  // Update display
  if (amount > 0) {
    input.value = formatCurrency(amount);
    input.classList.remove("empty");
  } else {
    input.value = "";
    input.classList.add("empty");
  }

  updatePPSummary();
  // Re-render totals row only
  renderPPBody();
}

// ============================================================
// NEW PURCHASE MODAL
// ============================================================
function openNewPurchaseModal() {
  // Populate credit selector
  const sel = document.getElementById("selectPurchaseCredit");
  sel.innerHTML = `<option value="" disabled selected>Selecciona un crédito...</option>`;
  credits.forEach((c) => {
    sel.innerHTML += `<option value="${c.id}" data-cut="${c.cutDay}" data-pay="${c.payDay}">${c.icon} ${c.name}</option>`;
  });

  // Default month = current
  const now = new Date();
  document.getElementById("inputPurchaseMonth").value =
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  document.getElementById("inputPurchaseTotal").value = "";
  document.getElementById("inputPurchaseAccount").value = "";
  document.getElementById("inputPurchaseCutDate").value = "";
  document.getElementById("inputPurchasePayDate").value = "";

  // When credit changes, prefill dates
  sel.onchange = () => {
    const opt = sel.options[sel.selectedIndex];
    const cutDay = opt.dataset.cut;
    const payDay = opt.dataset.pay;
    const monthVal = document.getElementById("inputPurchaseMonth").value;
    if (monthVal && cutDay && payDay) prefillDates(monthVal, cutDay, payDay);
  };

  document.getElementById("inputPurchaseMonth").onchange = () => {
    const opt = sel.options[sel.selectedIndex];
    if (!opt || !opt.dataset.cut) return;
    prefillDates(
      document.getElementById("inputPurchaseMonth").value,
      opt.dataset.cut,
      opt.dataset.pay,
    );
  };

  document.getElementById("modalNewPurchase").classList.add("open");
  setTimeout(() => sel.focus(), 150);
}

function prefillDates(monthVal, cutDay, payDay) {
  if (!monthVal) return;
  const [y, m] = monthVal.split("-").map(Number);
  const cutD = String(cutDay).padStart(2, "0");
  const mm = String(m).padStart(2, "0");

  // Pay date might be next month if payDay < cutDay
  let payY = y,
    payM = m;
  if (parseInt(payDay) < parseInt(cutDay)) {
    payM = m + 1;
    if (payM > 12) {
      payM = 1;
      payY = y + 1;
    }
  }
  const payD = String(payDay).padStart(2, "0");
  const payMM = String(payM).padStart(2, "0");

  document.getElementById("inputPurchaseCutDate").value = `${y}-${mm}-${cutD}`;
  document.getElementById("inputPurchasePayDate").value =
    `${payY}-${payMM}-${payD}`;
}

function closeNewPurchaseModal() {
  document.getElementById("modalNewPurchase").classList.remove("open");
}

async function saveNewPurchase() {
  if (!currentUser) return;
  const creditId = document.getElementById("selectPurchaseCredit").value;
  const cutDate = document.getElementById("inputPurchaseCutDate").value;
  const payDate = document.getElementById("inputPurchasePayDate").value;
  const totalStr = document.getElementById("inputPurchaseTotal").value;
  const accStr = document.getElementById("inputPurchaseAccount").value;

  if (!creditId) {
    showToast("⚠️ Selecciona un crédito", "error");
    return;
  }

  const credit = credits.find((c) => c.id === creditId);
  if (!credit) return;

  const total = totalStr === "" ? 0 : parseFloat(totalStr);
  const accBal = accStr === "" ? 0 : parseFloat(accStr);

  if (isNaN(total) || total < 0) {
    showToast("⚠️ Saldo total inválido", "error");
    return;
  }
  if (isNaN(accBal) || accBal < 0) {
    showToast("⚠️ Saldo en cuenta inválido", "error");
    return;
  }

  const newPP = {
    user_id: currentUser.id,
    credit_id: creditId,
    credit_name: credit.name,
    cut_date: cutDate || null,
    pay_date: payDate || null,
    total_balance: total,
    account_balance: accBal,
    quincena_amounts: {},
  };

  const { data, error } = await supabaseClient
    .from("planned_purchases")
    .insert(newPP)
    .select();
  if (error) {
    showToast("⚠️ Error al guardar: " + error.message, "error");
    return;
  }

  const p = data[0];
  plannedPurchases.push({
    id: p.id,
    creditId: p.credit_id,
    creditName: p.credit_name,
    cutDate: p.cut_date,
    payDate: p.pay_date,
    totalBalance: parseFloat(p.total_balance) || 0,
    accountBalance: parseFloat(p.account_balance) || 0,
    quincenaAmounts: {},
    createdAt: p.created_at,
  });

  closeNewPurchaseModal();
  renderPlannedPurchases();
  showToast(`✅ Fila agregada: ${credit.name}`);
}

// ============================================================
// EDIT PURCHASE MODAL
// ============================================================
function openEditPurchaseModal(purchaseId) {
  activePurchaseId = purchaseId;
  const p = plannedPurchases.find((x) => x.id === purchaseId);
  if (!p) return;

  document.getElementById("editPurchaseCreditName").value = p.creditName;
  document.getElementById("editPurchaseCutDate").value = p.cutDate || "";
  document.getElementById("editPurchasePayDate").value = p.payDate || "";
  document.getElementById("editPurchaseTotal").value = p.totalBalance || "";
  document.getElementById("editPurchaseAccount").value = p.accountBalance || "";

  document.getElementById("modalEditPurchase").classList.add("open");
  setTimeout(() => document.getElementById("editPurchaseCutDate").focus(), 150);
}

function closeEditPurchaseModal() {
  document.getElementById("modalEditPurchase").classList.remove("open");
  activePurchaseId = null;
}

async function saveEditPurchase() {
  if (!activePurchaseId) return;
  const idx = plannedPurchases.findIndex((p) => p.id === activePurchaseId);
  if (idx === -1) return;

  const cutDate = document.getElementById("editPurchaseCutDate").value;
  const payDate = document.getElementById("editPurchasePayDate").value;
  const totalStr = document.getElementById("editPurchaseTotal").value;
  const accStr = document.getElementById("editPurchaseAccount").value;

  const total = totalStr === "" ? 0 : parseFloat(totalStr);
  const accBal = accStr === "" ? 0 : parseFloat(accStr);

  if (isNaN(total) || total < 0) {
    showToast("⚠️ Saldo total inválido", "error");
    return;
  }
  if (isNaN(accBal) || accBal < 0) {
    showToast("⚠️ Saldo en cuenta inválido", "error");
    return;
  }

  const { error } = await supabaseClient
    .from("planned_purchases")
    .update({
      cut_date: cutDate || null,
      pay_date: payDate || null,
      total_balance: total,
      account_balance: accBal,
    })
    .eq("id", activePurchaseId);

  if (error) {
    showToast("⚠️ Error al actualizar", "error");
    return;
  }

  plannedPurchases[idx].cutDate = cutDate || null;
  plannedPurchases[idx].payDate = payDate || null;
  plannedPurchases[idx].totalBalance = total;
  plannedPurchases[idx].accountBalance = accBal;

  closeEditPurchaseModal();
  renderPlannedPurchases();
  showToast("✅ Fila actualizada");
}

// ============================================================
// DELETE PURCHASE
// ============================================================
async function deletePurchase(purchaseId) {
  if (!confirm("¿Eliminar esta fila?")) return;
  const { error } = await supabaseClient
    .from("planned_purchases")
    .delete()
    .eq("id", purchaseId);
  if (error) {
    showToast("⚠️ Error al eliminar", "error");
    return;
  }
  plannedPurchases = plannedPurchases.filter((p) => p.id !== purchaseId);
  renderPlannedPurchases();
  showToast("🗑 Fila eliminada");
}

// ============================================================
// ACCOUNT DETAIL MODAL
// ============================================================
function openAccountDetail(accountId) {
  activeAccountId = accountId;
  const acc = accounts.find((a) => a.id === accountId);
  if (!acc) return;

  document.getElementById("accountDetailTitle").textContent = acc.name;
  document.getElementById("accountDetailIcon").textContent = acc.icon;
  document.getElementById("accountDetailName").textContent = acc.name;
  document.getElementById("accountDetailSub").textContent =
    `Creada ${formatDate(acc.createdAt)}`;

  const balEl = document.getElementById("accountDetailBalance");
  balEl.textContent = formatCurrency(acc.balance);
  balEl.className =
    "detail-balance-amount" +
    (acc.balance > 0 ? " positive" : acc.balance < 0 ? " negative" : "");

  document.getElementById("btnDetailIncome").onclick = () =>
    openIncomeModal(accountId);
  document.getElementById("btnDetailExpense").onclick = () =>
    openExpenseModal(accountId);
  document.getElementById("btnDetailTransfer").onclick = () =>
    openTransferModal(accountId);
  document.getElementById("btnDetailDeleteAccount").onclick = () =>
    openDeleteModal(accountId);

  loadMovements(accountId, "accountMovementsList");
  document.getElementById("modalAccountDetail").classList.add("open");
}

function closeAccountDetail() {
  document.getElementById("modalAccountDetail").classList.remove("open");
  activeAccountId = null;
}

function refreshAccountDetail() {
  if (!activeAccountId) return;
  const acc = accounts.find((a) => a.id === activeAccountId);
  if (!acc) {
    closeAccountDetail();
    return;
  }
  const balEl = document.getElementById("accountDetailBalance");
  balEl.textContent = formatCurrency(acc.balance);
  balEl.className =
    "detail-balance-amount" +
    (acc.balance > 0 ? " positive" : acc.balance < 0 ? " negative" : "");
  loadMovements(activeAccountId, "accountMovementsList");
}

// ============================================================
// CREDIT DETAIL MODAL
// ============================================================
function openCreditDetail(creditId) {
  activeCreditId = creditId;
  const c = credits.find((i) => i.id === creditId);
  if (!c) return;

  const available = c.limit - c.balance;
  const debtClass = c.balance > 0 ? " negative" : " positive";

  document.getElementById("creditDetailTitle").textContent = c.name;
  document.getElementById("creditDetailIcon").textContent = c.icon;
  document.getElementById("creditDetailName").textContent = c.name;
  document.getElementById("creditDetailSub").textContent =
    `Corte: día ${c.cutDay}  |  Pago: día ${c.payDay}`;

  const balEl = document.getElementById("creditDetailBalance");
  balEl.textContent = `${formatCurrency(c.balance)} / ${formatCurrency(c.limit)}`;
  balEl.className = "detail-balance-amount" + debtClass;

  document.getElementById("creditDetailAvailable").textContent =
    formatCurrency(available);
  document.getElementById("creditDetailCutDay").textContent = `Día ${c.cutDay}`;
  document.getElementById("creditDetailPayDay").textContent = `Día ${c.payDay}`;

  document.getElementById("btnDetailCargo").onclick = () =>
    openCargoModal(creditId);
  document.getElementById("btnDetailAbono").onclick = () =>
    openPagoModal(creditId);
  document.getElementById("btnDetailPagar").onclick = () =>
    openPayCreditModal(creditId);
  document.getElementById("btnDetailDeleteCredit").onclick = () =>
    openDeleteCreditModal(creditId);

  loadMovements(creditId, "creditMovementsList");
  document.getElementById("modalCreditDetail").classList.add("open");
}

function closeCreditDetail() {
  document.getElementById("modalCreditDetail").classList.remove("open");
  activeCreditId = null;
}

function refreshCreditDetail() {
  if (!activeCreditId) return;
  const c = credits.find((i) => i.id === activeCreditId);
  if (!c) {
    closeCreditDetail();
    return;
  }
  const available = c.limit - c.balance;
  const debtClass = c.balance > 0 ? " negative" : " positive";
  const balEl = document.getElementById("creditDetailBalance");
  balEl.textContent = `${formatCurrency(c.balance)} / ${formatCurrency(c.limit)}`;
  balEl.className = "detail-balance-amount" + debtClass;
  document.getElementById("creditDetailAvailable").textContent =
    formatCurrency(available);
  loadMovements(activeCreditId, "creditMovementsList");
}

// ============================================================
// LOAD MOVEMENTS
// ============================================================
async function loadMovements(accountId, containerId) {
  const container = document.getElementById(containerId);
  container.innerHTML = `<div class="movements-placeholder" style="padding:2rem 1rem">
    <span class="placeholder-icon">⌛</span>
    <strong style="margin-top:.5rem">Cargando...</strong>
  </div>`;

  const { data, error } = await supabaseClient
    .from("movements")
    .select("*")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false });

  if (error) {
    container.innerHTML = `<div class="movements-placeholder">
      <span class="placeholder-icon">⚠️</span>
      <strong>Error al obtener historial</strong>
    </div>`;
    return;
  }

  if (!data || data.length === 0) {
    container.innerHTML = `<div class="movements-placeholder">
      <span class="placeholder-icon">📭</span>
      <strong>Sin movimientos</strong>
      Aún no hay transacciones
    </div>`;
    return;
  }

  container.innerHTML = `<div class="movements-container">
    ${data
      .map((m) => {
        const isPositive = m.type === "income" || m.type === "pago";
        const sign = isPositive ? "+" : "-";
        const amountClass = isPositive ? "positive" : "negative";
        let displayIcon =
          m.type === "income"
            ? "↑"
            : m.type === "expense"
              ? "↓"
              : m.type === "cargo"
                ? "📅"
                : "✅";
        if (m.category) {
          const catObj = [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES].find(
            (c) => c.label === m.category,
          );
          if (catObj) displayIcon = catObj.emoji;
        }
        const desc = m.category
          ? m.description
            ? `${m.category} - ${m.description}`
            : m.category
          : m.description || (isPositive ? "Abono/Ingreso" : "Cargo/Gasto");
        return `<div class="movement-item">
        <div class="movement-icon">${displayIcon}</div>
        <div class="movement-info">
          <p class="movement-desc" title="${escapeHtml(desc)}">${escapeHtml(desc)}</p>
          <p class="movement-date">${formatDate(m.created_at)}</p>
        </div>
        <div class="movement-amount ${amountClass}">${sign}${formatCurrency(m.amount)}</div>
      </div>`;
      })
      .join("")}
  </div>`;
}

// ============================================================
// NEW ACCOUNT
// ============================================================
function openNewAccountModal() {
  document.getElementById("inputAccountName").value = "";
  document.getElementById("inputInitialBalance").value = "";
  selectedIcon = "🏦";
  document
    .querySelectorAll("#iconPicker .icon-option")
    .forEach((el) =>
      el.classList.toggle("selected", el.dataset.icon === selectedIcon),
    );
  document.getElementById("modalNewAccount").classList.add("open");
  setTimeout(() => document.getElementById("inputAccountName").focus(), 150);
}

function closeNewAccountModal() {
  document.getElementById("modalNewAccount").classList.remove("open");
}

async function saveNewAccount() {
  if (!currentUser) return;
  const name = document.getElementById("inputAccountName").value.trim();
  const initial =
    parseFloat(document.getElementById("inputInitialBalance").value) || 0;
  if (!name) {
    showToast("⚠️ Ingresa un nombre", "error");
    return;
  }
  if (isNaN(initial) || initial < 0) {
    showToast("⚠️ Monto inválido", "error");
    return;
  }

  const { data, error } = await supabaseClient
    .from("accounts")
    .insert({
      user_id: currentUser.id,
      name,
      icon: selectedIcon,
      balance: initial,
    })
    .select();
  if (error) {
    showToast("⚠️ Error al crear cuenta", "error");
    return;
  }

  accounts.push(data[0]);
  closeNewAccountModal();
  render();
  showToast(`✅ Cuenta "${name}" creada`);
}

// ============================================================
// INCOME MODAL
// ============================================================
function openIncomeModal(accountId) {
  activeAccountId = accountId;
  const acc = accounts.find((a) => a.id === accountId);
  document.getElementById("incomeAccountName").textContent =
    `${acc.icon}  ${acc.name}`;
  document.getElementById("inputIncomeAmount").value = "";
  document.getElementById("inputIncomeDesc").value = "";
  selectedIncomeCategory = "";
  renderCategoryPicker(
    "incomeCategoryPicker",
    "",
    (label) => {
      selectedIncomeCategory = label;
    },
    INCOME_CATEGORIES,
  );
  document.getElementById("modalIncome").classList.add("open");
  setTimeout(() => document.getElementById("inputIncomeAmount").focus(), 150);
}

function closeIncomeModal() {
  document.getElementById("modalIncome").classList.remove("open");
  activeAccountId = null;
}

async function saveIncome() {
  const amount = parseFloat(document.getElementById("inputIncomeAmount").value);
  const desc = document.getElementById("inputIncomeDesc").value.trim();
  if (isNaN(amount) || amount <= 0) {
    showToast("⚠️ Monto inválido", "error");
    return;
  }

  const idx = accounts.findIndex((a) => a.id === activeAccountId);
  if (idx === -1) return;
  const newBalance = accounts[idx].balance + amount;

  const { error } = await supabaseClient
    .from("accounts")
    .update({ balance: newBalance })
    .eq("id", accounts[idx].id);
  if (error) {
    showToast("⚠️ Error al actualizar", "error");
    return;
  }

  accounts[idx].balance = newBalance;
  await recordMovement({
    accountId: accounts[idx].id,
    accountName: accounts[idx].name,
    accountIcon: accounts[idx].icon,
    type: "income",
    amount,
    description: desc,
    category: selectedIncomeCategory,
  });

  const _id = activeAccountId;
  closeIncomeModal();
  activeAccountId = _id;
  render();
  refreshAccountDetail();
  showToast(`↑ +${formatCurrency(amount)} agregado`, "income");
}

// ============================================================
// EXPENSE MODAL
// ============================================================
function openExpenseModal(accountId) {
  activeAccountId = accountId;
  const acc = accounts.find((a) => a.id === accountId);
  document.getElementById("expenseAccountName").textContent =
    `${acc.icon}  ${acc.name}`;
  document.getElementById("inputExpenseAmount").value = "";
  document.getElementById("inputExpenseDesc").value = "";
  selectedExpenseCategory = "";
  renderCategoryPicker("expenseCategoryPicker", "", (label) => {
    selectedExpenseCategory = label;
  });
  document.getElementById("modalExpense").classList.add("open");
  setTimeout(() => document.getElementById("inputExpenseAmount").focus(), 150);
}

function closeExpenseModal() {
  document.getElementById("modalExpense").classList.remove("open");
  activeAccountId = null;
}

async function saveExpense() {
  const amount = parseFloat(
    document.getElementById("inputExpenseAmount").value,
  );
  const desc = document.getElementById("inputExpenseDesc").value.trim();
  if (isNaN(amount) || amount <= 0) {
    showToast("⚠️ Monto inválido", "error");
    return;
  }

  const idx = accounts.findIndex((a) => a.id === activeAccountId);
  if (idx === -1) return;
  const newBalance = accounts[idx].balance - amount;

  const { error } = await supabaseClient
    .from("accounts")
    .update({ balance: newBalance })
    .eq("id", accounts[idx].id);
  if (error) {
    showToast("⚠️ Error al actualizar", "error");
    return;
  }

  accounts[idx].balance = newBalance;
  await recordMovement({
    accountId: accounts[idx].id,
    accountName: accounts[idx].name,
    accountIcon: accounts[idx].icon,
    type: "expense",
    amount,
    description: desc,
    category: selectedExpenseCategory,
  });

  const _id = activeAccountId;
  closeExpenseModal();
  activeAccountId = _id;
  render();
  refreshAccountDetail();
  showToast(`↓ -${formatCurrency(amount)} restado`, "expense");
}

// ============================================================
// BALANCE EDIT
// ============================================================
function startEditBalance() {
  const span = document.getElementById("totalBalance");
  const input = document.getElementById("inputBalanceAmount");
  const btn = document.getElementById("btnEditBalance");
  const calcTotal = accounts.reduce((s, a) => s + a.balance, 0);
  _prevBalanceOffset = balanceOffset;
  input.value = (calcTotal + balanceOffset).toFixed(2);
  span.style.display = "none";
  btn.style.display = "none";
  input.style.display = "block";
  input.focus();
  input.select();
}

function saveBalance() {
  const span = document.getElementById("totalBalance");
  const input = document.getElementById("inputBalanceAmount");
  const btn = document.getElementById("btnEditBalance");
  const entered = parseFloat(input.value);
  if (!isNaN(entered)) {
    balanceOffset = entered - accounts.reduce((s, a) => s + a.balance, 0);
    const labels = loadLabels();
    labels.balanceOffset = balanceOffset;
    localStorage.setItem(DB_KEY_LABELS, JSON.stringify(labels));
  }
  span.style.display = "";
  btn.style.display = "";
  input.style.display = "none";
  render();
}

function cancelBalance() {
  balanceOffset = _prevBalanceOffset;
  document.getElementById("totalBalance").style.display = "";
  document.getElementById("btnEditBalance").style.display = "";
  document.getElementById("inputBalanceAmount").style.display = "none";
}

// ============================================================
// DELETE ACCOUNT
// ============================================================
function openDeleteModal(accountId) {
  activeAccountId = accountId;
  const acc = accounts.find((a) => a.id === accountId);
  document.getElementById("deleteAccountName").textContent =
    `${acc.icon}  ${acc.name}`;
  document.getElementById("modalDelete").classList.add("open");
}

function closeDeleteModal() {
  document.getElementById("modalDelete").classList.remove("open");
  activeAccountId = null;
}

async function confirmDelete() {
  const acc = accounts.find((a) => a.id === activeAccountId);
  if (!acc) return;
  const { error } = await supabaseClient
    .from("accounts")
    .delete()
    .eq("id", activeAccountId);
  if (error) {
    showToast("⚠️ Error al eliminar", "error");
    return;
  }
  accounts = accounts.filter((a) => a.id !== activeAccountId);
  closeDeleteModal();
  closeAccountDetail();
  render();
  showToast(`🗑 Cuenta "${acc.name}" eliminada`);
}

// ============================================================
// NEW CREDIT
// ============================================================
function openNewCreditModal() {
  document.getElementById("inputCreditName").value = "";
  document.getElementById("inputCreditLimit").value = "";
  document.getElementById("inputCreditCutDay").value = "";
  document.getElementById("inputCreditPayDay").value = "";
  selectedCreditIcon = "💳";
  document
    .querySelectorAll("#creditIconPicker .icon-option")
    .forEach((el) =>
      el.classList.toggle("selected", el.dataset.icon === selectedCreditIcon),
    );
  document.getElementById("modalNewCredit").classList.add("open");
  setTimeout(() => document.getElementById("inputCreditName").focus(), 150);
}

function closeNewCreditModal() {
  document.getElementById("modalNewCredit").classList.remove("open");
}

async function saveNewCredit() {
  if (!currentUser) return;
  const name = document.getElementById("inputCreditName").value.trim();
  const limit = parseFloat(document.getElementById("inputCreditLimit").value);
  const cutDay = parseInt(
    document.getElementById("inputCreditCutDay").value,
    10,
  );
  const payDay = parseInt(
    document.getElementById("inputCreditPayDay").value,
    10,
  );

  if (!name) {
    showToast("⚠️ Ingresa nombre", "error");
    return;
  }
  if (isNaN(limit) || limit <= 0) {
    showToast("⚠️ Límite inválido", "error");
    return;
  }
  if (isNaN(cutDay) || cutDay < 1 || cutDay > 31) {
    showToast("⚠️ Día de corte inválido", "error");
    return;
  }
  if (isNaN(payDay) || payDay < 1 || payDay > 31) {
    showToast("⚠️ Día de pago inválido", "error");
    return;
  }

  const { data, error } = await supabaseClient
    .from("credits")
    .insert({
      user_id: currentUser.id,
      name,
      icon: selectedCreditIcon,
      limit_amount: limit,
      balance: 0,
      cut_day: cutDay,
      pay_day: payDay,
    })
    .select();
  if (error) {
    showToast("⚠️ Error al crear crédito", "error");
    return;
  }

  const c = data[0];
  credits.push({
    id: c.id,
    name: c.name,
    icon: c.icon,
    limit: c.limit_amount,
    balance: c.balance,
    cutDay: c.cut_day,
    payDay: c.pay_day,
    createdAt: c.created_at,
  });
  closeNewCreditModal();
  renderCredits();
  showToast(`💳 Crédito "${name}" creado`);
}

// ============================================================
// CARGO / PAGO / DELETE CREDIT
// ============================================================
let selectedCargoCateg = "";

function openCargoModal(creditId) {
  activeCreditId = creditId;
  const c = credits.find((i) => i.id === creditId);
  document.getElementById("cargoCreditName").textContent =
    `${c.icon}  ${c.name}`;
  document.getElementById("inputCargoAmount").value = "";
  document.getElementById("inputCargoDesc").value = "";
  selectedCargoCategory = "";
  renderCategoryPicker("cargoCategoryPicker", "", (label) => {
    selectedCargoCategory = label;
  });
  document.getElementById("modalCargo").classList.add("open");
  setTimeout(() => document.getElementById("inputCargoAmount").focus(), 150);
}

function closeCargoModal() {
  document.getElementById("modalCargo").classList.remove("open");
  activeCreditId = null;
}

async function saveCargo() {
  const amount = parseFloat(document.getElementById("inputCargoAmount").value);
  const desc = document.getElementById("inputCargoDesc").value.trim();
  if (isNaN(amount) || amount <= 0) {
    showToast("⚠️ Monto inválido", "error");
    return;
  }

  const idx = credits.findIndex((i) => i.id === activeCreditId);
  if (idx === -1) return;
  const newBalance = credits[idx].balance + amount;

  const { error } = await supabaseClient
    .from("credits")
    .update({ balance: newBalance })
    .eq("id", credits[idx].id);
  if (error) {
    showToast("⚠️ Error al registrar cargo", "error");
    return;
  }

  credits[idx].balance = newBalance;
  await recordMovement({
    accountId: credits[idx].id,
    accountName: credits[idx].name,
    accountIcon: credits[idx].icon,
    type: "cargo",
    amount,
    description: desc,
    category: selectedCargoCategory,
  });

  const _id = activeCreditId;
  closeCargoModal();
  activeCreditId = _id;
  renderCredits();
  refreshCreditDetail();
  showToast(`📅 Cargo de ${formatCurrency(amount)} registrado`, "expense");
}

function openPagoModal(creditId) {
  activeCreditId = creditId;
  const c = credits.find((i) => i.id === creditId);
  document.getElementById("pagoCreditName").textContent =
    `${c.icon}  ${c.name}`;
  document.getElementById("inputPagoAmount").value = "";
  document.getElementById("inputPagoDesc").value = "";
  document.getElementById("modalPago").classList.add("open");
  setTimeout(() => document.getElementById("inputPagoAmount").focus(), 150);
}

function closePagoModal() {
  document.getElementById("modalPago").classList.remove("open");
  activeCreditId = null;
}

async function savePago() {
  const amount = parseFloat(document.getElementById("inputPagoAmount").value);
  const desc = document.getElementById("inputPagoDesc").value.trim();
  if (isNaN(amount) || amount <= 0) {
    showToast("⚠️ Monto inválido", "error");
    return;
  }

  const idx = credits.findIndex((i) => i.id === activeCreditId);
  if (idx === -1) return;
  const newBalance = Math.max(0, credits[idx].balance - amount);

  const { error } = await supabaseClient
    .from("credits")
    .update({ balance: newBalance })
    .eq("id", credits[idx].id);
  if (error) {
    showToast("⚠️ Error al registrar pago", "error");
    return;
  }

  credits[idx].balance = newBalance;
  await recordMovement({
    accountId: credits[idx].id,
    accountName: credits[idx].name,
    accountIcon: credits[idx].icon,
    type: "pago",
    amount,
    description: desc,
  });

  const _id = activeCreditId;
  closePagoModal();
  activeCreditId = _id;
  renderCredits();
  refreshCreditDetail();
  showToast(`✅ Pago de ${formatCurrency(amount)} registrado`, "income");
}

function openDeleteCreditModal(creditId) {
  activeCreditId = creditId;
  const c = credits.find((i) => i.id === creditId);
  document.getElementById("deleteCreditName").textContent =
    `${c.icon}  ${c.name}`;
  document.getElementById("modalDeleteCredit").classList.add("open");
}

function closeDeleteCreditModal() {
  document.getElementById("modalDeleteCredit").classList.remove("open");
  activeCreditId = null;
}

async function confirmDeleteCredit() {
  const c = credits.find((i) => i.id === activeCreditId);
  if (!c) return;
  const { error } = await supabaseClient
    .from("credits")
    .delete()
    .eq("id", activeCreditId);
  if (error) {
    showToast("⚠️ Error al eliminar", "error");
    return;
  }
  credits = credits.filter((i) => i.id !== activeCreditId);
  closeDeleteCreditModal();
  closeCreditDetail();
  renderCredits();
  showToast(`🗑 Crédito "${c.name}" eliminado`);
}

// ============================================================
// TRANSFER
// ============================================================
function openTransferModal(accountId) {
  activeAccountId = accountId;
  const origin = accounts.find((a) => a.id === accountId);
  document.getElementById("transferOriginName").textContent =
    `Desde: ${origin.icon}  ${origin.name}`;
  document.getElementById("inputTransferAmount").value = "";
  document.getElementById("inputTransferDesc").value = "";

  const select = document.getElementById("selectTransferDest");
  let html = `<option value="" disabled selected>Selecciona destino...</option>`;
  const otherAccs = accounts.filter((a) => a.id !== accountId);
  if (otherAccs.length > 0) {
    html += `<optgroup label="Mis Cuentas">`;
    otherAccs.forEach((a) => {
      html += `<option value="acc_${a.id}">${a.icon} ${a.name} (${formatCurrency(a.balance)})</option>`;
    });
    html += `</optgroup>`;
  }
  if (credits.length > 0) {
    html += `<optgroup label="Mis Créditos (Pago)">`;
    credits.forEach((c) => {
      html += `<option value="cred_${c.id}">${c.icon} ${c.name} (Deuda: ${formatCurrency(c.balance)})</option>`;
    });
    html += `</optgroup>`;
  }
  select.innerHTML = html;
  document.getElementById("modalTransfer").classList.add("open");
  setTimeout(() => document.getElementById("inputTransferAmount").focus(), 150);
}

function closeTransferModal() {
  document.getElementById("modalTransfer").classList.remove("open");
  activeAccountId = null;
}

async function saveTransfer() {
  const amount = parseFloat(
    document.getElementById("inputTransferAmount").value,
  );
  const desc =
    document.getElementById("inputTransferDesc").value.trim() ||
    "Transferencia";
  const destVal = document.getElementById("selectTransferDest").value;

  if (isNaN(amount) || amount <= 0) {
    showToast("⚠️ Monto inválido", "error");
    return;
  }
  if (!destVal) {
    showToast("⚠️ Selecciona destino", "error");
    return;
  }

  const destType = destVal.startsWith("acc_") ? "account" : "credit";
  const destId = destVal.startsWith("acc_")
    ? destVal.substring(4)
    : destVal.substring(5);
  const originIdx = accounts.findIndex((a) => a.id === activeAccountId);
  if (originIdx === -1) return;
  const origin = accounts[originIdx];

  if (destType === "account") {
    const destIdx = accounts.findIndex((a) => a.id === destId);
    if (destIdx === -1) return;
    const dest = accounts[destIdx];
    const { error: e1 } = await supabaseClient
      .from("accounts")
      .update({ balance: origin.balance - amount })
      .eq("id", origin.id);
    const { error: e2 } = await supabaseClient
      .from("accounts")
      .update({ balance: dest.balance + amount })
      .eq("id", dest.id);
    if (e1 || e2) {
      showToast("⚠️ Error al transferir", "error");
      return;
    }
    origin.balance -= amount;
    dest.balance += amount;
    await recordMovement({
      accountId: origin.id,
      accountName: origin.name,
      accountIcon: origin.icon,
      type: "expense",
      amount,
      description: `${desc} (hacia ${dest.name})`,
    });
    await recordMovement({
      accountId: dest.id,
      accountName: dest.name,
      accountIcon: dest.icon,
      type: "income",
      amount,
      description: `${desc} (desde ${origin.name})`,
    });
    showToast(`⇄ ${formatCurrency(amount)} transferidos a ${dest.name}`);
  } else {
    const destIdx = credits.findIndex((c) => c.id === destId);
    if (destIdx === -1) return;
    const dest = credits[destIdx];
    const newDestBal = Math.max(0, dest.balance - amount);
    const { error: e1 } = await supabaseClient
      .from("accounts")
      .update({ balance: origin.balance - amount })
      .eq("id", origin.id);
    const { error: e2 } = await supabaseClient
      .from("credits")
      .update({ balance: newDestBal })
      .eq("id", dest.id);
    if (e1 || e2) {
      showToast("⚠️ Error al abonar crédito", "error");
      return;
    }
    origin.balance -= amount;
    dest.balance = newDestBal;
    await recordMovement({
      accountId: origin.id,
      accountName: origin.name,
      accountIcon: origin.icon,
      type: "expense",
      amount,
      description: `Pago de crédito (${dest.name})`,
    });
    await recordMovement({
      accountId: dest.id,
      accountName: dest.name,
      accountIcon: dest.icon,
      type: "pago",
      amount,
      description: `Abono desde ${origin.name}`,
    });
    showToast(`✅ ${formatCurrency(amount)} abonados a ${dest.name}`);
  }

  const _id = activeAccountId;
  closeTransferModal();
  activeAccountId = _id;
  render();
  renderCredits();
  refreshAccountDetail();
  refreshCreditDetail();
}

// ============================================================
// PAY CREDIT
// ============================================================
function openPayCreditModal(creditId) {
  activeCreditId = creditId;
  const c = credits.find((i) => i.id === creditId);
  document.getElementById("payCreditDestName").textContent =
    `Pagar: ${c.icon}  ${c.name} (Deuda: ${formatCurrency(c.balance)})`;
  document.getElementById("inputPayCreditAmount").value = "";
  document.getElementById("inputPayCreditDesc").value = "";
  const select = document.getElementById("selectPayCreditOrigin");
  select.innerHTML = `<option value="" disabled selected>Selecciona cuenta origen...</option>`;
  accounts.forEach((a) => {
    select.innerHTML += `<option value="${a.id}">${a.icon} ${a.name} (${formatCurrency(a.balance)})</option>`;
  });
  document.getElementById("modalPayCredit").classList.add("open");
  setTimeout(
    () => document.getElementById("inputPayCreditAmount").focus(),
    150,
  );
}

function closePayCreditModal() {
  document.getElementById("modalPayCredit").classList.remove("open");
  activeCreditId = null;
}

async function savePayCredit() {
  const amount = parseFloat(
    document.getElementById("inputPayCreditAmount").value,
  );
  const desc =
    document.getElementById("inputPayCreditDesc").value.trim() ||
    "Pago de tarjeta";
  const originId = document.getElementById("selectPayCreditOrigin").value;
  if (isNaN(amount) || amount <= 0) {
    showToast("⚠️ Monto inválido", "error");
    return;
  }
  if (!originId) {
    showToast("⚠️ Selecciona cuenta origen", "error");
    return;
  }

  const destIdx = credits.findIndex((c) => c.id === activeCreditId);
  const originIdx = accounts.findIndex((a) => a.id === originId);
  if (destIdx === -1 || originIdx === -1) return;

  const dest = credits[destIdx];
  const origin = accounts[originIdx];
  const newDestBal = Math.max(0, dest.balance - amount);

  const { error: e1 } = await supabaseClient
    .from("accounts")
    .update({ balance: origin.balance - amount })
    .eq("id", origin.id);
  const { error: e2 } = await supabaseClient
    .from("credits")
    .update({ balance: newDestBal })
    .eq("id", dest.id);
  if (e1 || e2) {
    showToast("⚠️ Error al registrar pago", "error");
    return;
  }

  origin.balance -= amount;
  dest.balance = newDestBal;
  await recordMovement({
    accountId: origin.id,
    accountName: origin.name,
    accountIcon: origin.icon,
    type: "expense",
    amount,
    description: `${desc} (${dest.name})`,
  });
  await recordMovement({
    accountId: dest.id,
    accountName: dest.name,
    accountIcon: dest.icon,
    type: "pago",
    amount,
    description: `Abono desde ${origin.name}`,
  });

  const _id = activeCreditId;
  closePayCreditModal();
  activeCreditId = _id;
  render();
  renderCredits();
  refreshAccountDetail();
  refreshCreditDetail();
  showToast(`💳 ${formatCurrency(amount)} pagados a ${dest.name}`);
}

// ============================================================
// SETTINGS
// ============================================================
let activeSettingsTab = "income";

function openSettingsModal() {
  activeSettingsTab = "income";
  document.getElementById("tabSettingsIncome").classList.add("active");
  document.getElementById("tabSettingsExpense").classList.remove("active");
  document.getElementById("settingsPanelIncome").style.display = "";
  document.getElementById("settingsPanelExpense").style.display = "none";
  document.getElementById("inputIncomeCatEmoji").value = "";
  document.getElementById("inputIncomeCatLabel").value = "";
  document.getElementById("inputExpenseCatEmoji").value = "";
  document.getElementById("inputExpenseCatLabel").value = "";
  renderSettingsCatList("income");
  renderSettingsCatList("expense");
  document.getElementById("modalSettings").classList.add("open");
}

function closeSettingsModal() {
  document.getElementById("modalSettings").classList.remove("open");
}

function switchSettingsTab(tab) {
  activeSettingsTab = tab;
  const isIncome = tab === "income";
  document
    .getElementById("tabSettingsIncome")
    .classList.toggle("active", isIncome);
  document
    .getElementById("tabSettingsExpense")
    .classList.toggle("active", !isIncome);
  document.getElementById("settingsPanelIncome").style.display = isIncome
    ? ""
    : "none";
  document.getElementById("settingsPanelExpense").style.display = isIncome
    ? "none"
    : "";
}

function renderSettingsCatList(type) {
  const cats = type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const container = document.getElementById(
    type === "income" ? "incomeCatList" : "expenseCatList",
  );
  if (!container) return;
  if (cats.length === 0) {
    container.innerHTML = `<div class="settings-empty">Sin categorías.</div>`;
    return;
  }
  container.innerHTML = cats
    .map(
      (cat, idx) => `
    <div class="settings-cat-item">
      <span class="settings-cat-emoji">${escapeHtml(cat.emoji)}</span>
      <span class="settings-cat-label">${escapeHtml(cat.label)}</span>
      <button class="settings-cat-delete" onclick="deleteCategory('${type}', ${idx})">🗑</button>
    </div>`,
    )
    .join("");
}

function addCategory(type) {
  const emojiInput = document.getElementById(
    type === "income" ? "inputIncomeCatEmoji" : "inputExpenseCatEmoji",
  );
  const labelInput = document.getElementById(
    type === "income" ? "inputIncomeCatLabel" : "inputExpenseCatLabel",
  );
  const emoji = emojiInput.value.trim();
  const label = labelInput.value.trim();
  if (!label) {
    showToast("⚠️ Escribe un nombre", "error");
    return;
  }
  if (!emoji) {
    showToast("⚠️ Pon un emoji", "error");
    return;
  }
  const cats = type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  if (cats.some((c) => c.label.toLowerCase() === label.toLowerCase())) {
    showToast("⚠️ Ya existe esa categoría", "error");
    return;
  }
  cats.push({ emoji, label });
  saveCategoriesToStorage();
  renderSettingsCatList(type);
  emojiInput.value = "";
  labelInput.value = "";
  showToast(`✅ Categoría "${label}" agregada`);
}

function deleteCategory(type, idx) {
  const cats = type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const removed = cats.splice(idx, 1)[0];
  saveCategoriesToStorage();
  renderSettingsCatList(type);
  showToast(`🗑 Categoría "${removed.label}" eliminada`);
}

// ============================================================
// PAYMENTS MODULE
// ============================================================

// ---- Helpers ----
function getActivePayMonth() {
  const stored = localStorage.getItem(LS_PAY_MONTH);
  if (stored) return stored;
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function setActivePayMonth(val) {
  localStorage.setItem(LS_PAY_MONTH, val);
}

function getQuincenaLabel(q, month) {
  const [y, m] = month.split("-");
  const day = q === "q1" ? "01" : "15";
  const monthNames = [
    "Enero",
    "Febrero",
    "Marzo",
    "Abril",
    "Mayo",
    "Junio",
    "Julio",
    "Agosto",
    "Septiembre",
    "Octubre",
    "Noviembre",
    "Diciembre",
  ];
  return `${q === "q1" ? "Q1" : "Q2"} · ${day} ${monthNames[parseInt(m, 10) - 1]} ${y}`;
}

function getPayQuincenaItems(month, quincena, type) {
  return paymentItems.filter(
    (i) => i.month === month && i.quincena === quincena && i.item_type === type,
  );
}

function getPaySavings(month, quincena) {
  return (
    paymentSavings.find((s) => s.month === month && s.quincena === quincena) ||
    null
  );
}

function buildMoneyLocationOptions(selectedVal) {
  const opts = [
    { value: "empty", label: "— Vacía" },
    { value: "paid", label: "✓ Pagado" },
  ];
  accounts.forEach((a) =>
    opts.push({ value: `acc_${a.id}`, label: `${a.icon} ${a.name}` }),
  );
  credits.forEach((c) =>
    opts.push({ value: `cred_${c.id}`, label: `${c.icon} ${c.name}` }),
  );
  return opts
    .map(
      (o) =>
        `<option value="${o.value}"${o.value === selectedVal ? " selected" : ""}>${escapeHtml(o.label)}</option>`,
    )
    .join("");
}

function buildPaymentMethodOptions(selectedVal) {
  const opts = [{ value: "", label: "—" }];
  accounts.forEach((a) =>
    opts.push({ value: `acc_${a.id}`, label: `${a.icon} ${a.name}` }),
  );
  credits.forEach((c) =>
    opts.push({ value: `cred_${c.id}`, label: `${c.icon} ${c.name}` }),
  );
  return opts
    .map(
      (o) =>
        `<option value="${o.value}"${o.value === selectedVal ? " selected" : ""}>${escapeHtml(o.label)}</option>`,
    )
    .join("");
}

function resolveLocationLabel(val) {
  if (!val || val === "empty") return { label: "Vacía", cls: "loc-empty" };
  if (val === "paid") return { label: "Pagado", cls: "loc-paid" };
  if (val.startsWith("acc_")) {
    const acc = accounts.find((a) => `acc_${a.id}` === val);
    return acc
      ? { label: `${acc.icon} ${acc.name}`, cls: "loc-account" }
      : { label: val, cls: "" };
  }
  if (val.startsWith("cred_")) {
    const cr = credits.find((c) => `cred_${c.id}` === val);
    return cr
      ? { label: `${cr.icon} ${cr.name}`, cls: "loc-credit" }
      : { label: val, cls: "" };
  }
  return { label: val, cls: "" };
}

function resolveMethodLabel(val) {
  if (!val) return "—";
  if (val.startsWith("acc_")) {
    const acc = accounts.find((a) => `acc_${a.id}` === val);
    return acc ? `${acc.icon} ${acc.name}` : val;
  }
  if (val.startsWith("cred_")) {
    const cr = credits.find((c) => `cred_${c.id}` === val);
    return cr ? `${cr.icon} ${cr.name}` : val;
  }
  return val;
}

// ---- Main render ----
function renderPayments() {
  const month = getActivePayMonth();

  // Sync month input
  const monthInput = document.getElementById("payMonthInput");
  if (monthInput) monthInput.value = month;

  // Restore last active quincena
  const storedTab = localStorage.getItem(LS_PAY_TAB);
  if (storedTab) activePayQuincena = storedTab;

  // Render tabs
  ["q1", "q2"].forEach((q) => {
    const btn = document.getElementById(`payTab_${q}`);
    if (btn) btn.classList.toggle("active", q === activePayQuincena);
  });

  renderPayQuincena(month, activePayQuincena);
}

function switchPayTab(q) {
  activePayQuincena = q;
  localStorage.setItem(LS_PAY_TAB, q);
  renderPayments();
}

function renderPayQuincena(month, quincena) {
  const container = document.getElementById("payQuincenaContent");
  if (!container) return;

  const quincenal = paymentConfig ? paymentConfig.monthlyIncome / 2 : 0;
  const savingsAmt = paymentConfig
    ? Math.round((quincenal * paymentConfig.savingsPct) / 100)
    : 0;
  const fixedBudget = paymentConfig
    ? Math.round((quincenal * paymentConfig.fixedPct) / 100)
    : 0;

  const savings = getPaySavings(month, quincena);
  const fixedItems = getPayQuincenaItems(month, quincena, "fixed");
  const varItems = getPayQuincenaItems(month, quincena, "variable");

  const fixedTotal = fixedItems.reduce(
    (s, i) => s + (parseFloat(i.amount) || 0),
    0,
  );
  const varTotal = varItems.reduce(
    (s, i) => s + (parseFloat(i.amount) || 0),
    0,
  );

  container.innerHTML = `
    <!-- ① AHORRO -->
    <div class="pay-section">
      <div class="pay-savings-row">
        <label class="pay-savings-check">
          <input type="checkbox" id="savingsCheck"
            ${savings && savings.checked ? "checked" : ""}
            onchange="toggleSavings('${month}','${quincena}',this.checked)" />
          <span class="pay-savings-box"></span>
        </label>
        <div class="pay-savings-text">
          <span class="pay-savings-label">Ahorro quincenal</span>
          ${
            paymentConfig
              ? `<span class="pay-savings-amount">${formatCurrency(savingsAmt)}</span>
               <span class="pay-savings-pct">(${paymentConfig.savingsPct}% de ${formatCurrency(quincenal)})</span>`
              : `<span class="pay-savings-pct">Sin configurar</span>`
          }
        </div>
        ${
          savings && savings.checked
            ? `<span class="pay-savings-done">✓ Transferido</span>`
            : ""
        }
      </div>
    </div>

    <!-- ② GASTOS FIJOS -->
    <div class="pay-section">
      <div class="pay-section-header">
        <div class="pay-section-title">
          <span class="pay-section-icon">📌</span> Gastos Fijos
          ${
            paymentConfig
              ? `<span class="pay-budget-chip">${formatCurrency(fixedBudget)} presupuesto · ${formatCurrency(fixedTotal)} usado</span>`
              : ""
          }
        </div>
        <button class="btn btn-ghost pay-add-btn" onclick="addPayItem('${month}','${quincena}','fixed')">+ Agregar</button>
      </div>
      <div class="pay-table-wrap">
        ${renderPayTable(fixedItems, month, quincena, "fixed")}
      </div>
    </div>

    <!-- ③ GASTOS VARIABLES -->
    <div class="pay-section">
      <div class="pay-section-header">
        <div class="pay-section-title">
          <span class="pay-section-icon">🔄</span> Gastos Variables
          <span class="pay-budget-chip">${formatCurrency(varTotal)} total</span>
        </div>
        <button class="btn btn-ghost pay-add-btn" onclick="addPayItem('${month}','${quincena}','variable')">+ Agregar</button>
      </div>
      <div class="pay-table-wrap">
        ${renderPayTable(varItems, month, quincena, "variable")}
      </div>
    </div>
  `;
}

function renderPayTable(items, month, quincena, type) {
  if (items.length === 0) {
    return `<div class="pay-empty">Sin registros · <button class="pay-link-btn" onclick="addPayItem('${month}','${quincena}','${type}')">Agregar uno</button></div>`;
  }

  const rows = items
    .map((item) => {
      const loc = resolveLocationLabel(item.money_location);
      const method = resolveMethodLabel(item.payment_method);
      const payDate = item.pay_date
        ? new Date(item.pay_date + "T00:00:00").toLocaleDateString("es-MX", {
            day: "2-digit",
            month: "short",
          })
        : "—";
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const isOverdue =
        item.pay_date &&
        !item.already_charged &&
        new Date(item.pay_date + "T00:00:00") < today &&
        item.money_location !== "paid";

      return `<tr class="pay-row${item.already_charged ? " pay-row-charged" : ""}${isOverdue ? " pay-row-overdue" : ""}" data-id="${item.id}">
      <td class="pay-td pay-td-concept">
        <span class="pay-concept-text" title="${escapeHtml(item.concept)}">${escapeHtml(item.concept) || '<em style="color:var(--text-muted)">Sin concepto</em>'}</span>
      </td>
      <td class="pay-td pay-td-method">
        <span class="pay-method-chip">${escapeHtml(method)}</span>
      </td>
      <td class="pay-td pay-td-amount">
        ${formatCurrency(item.amount)}
      </td>
      <td class="pay-td pay-td-location">
        <span class="pay-loc-badge ${loc.cls}">${escapeHtml(loc.label)}</span>
      </td>
      <td class="pay-td pay-td-charged">
        <input type="checkbox" class="pay-check" title="Ya se hizo el cobro"
          ${item.already_charged ? "checked" : ""}
          onchange="toggleCharged('${item.id}', this.checked)" />
      </td>
      <td class="pay-td pay-td-date ${isOverdue ? "pay-date-overdue" : ""}">
        ${payDate}
      </td>
      <td class="pay-td pay-td-actions">
        <button class="pay-action-btn" onclick="openEditPayItem('${item.id}')" title="Editar">✏️</button>
        <button class="pay-action-btn pay-action-del" onclick="deletePayItem('${item.id}')" title="Eliminar">🗑</button>
      </td>
    </tr>`;
    })
    .join("");

  const total = items.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);

  return `<table class="pay-table">
    <thead>
      <tr>
        <th class="pay-th" style="width:28%">Concepto</th>
        <th class="pay-th" style="width:16%">Forma de pago</th>
        <th class="pay-th" style="width:12%">Monto</th>
        <th class="pay-th" style="width:18%">Dónde está</th>
        <th class="pay-th" style="width:8%" title="Ya se hizo el cobro">Cobro</th>
        <th class="pay-th" style="width:12%">F. pago</th>
        <th class="pay-th" style="width:6%"></th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
    <tfoot>
      <tr>
        <td colspan="2" class="pay-tfoot-label">Total</td>
        <td class="pay-tfoot-total">${formatCurrency(total)}</td>
        <td colspan="4"></td>
      </tr>
    </tfoot>
  </table>`;
}

// ---- Savings toggle ----
async function toggleSavings(month, quincena, checked) {
  if (!currentUser) return;
  const existing = getPaySavings(month, quincena);
  if (existing) {
    const { error } = await supabaseClient
      .from("payment_savings")
      .update({ checked })
      .eq("id", existing.id);
    if (error) {
      showToast("⚠️ Error al guardar", "error");
      return;
    }
    existing.checked = checked;
  } else {
    const { data, error } = await supabaseClient
      .from("payment_savings")
      .insert({ user_id: currentUser.id, month, quincena, checked })
      .select();
    if (error) {
      showToast("⚠️ Error al guardar", "error");
      return;
    }
    paymentSavings.push(data[0]);
  }
  renderPayments();
}

// ---- Charged toggle ----
async function toggleCharged(itemId, checked) {
  const { error } = await supabaseClient
    .from("payment_items")
    .update({ already_charged: checked })
    .eq("id", itemId);
  if (error) {
    showToast("⚠️ Error al guardar", "error");
    return;
  }
  const idx = paymentItems.findIndex((i) => i.id === itemId);
  if (idx !== -1) paymentItems[idx].already_charged = checked;
  // Re-render only the table rows without full page flicker
  renderPayments();
}

// ---- Add item ----
async function addPayItem(month, quincena, type) {
  if (!currentUser) return;
  const { data, error } = await supabaseClient
    .from("payment_items")
    .insert({
      user_id: currentUser.id,
      month,
      quincena,
      item_type: type,
      concept: "",
      payment_method: "",
      amount: 0,
      money_location: "empty",
      already_charged: false,
      pay_date: null,
      sort_order: paymentItems.filter(
        (i) =>
          i.month === month && i.quincena === quincena && i.item_type === type,
      ).length,
    })
    .select();
  if (error) {
    showToast("⚠️ Error al agregar", "error");
    return;
  }
  paymentItems.push(data[0]);
  renderPayments();
  // Auto-open edit modal for the new row
  openEditPayItem(data[0].id);
}

// ---- Edit item modal ----
let activePayItemId = null;

function openEditPayItem(itemId) {
  activePayItemId = itemId;
  const item = paymentItems.find((i) => i.id === itemId);
  if (!item) return;

  document.getElementById("editPayConcept").value = item.concept || "";
  document.getElementById("editPayMethod").innerHTML =
    buildPaymentMethodOptions(item.payment_method || "");
  document.getElementById("editPayAmount").value = item.amount || "";
  document.getElementById("editPayLocation").innerHTML =
    buildMoneyLocationOptions(item.money_location || "empty");
  document.getElementById("editPayCharged").checked = !!item.already_charged;
  document.getElementById("editPayDate").value = item.pay_date || "";

  document.getElementById("modalEditPayItem").classList.add("open");
  setTimeout(() => document.getElementById("editPayConcept").focus(), 150);
}

function closeEditPayItem() {
  document.getElementById("modalEditPayItem").classList.remove("open");
  activePayItemId = null;
}

async function saveEditPayItem() {
  if (!activePayItemId) return;
  const idx = paymentItems.findIndex((i) => i.id === activePayItemId);
  if (idx === -1) return;

  const concept = document.getElementById("editPayConcept").value.trim();
  const paymentMethod = document.getElementById("editPayMethod").value;
  const amount =
    parseFloat(document.getElementById("editPayAmount").value) || 0;
  const moneyLocation = document.getElementById("editPayLocation").value;
  const alreadyCharged = document.getElementById("editPayCharged").checked;
  const payDate = document.getElementById("editPayDate").value || null;

  const { error } = await supabaseClient
    .from("payment_items")
    .update({
      concept,
      payment_method: paymentMethod,
      amount,
      money_location: moneyLocation,
      already_charged: alreadyCharged,
      pay_date: payDate,
    })
    .eq("id", activePayItemId);

  if (error) {
    showToast("⚠️ Error al guardar", "error");
    return;
  }

  paymentItems[idx] = {
    ...paymentItems[idx],
    concept,
    payment_method: paymentMethod,
    amount,
    money_location: moneyLocation,
    already_charged: alreadyCharged,
    pay_date: payDate,
  };

  closeEditPayItem();
  renderPayments();
  showToast("✅ Guardado");
}

// ---- Delete item ----
async function deletePayItem(itemId) {
  if (!confirm("¿Eliminar este registro?")) return;
  const { error } = await supabaseClient
    .from("payment_items")
    .delete()
    .eq("id", itemId);
  if (error) {
    showToast("⚠️ Error al eliminar", "error");
    return;
  }
  paymentItems = paymentItems.filter((i) => i.id !== itemId);
  renderPayments();
  showToast("🗑 Eliminado");
}

// ---- Month navigation ----
function changePayMonth(val) {
  setActivePayMonth(val);
  renderPayments();
}

function prevPayMonth() {
  const current = getActivePayMonth();
  const [y, m] = current.split("-").map(Number);
  const prev =
    m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  setActivePayMonth(prev);
  renderPayments();
}

function nextPayMonth() {
  const current = getActivePayMonth();
  const [y, m] = current.split("-").map(Number);
  const next =
    m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  setActivePayMonth(next);
  renderPayments();
}

// ============================================================
// EVENT LISTENERS
// ============================================================
document.addEventListener("DOMContentLoaded", () => {
  initCategories();
  loadQuincenas();

  // New Account
  document
    .getElementById("btnNewAccount")
    .addEventListener("click", openNewAccountModal);
  document
    .getElementById("btnCloseNewAccount")
    .addEventListener("click", closeNewAccountModal);
  document
    .getElementById("btnCancelNew")
    .addEventListener("click", closeNewAccountModal);
  document
    .getElementById("btnSaveNewAccount")
    .addEventListener("click", saveNewAccount);

  // Income
  document
    .getElementById("btnCloseIncome")
    .addEventListener("click", closeIncomeModal);
  document
    .getElementById("btnCancelIncome")
    .addEventListener("click", closeIncomeModal);
  document
    .getElementById("btnSaveIncome")
    .addEventListener("click", saveIncome);

  // Expense
  document
    .getElementById("btnCloseExpense")
    .addEventListener("click", closeExpenseModal);
  document
    .getElementById("btnCancelExpense")
    .addEventListener("click", closeExpenseModal);
  document
    .getElementById("btnSaveExpense")
    .addEventListener("click", saveExpense);

  // Delete account
  document
    .getElementById("btnCloseDelete")
    .addEventListener("click", closeDeleteModal);
  document
    .getElementById("btnCancelDelete")
    .addEventListener("click", closeDeleteModal);
  document
    .getElementById("btnConfirmDelete")
    .addEventListener("click", confirmDelete);

  // Detail modals
  document
    .getElementById("btnCloseAccountDetail")
    .addEventListener("click", closeAccountDetail);
  document
    .getElementById("btnCloseCreditDetail")
    .addEventListener("click", closeCreditDetail);

  // New Credit
  document
    .getElementById("btnNewCredit")
    .addEventListener("click", openNewCreditModal);
  document
    .getElementById("btnCloseNewCredit")
    .addEventListener("click", closeNewCreditModal);
  document
    .getElementById("btnCancelNewCredit")
    .addEventListener("click", closeNewCreditModal);
  document
    .getElementById("btnSaveNewCredit")
    .addEventListener("click", saveNewCredit);

  // Cargo
  document
    .getElementById("btnCloseCargo")
    .addEventListener("click", closeCargoModal);
  document
    .getElementById("btnCancelCargo")
    .addEventListener("click", closeCargoModal);
  document.getElementById("btnSaveCargo").addEventListener("click", saveCargo);

  // Pago
  document
    .getElementById("btnClosePago")
    .addEventListener("click", closePagoModal);
  document
    .getElementById("btnCancelPago")
    .addEventListener("click", closePagoModal);
  document.getElementById("btnSavePago").addEventListener("click", savePago);

  // Delete Credit
  document
    .getElementById("btnCloseDeleteCredit")
    .addEventListener("click", closeDeleteCreditModal);
  document
    .getElementById("btnCancelDeleteCredit")
    .addEventListener("click", closeDeleteCreditModal);
  document
    .getElementById("btnConfirmDeleteCredit")
    .addEventListener("click", confirmDeleteCredit);

  // Transfer
  document
    .getElementById("btnCloseTransfer")
    .addEventListener("click", closeTransferModal);
  document
    .getElementById("btnCancelTransfer")
    .addEventListener("click", closeTransferModal);
  document
    .getElementById("btnSaveTransfer")
    .addEventListener("click", saveTransfer);

  // Pay Credit
  document
    .getElementById("btnClosePayCredit")
    .addEventListener("click", closePayCreditModal);
  document
    .getElementById("btnCancelPayCredit")
    .addEventListener("click", closePayCreditModal);
  document
    .getElementById("btnSavePayCredit")
    .addEventListener("click", savePayCredit);

  // Icon pickers
  document.getElementById("iconPicker").addEventListener("click", (e) => {
    const opt = e.target.closest(".icon-option");
    if (!opt) return;
    document
      .querySelectorAll("#iconPicker .icon-option")
      .forEach((el) => el.classList.remove("selected"));
    opt.classList.add("selected");
    selectedIcon = opt.dataset.icon;
  });
  document.getElementById("creditIconPicker").addEventListener("click", (e) => {
    const opt = e.target.closest(".icon-option");
    if (!opt) return;
    document
      .querySelectorAll("#creditIconPicker .icon-option")
      .forEach((el) => el.classList.remove("selected"));
    opt.classList.add("selected");
    selectedCreditIcon = opt.dataset.icon;
  });

  // New Purchase
  document
    .getElementById("btnCloseNewPurchase")
    .addEventListener("click", closeNewPurchaseModal);
  document
    .getElementById("btnCancelNewPurchase")
    .addEventListener("click", closeNewPurchaseModal);
  document
    .getElementById("btnSaveNewPurchase")
    .addEventListener("click", saveNewPurchase);

  // Edit Purchase
  document
    .getElementById("btnCloseEditPurchase")
    .addEventListener("click", closeEditPurchaseModal);
  document
    .getElementById("btnCancelEditPurchase")
    .addEventListener("click", closeEditPurchaseModal);
  document
    .getElementById("btnSaveEditPurchase")
    .addEventListener("click", saveEditPurchase);

  // Quincena Manager
  document
    .getElementById("btnCloseQuincenas")
    .addEventListener("click", closeQuincenaManager);
  document
    .getElementById("btnCloseQuincenas2")
    .addEventListener("click", closeQuincenaManager);

  // Settings
  document
    .getElementById("btnCloseSettings")
    .addEventListener("click", closeSettingsModal);

  // Logout
  document.getElementById("btnLogout").addEventListener("click", logoutUser);

  // Close on backdrop click
  document.querySelectorAll(".modal-overlay").forEach((overlay) => {
    overlay.addEventListener("click", (e) => {
      if (e.target !== overlay) return;
      overlay.classList.remove("open");
      if (
        overlay.id !== "modalAccountDetail" &&
        overlay.id !== "modalCreditDetail"
      ) {
        activeAccountId = null;
        activeCreditId = null;
      }
    });
  });

  // Enter key shortcuts
  document
    .getElementById("inputAccountName")
    .addEventListener("keydown", (e) => {
      if (e.key === "Enter") saveNewAccount();
    });
  document
    .getElementById("inputIncomeAmount")
    .addEventListener("keydown", (e) => {
      if (e.key === "Enter") saveIncome();
    });
  document
    .getElementById("inputExpenseAmount")
    .addEventListener("keydown", (e) => {
      if (e.key === "Enter") saveExpense();
    });
  document
    .getElementById("inputCreditName")
    .addEventListener("keydown", (e) => {
      if (e.key === "Enter") saveNewCredit();
    });
  document
    .getElementById("inputCargoAmount")
    .addEventListener("keydown", (e) => {
      if (e.key === "Enter") saveCargo();
    });
  document
    .getElementById("inputPagoAmount")
    .addEventListener("keydown", (e) => {
      if (e.key === "Enter") savePago();
    });
  document
    .getElementById("inputPayCreditAmount")
    .addEventListener("keydown", (e) => {
      if (e.key === "Enter") savePayCredit();
    });

  // Pay Item Modal
  document
    .getElementById("btnCloseEditPayItem")
    .addEventListener("click", closeEditPayItem);
  document
    .getElementById("btnCancelEditPayItem")
    .addEventListener("click", closeEditPayItem);
  document
    .getElementById("btnSaveEditPayItem")
    .addEventListener("click", saveEditPayItem);

  // Init app
  switchView("cuentas");
  checkUser();
  applyStoredOffset();
});

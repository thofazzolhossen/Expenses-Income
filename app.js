// --- Formatting Helpers ---
function getTodayDateStr() {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

function formatMonthYear(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length >= 2) {
        const date = new Date(parts[0], parseInt(parts[1]) - 1);
        return `${date.toLocaleString('en-US', { month: 'short' })}-${parts[0]}`;
    }
    return dateStr;
}

function formatDateDisplay(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    let year, month, day;
    if (parts.length === 3) {
        [year, month, day] = parts;
    } else if (parts.length === 2) {
        [year, month] = parts;
        day = '01';
    } else {
        return dateStr;
    }
    const date = new Date(year, parseInt(month) - 1, day);
    const formattedDay = String(day).padStart(2, '0');
    return `${formattedDay}-${date.toLocaleString('en-US', { month: 'short' })}-${year}`;
}

function getMonthKey(dateStr) {
    return dateStr ? dateStr.substring(0, 7) : '';
}

function formatAmount(amount) {
    return amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ============================================================
// Non Bank Liability — Running Interest Calculator
//
// Remain Interest = interestMonthly × monthsElapsed − totalIntPaid
//   where monthsElapsed = months from loan start date to today (inclusive).
//
// The 6-month cycle grouping is for display only:
//   Breaks running months into 6-month windows so user can see
//   which block of months is unpaid. Partial current cycle shown
//   as "In Progress".
//
// Example: Loan Jan 2024, $1,000/mo, today May 2026
//   monthsElapsed=28, totalAccrued=$28,000
//   Cycles: Jan-Jun 2024 | Jul-Dec 2024 | Jan-Jun 2025 | Jul-Dec 2025 (4 full)
//   + partial: Jan-May 2026 (5 months, $5,000) — In Progress
// ============================================================
function calcNBCycleInterest(startDateStr, interestMonthly, totalIntPaid, remainMainAmt) {
    if (!startDateStr) return { totalAccrued: 0, remainInterest: 0, monthsElapsed: 0, cycleDetails: [] };

    const parts = startDateStr.split('-');
    const startYear = parseInt(parts[0]);
    const startMonth = parseInt(parts[1]) - 1; // 0-indexed
    const today = new Date();

    // Months elapsed from loan start month to current month (inclusive)
    const monthsElapsed =
        (today.getFullYear() - startYear) * 12 +
        (today.getMonth() - startMonth) + 1;

    if (monthsElapsed <= 0) return { totalAccrued: 0, remainInterest: 0, monthsElapsed: 0, cycleDetails: [] };

    const totalAccrued = interestMonthly * monthsElapsed;
    const remainInterest = Math.max(0, totalAccrued - totalIntPaid);

    // Build 6-month cycle breakdown for display
    const cycleDetails = [];
    let monthsCovered = 0;
    let intPaidRemaining = totalIntPaid;

    while (monthsCovered < monthsElapsed) {
        const cycleMonths = Math.min(6, monthsElapsed - monthsCovered);
        const isPartial = cycleMonths < 6;
        const cycleNo = cycleDetails.length + 1;
        const cycleDue = interestMonthly * cycleMonths;

        // Calendar start label
        const csAbsMonth = startMonth + monthsCovered;
        const csYear = startYear + Math.floor(csAbsMonth / 12);
        const csMonth = csAbsMonth % 12;
        // Calendar end label
        const ceAbsMonth = startMonth + monthsCovered + cycleMonths - 1;
        const ceYear = startYear + Math.floor(ceAbsMonth / 12);
        const ceMonth = ceAbsMonth % 12;

        const csLabel = new Date(csYear, csMonth, 1).toLocaleString('en-US', { month: 'short', year: 'numeric' });
        const ceLabel = new Date(ceYear, ceMonth, 1).toLocaleString('en-US', { month: 'short', year: 'numeric' });
        const label = csLabel === ceLabel ? csLabel : `${csLabel} → ${ceLabel}`;

        // Attribute paid amount to this cycle
        const coveredByPaid = Math.min(intPaidRemaining, cycleDue);
        intPaidRemaining = Math.max(0, intPaidRemaining - coveredByPaid);
        const cycleUnpaid = cycleDue - coveredByPaid;

        cycleDetails.push({ label, cycleNo, cycleMonths, cycleDue, coveredByPaid, cycleUnpaid, isPartial });
        monthsCovered += cycleMonths;
    }

    return { totalAccrued, remainInterest, monthsElapsed, cycleDetails };
}

// Chart Instances
let adminPieChartInstance = null;
let adminMonthTrendChartInstance = null;
let adminMissingChartInstance = null;
let userMonthChartInstance = null;
let userYearChartInstance = null;
let bankPieChartInstance = null;
let bankCompChartInstance = null;
let niPieChartInstance = null;
let niProfitChartInstance = null;

// UI States
let expandedBankRows = new Set();
let expandedNBRows = new Set();
let expandedNIRows = new Set();

// --- Initialize "Database" using LocalStorage ---
function getDB() {
    let fetchedIncomes = JSON.parse(localStorage.getItem('incomes')) || [];
    fetchedIncomes = fetchedIncomes.map(i => {
        if (i.month && !i.date) i.date = i.month;
        return i;
    });
    return {
        users: JSON.parse(localStorage.getItem('users')) || [],
        incomes: fetchedIncomes,
        bankLiabilities: JSON.parse(localStorage.getItem('bankLiabilities')) || [],
        nonBankLiabilities: JSON.parse(localStorage.getItem('nonBankLiabilities')) || [],
        nonInterestLiabilities: JSON.parse(localStorage.getItem('nonInterestLiabilities')) || [],
        currentUser: JSON.parse(localStorage.getItem('currentUser')) || null
    };
}

function saveToDB(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Migrate old data: strip ONLY legacy auto-generated rows (isPaid=false AND no date/assignBy/amt AND no paidOnly flag)
// This preserves: paid rows, user-added assign rows (even unsaved), and direct paid rows
function migrateNBSchedules() {
    const raw = JSON.parse(localStorage.getItem('nonBankLiabilities')) || [];
    let changed = false;
    const migrated = raw.map(b => {
        const isLegacyAutoRow = s =>
            s.isPaid === false &&
            !s.paidOnly &&
            !s.date && !s.assignBy && !s.amt &&
            !s.paidDate && !s.paidBy && !s.paidAmt &&
            s._legacy === true; // only strip rows explicitly tagged as legacy

        // For safety: don't strip anything unless it has the _legacy flag
        // This means old data without the flag is kept as-is
        const intFiltered = (b.interestSchedules || []).filter(s => !isLegacyAutoRow(s));
        const mainFiltered = (b.mainAmtSchedules || []).filter(s => !isLegacyAutoRow(s));

        if (intFiltered.length !== (b.interestSchedules || []).length ||
            mainFiltered.length !== (b.mainAmtSchedules || []).length) {
            changed = true;
        }
        return { ...b, interestSchedules: intFiltered, mainAmtSchedules: mainFiltered };
    });
    if (changed) {
        localStorage.setItem('nonBankLiabilities', JSON.stringify(migrated));
    }
}

// ------ Authentication System ------
function register() {
    const user = document.getElementById('auth-username').value.trim();
    const pass = document.getElementById('auth-password').value.trim();
    if (!user || !pass) return alert("Enter username & password!");
    const db = getDB();
    if (db.users.find(u => u.username === user)) return alert("User already exists!");
    const newUser = { id: generateId(), username: user, password: pass };
    db.users.push(newUser);
    saveToDB('users', db.users);
    alert("Account Opened Successfully! You can now login.");
}

function login() {
    const user = document.getElementById('auth-username').value.trim();
    const pass = document.getElementById('auth-password').value.trim();
    const db = getDB();
    const validUser = db.users.find(u => u.username === user && u.password === pass);
    if (validUser) {
        saveToDB('currentUser', validUser);
        checkAuth();
    } else {
        alert("Invalid credentials!");
    }
}

function logout() {
    localStorage.removeItem('currentUser');
    checkAuth();
}

// ------ Navigation & UI Manager ------
function checkAuth() {
    const db = getDB();
    const isAuth = db.currentUser !== null;
    document.getElementById('nav-user-dash').classList.toggle('hidden', !isAuth);
    document.getElementById('nav-admin-dash').classList.toggle('hidden', !isAuth);
    document.getElementById('nav-expense-dash').classList.toggle('hidden', !isAuth);
    document.getElementById('nav-logout').classList.toggle('hidden', !isAuth);
    if (isAuth) {
        document.getElementById('welcome-text').innerText = `- Welcome, ${db.currentUser.username}`;
        showSection('user-dashboard');
    } else {
        showSection('auth-section');
    }
}

function showSection(sectionId) {
    document.getElementById('auth-section').classList.add('hidden');
    document.getElementById('user-dashboard').classList.add('hidden');
    document.getElementById('admin-dashboard').classList.add('hidden');
    document.getElementById('expense-dashboard').classList.add('hidden');
    document.getElementById(sectionId).classList.remove('hidden');
    if (sectionId === 'user-dashboard') { resetIncomeForm(); renderUserDashboard(); }
    if (sectionId === 'admin-dashboard') renderAdminDashboard();
    if (sectionId === 'expense-dashboard') {
        resetBankForm(); resetNBForm(); resetNIForm(); renderExpenseDashboard();
    }
}

function showExpenseTab(tabName) {
    document.getElementById('expense-bank-section').classList.add('hidden');
    document.getElementById('expense-nb-section').classList.add('hidden');
    document.getElementById('expense-ni-section').classList.add('hidden');
    ['tab-bank', 'tab-nb', 'tab-ni'].forEach(id => {
        document.getElementById(id).classList.remove('active', 'fw-bold');
    });
    if (tabName === 'bank') {
        document.getElementById('expense-bank-section').classList.remove('hidden');
        document.getElementById('tab-bank').classList.add('active', 'fw-bold');
    } else if (tabName === 'nb') {
        document.getElementById('expense-nb-section').classList.remove('hidden');
        document.getElementById('tab-nb').classList.add('active', 'fw-bold');
    } else if (tabName === 'ni') {
        document.getElementById('expense-ni-section').classList.remove('hidden');
        document.getElementById('tab-ni').classList.add('active', 'fw-bold');
    }
}

// ------ User Dashboard ------
function saveIncome() {
    const id = document.getElementById('income-id').value;
    const amount = parseFloat(document.getElementById('income-amount').value);
    const dateVal = document.getElementById('income-date').value;
    const desc = document.getElementById('income-desc').value;
    const db = getDB();
    if (!amount || !dateVal || !desc) return alert("Fill all fields!");
    if (id) {
        const index = db.incomes.findIndex(i => i.id === id);
        db.incomes[index] = { ...db.incomes[index], amount, date: dateVal, desc };
    } else {
        db.incomes.push({ id: generateId(), userId: db.currentUser.id, amount, date: dateVal, desc });
    }
    saveToDB('incomes', db.incomes);
    resetIncomeForm();
    renderUserDashboard();
}

function deleteIncome(id) {
    if (!confirm("Delete this income record?")) return;
    const db = getDB();
    db.incomes = db.incomes.filter(i => i.id !== id);
    saveToDB('incomes', db.incomes);
    renderUserDashboard();
}

function editIncome(id) {
    const db = getDB();
    const inc = db.incomes.find(i => i.id === id);
    if (!inc) return;
    document.getElementById('income-id').value = inc.id;
    document.getElementById('income-amount').value = inc.amount;
    document.getElementById('income-date').value = inc.date || inc.month;
    document.getElementById('income-desc').value = inc.desc;
    document.getElementById('income-form-title').innerText = "Edit Income";
    document.getElementById('cancel-edit-btn').classList.remove('hidden');
}

function resetIncomeForm() {
    document.getElementById('income-form').reset();
    document.getElementById('income-id').value = '';
    const dateInput = document.getElementById('income-date');
    if (dateInput) dateInput.value = getTodayDateStr();
    document.getElementById('income-form-title').innerText = "Add Income";
    document.getElementById('cancel-edit-btn').classList.add('hidden');
}

function renderUserDashboard() {
    const db = getDB();
    const filterMonth = document.getElementById('filter-user-month').value;
    const tbody = document.getElementById('user-income-list');
    tbody.innerHTML = '';
    let userIncomes = db.incomes.filter(i => i.userId === db.currentUser.id);
    if (filterMonth) userIncomes = userIncomes.filter(i => getMonthKey(i.date) === filterMonth);
    let total = 0;
    const monthDataMap = {};
    const yearDataMap = {};
    userIncomes.sort((a, b) => b.date.localeCompare(a.date)).forEach(inc => {
        total += inc.amount;
        tbody.innerHTML += `
            <tr>
                <td>${formatDateDisplay(inc.date)}</td>
                <td>${inc.desc}</td>
                <td>$${formatAmount(inc.amount)}</td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="editIncome('${inc.id}')">Edit</button>
                    <button class="btn btn-sm btn-danger" onclick="deleteIncome('${inc.id}')">Delete</button>
                </td>
            </tr>`;
        const monthKey = getMonthKey(inc.date);
        const monthLabel = formatMonthYear(monthKey);
        const yearLabel = monthKey.split('-')[0];
        if (!monthDataMap[monthLabel]) monthDataMap[monthLabel] = 0;
        monthDataMap[monthLabel] += inc.amount;
        if (!yearDataMap[yearLabel]) yearDataMap[yearLabel] = 0;
        yearDataMap[yearLabel] += inc.amount;
    });
    document.getElementById('user-total-income').innerText = formatAmount(total);
    renderUserCharts(monthDataMap, yearDataMap);
}

function clearUserFilter() {
    document.getElementById('filter-user-month').value = '';
    renderUserDashboard();
}

// ------ Admin Dashboard ------
function renderAdminDashboard() {
    const db = getDB();
    const userSelect = document.getElementById('filter-admin-user');
    const currentSelectedUser = userSelect.value;
    userSelect.innerHTML = '<option value="">All Users</option>';
    db.users.forEach(u => {
        userSelect.innerHTML += `<option value="${u.id}" ${u.id === currentSelectedUser ? 'selected' : ''}>${u.username}</option>`;
    });
    const filterMonth = document.getElementById('filter-admin-month').value;
    const filterUser = document.getElementById('filter-admin-user').value;
    const tbody = document.getElementById('admin-income-list');
    tbody.innerHTML = '';
    document.getElementById('admin-total-users').innerText = db.users.length;
    let filteredIncomes = db.incomes;
    if (filterMonth) filteredIncomes = filteredIncomes.filter(i => getMonthKey(i.date) === filterMonth);
    if (filterUser) filteredIncomes = filteredIncomes.filter(i => i.userId === filterUser);
    let globalTotal = 0;
    const pieDataMap = {};
    const groupedByMonth = {};
    filteredIncomes.forEach(inc => {
        globalTotal += inc.amount;
        const u = db.users.find(u => u.id === inc.userId);
        const username = u ? u.username : 'Unknown';
        if (!pieDataMap[username]) pieDataMap[username] = 0;
        pieDataMap[username] += inc.amount;
        const mKey = getMonthKey(inc.date);
        if (!groupedByMonth[mKey]) groupedByMonth[mKey] = { monthKey: mKey, total: 0, records: [] };
        groupedByMonth[mKey].total += inc.amount;
        groupedByMonth[mKey].records.push({ username, desc: inc.desc, amount: inc.amount, exactDate: inc.date });
    });
    Object.values(groupedByMonth).sort((a, b) => b.monthKey.localeCompare(a.monthKey)).forEach(group => {
        const classMonthId = group.monthKey.replace('-', '');
        tbody.innerHTML += `
            <tr class="table-secondary cursor-pointer" onclick="document.querySelectorAll('.child-${classMonthId}').forEach(r => r.classList.toggle('hidden'))">
                <td><strong>📅 ${formatMonthYear(group.monthKey)}</strong></td>
                <td><span class="badge bg-secondary">${group.records.length} Upload(s)</span></td>
                <td class="text-success"><strong>$${formatAmount(group.total)}</strong></td>
                <td class="text-end"><button class="btn btn-sm btn-outline-dark">Expand / Collapse</button></td>
            </tr>`;
        group.records.forEach(rec => {
            tbody.innerHTML += `
                <tr class="child-${classMonthId} hidden">
                    <td class="ps-4 text-primary">↳ <strong>${formatDateDisplay(rec.exactDate)}</strong> <small class="text-muted ms-2">(${rec.username})</small></td>
                    <td>${rec.desc}</td>
                    <td>$${formatAmount(rec.amount)}</td>
                    <td></td>
                </tr>`;
        });
    });
    document.getElementById('admin-total-income').innerText = "$" + formatAmount(globalTotal);
    const trendIncomes = filterUser ? db.incomes.filter(i => i.userId === filterUser) : db.incomes;
    const activeTrendMonthKeys = [...new Set(trendIncomes.map(i => getMonthKey(i.date)))].sort();
    const trendLabels = activeTrendMonthKeys.map(m => formatMonthYear(m));
    const trendDatasets = [];
    const colors = ['#0d6efd', '#198754', '#dc3545', '#ffc107', '#0dcaf0', '#6f42c1', '#d63384', '#fd7e14'];
    let cIdx = 0;
    const trendUserIds = [...new Set(trendIncomes.map(i => i.userId))];
    trendUserIds.forEach(uid => {
        const u = db.users.find(x => x.id === uid);
        const uname = u ? u.username : 'Unknown';
        const dataForUser = activeTrendMonthKeys.map(mKey =>
            trendIncomes.filter(i => i.userId === uid && getMonthKey(i.date) === mKey).reduce((a, b) => a + b.amount, 0)
        );
        trendDatasets.push({ label: uname, data: dataForUser, backgroundColor: colors[cIdx % colors.length] });
        cIdx++;
    });
    const targetMonthKeys = filterMonth ? [filterMonth] : [...new Set(db.incomes.map(i => getMonthKey(i.date)))].sort();
    document.getElementById('missing-chart-title').innerText = filterMonth ? `Missing Income: ${formatMonthYear(filterMonth)}` : "Total Missing Months (All Time)";
    const missingUsers = [];
    const missingDatasets = [];
    const missingMatrix = {};
    targetMonthKeys.forEach(m => missingMatrix[m] = []);
    db.users.forEach(u => {
        const userMonthKeys = new Set(db.incomes.filter(i => i.userId === u.id).map(i => getMonthKey(i.date)));
        const missedKeysForUser = targetMonthKeys.filter(m => !userMonthKeys.has(m));
        if (missedKeysForUser.length > 0) {
            missingUsers.push(u.username);
            targetMonthKeys.forEach(mKey => { missingMatrix[mKey].push(missedKeysForUser.includes(mKey) ? 1 : 0); });
        }
    });
    const mColors = ['#dc3545', '#fd7e14', '#ffc107', '#d63384', '#6f42c1', '#0dcaf0'];
    let mCIdx = 0;
    targetMonthKeys.forEach(mKey => {
        if (missingMatrix[mKey].some(val => val === 1)) {
            missingDatasets.push({ label: formatMonthYear(mKey), data: missingMatrix[mKey], backgroundColor: mColors[mCIdx % mColors.length] });
            mCIdx++;
        }
    });
    renderAdminCharts(pieDataMap, { labels: trendLabels, datasets: trendDatasets }, { labels: missingUsers, datasets: missingDatasets });
}

function clearAdminFilter() {
    document.getElementById('filter-admin-month').value = '';
    document.getElementById('filter-admin-user').value = '';
    renderAdminDashboard();
}

// ============================================
// ====== BANK LIABILITY CRUD ======
// ============================================
function resetBankForm() {
    document.getElementById('bank-form').reset();
    document.getElementById('bank-id').value = '';
    document.getElementById('bank-date').value = getTodayDateStr();
    document.getElementById('bank-form-title').innerText = "Add Bank Liability";
    document.getElementById('cancel-bank-btn').classList.add('hidden');
}

function saveBankLiability() {
    const id = document.getElementById('bank-id').value;
    const name = document.getElementById('bank-name').value.trim();
    const date = document.getElementById('bank-date').value;
    const assignTo = document.getElementById('bank-assign').value;
    const totalAmt = parseFloat(document.getElementById('bank-amount').value);
    const months = parseInt(document.getElementById('bank-months').value);
    const haveToPay = parseFloat(document.getElementById('bank-have-to-pay').value);
    const monthlyPay = parseFloat(document.getElementById('bank-monthly-pay').value);
    if (!name || !date || !assignTo || isNaN(totalAmt) || isNaN(months) || isNaN(haveToPay) || isNaN(monthlyPay)) {
        return alert("Fill all available fields!");
    }
    const db = getDB();
    if (id) {
        const idx = db.bankLiabilities.findIndex(b => b.id === id);
        db.bankLiabilities[idx] = { ...db.bankLiabilities[idx], name, date, assignTo, totalAmt, totalMonths: months, haveToPay, monthlyPay };
    } else {
        db.bankLiabilities.push({ id: generateId(), name, date, assignTo, totalAmt, totalMonths: months, haveToPay, monthlyPay, payments: [] });
    }
    saveToDB('bankLiabilities', db.bankLiabilities);
    resetBankForm();
    renderExpenseDashboard();
}

function editBankLiability(id) {
    const db = getDB();
    const bank = db.bankLiabilities.find(b => b.id === id);
    if (!bank) return;
    document.getElementById('bank-id').value = bank.id;
    document.getElementById('bank-name').value = bank.name;
    document.getElementById('bank-date').value = bank.date;
    document.getElementById('bank-assign').value = bank.assignTo;
    document.getElementById('bank-amount').value = bank.totalAmt;
    document.getElementById('bank-months').value = bank.totalMonths;
    document.getElementById('bank-have-to-pay').value = bank.haveToPay !== undefined ? bank.haveToPay : (bank.totalAmt + (bank.interest || 0));
    document.getElementById('bank-monthly-pay').value = bank.monthlyPay || 0;
    document.getElementById('bank-form-title').innerText = "Edit Bank Liability";
    document.getElementById('cancel-bank-btn').classList.remove('hidden');
}

function deleteBankLiability(id) {
    if (!confirm("Delete this entire Bank liability record?")) return;
    const db = getDB();
    db.bankLiabilities = db.bankLiabilities.filter(b => b.id !== id);
    saveToDB('bankLiabilities', db.bankLiabilities);
    renderExpenseDashboard();
}

function toggleBankRow(id) {
    if (expandedBankRows.has(id)) { expandedBankRows.delete(id); } else { expandedBankRows.add(id); cancelBankPayment(id); }
    document.querySelectorAll(`.child-bank-${id}`).forEach(r => {
        if (expandedBankRows.has(id)) r.classList.remove('hidden');
        else r.classList.add('hidden');
    });
}

function togglePaymentForm(liabId) {
    document.getElementById(`add-payment-${liabId}`).classList.toggle('hidden');
    document.getElementById(`pay-id-${liabId}`).value = '';
}

function editBankPayment(liabId, pmtId) {
    const db = getDB();
    const bank = db.bankLiabilities.find(b => b.id === liabId);
    const pmt = bank.payments.find(p => p.id === pmtId);
    if (!pmt) return;
    document.getElementById(`pay-id-${liabId}`).value = pmt.id;
    document.getElementById(`pay-date-${liabId}`).value = pmt.date;
    document.getElementById(`pay-provider-${liabId}`).value = pmt.provider;
    document.getElementById(`pay-amount-${liabId}`).value = pmt.amount;
    document.getElementById(`add-payment-${liabId}`).classList.remove('hidden');
    document.getElementById(`btn-submit-pay-${liabId}`).innerText = "Update";
    document.getElementById(`btn-cancel-pay-${liabId}`).classList.remove('hidden');
}

function cancelBankPayment(liabId) {
    const fields = ['pay-id', 'pay-date', 'pay-provider', 'pay-amount'];
    fields.forEach(f => { const el = document.getElementById(`${f}-${liabId}`); if (el) { el.value = f === 'pay-date' ? getTodayDateStr() : ''; } });
    const addPmtPanel = document.getElementById(`add-payment-${liabId}`);
    if (addPmtPanel) addPmtPanel.classList.add('hidden');
    const btnCancel = document.getElementById(`btn-cancel-pay-${liabId}`);
    if (btnCancel) btnCancel.classList.add('hidden');
    const btnSubmit = document.getElementById(`btn-submit-pay-${liabId}`);
    if (btnSubmit) btnSubmit.innerText = "Save";
}

function saveBankPayment(liabId) {
    const payId = document.getElementById(`pay-id-${liabId}`).value;
    const date = document.getElementById(`pay-date-${liabId}`).value;
    const provider = document.getElementById(`pay-provider-${liabId}`).value.trim();
    const amount = parseFloat(document.getElementById(`pay-amount-${liabId}`).value);
    if (!date || !provider || !amount) return alert("Fill all payment fields!");
    const db = getDB();
    const bankIndex = db.bankLiabilities.findIndex(x => x.id === liabId);
    if (payId) {
        const pmtIndex = db.bankLiabilities[bankIndex].payments.findIndex(p => p.id === payId);
        db.bankLiabilities[bankIndex].payments[pmtIndex] = { id: payId, date, provider, amount };
    } else {
        if (db.bankLiabilities[bankIndex].payments.length >= db.bankLiabilities[bankIndex].totalMonths) {
            return alert("All specified months have already been paid for this schedule!");
        }
        db.bankLiabilities[bankIndex].payments.push({ id: generateId(), date, provider, amount });
    }
    saveToDB('bankLiabilities', db.bankLiabilities);
    renderExpenseDashboard();
}

function deleteBankPayment(liabId, pmtId) {
    if (!confirm("Are you sure you want to delete this payment?")) return;
    const db = getDB();
    const bankIndex = db.bankLiabilities.findIndex(x => x.id === liabId);
    db.bankLiabilities[bankIndex].payments = db.bankLiabilities[bankIndex].payments.filter(p => p.id !== pmtId);
    saveToDB('bankLiabilities', db.bankLiabilities);
    renderExpenseDashboard();
}

// ============================================
// ====== NON BANK LIABILITY CRUD ======
// ============================================
function resetNBForm() {
    document.getElementById('nb-form').reset();
    document.getElementById('nb-id').value = '';
    document.getElementById('nb-date').value = getTodayDateStr();
    document.getElementById('nb-form-title').innerText = "Add Non Bank Liab.";
    document.getElementById('cancel-nb-btn').classList.add('hidden');
}

function saveNBLiability() {
    const id = document.getElementById('nb-id').value;
    const name = document.getElementById('nb-name').value.trim();
    const date = document.getElementById('nb-date').value;
    const assignTo = document.getElementById('nb-assign').value;
    const totalAmt = parseFloat(document.getElementById('nb-amount').value);
    const duration = parseInt(document.getElementById('nb-months').value);
    const interestMonthly = parseFloat(document.getElementById('nb-interest').value);
    if (!name || !date || !assignTo || isNaN(totalAmt) || isNaN(duration) || isNaN(interestMonthly)) {
        return alert("Fill all available fields!");
    }
    const db = getDB();
    if (id) {
        const idx = db.nonBankLiabilities.findIndex(b => b.id === id);
        db.nonBankLiabilities[idx] = { ...db.nonBankLiabilities[idx], name, date, assignTo, totalAmt, totalMonths: duration, interestMonthly };
    } else {
        db.nonBankLiabilities.push({
            id: generateId(), name, date, assignTo, totalAmt, totalMonths: duration, interestMonthly,
            interestSchedules: [], mainAmtSchedules: []
        });
    }
    saveToDB('nonBankLiabilities', db.nonBankLiabilities);
    resetNBForm();
    renderExpenseDashboard();
}

function editNBLiability(id) {
    const db = getDB();
    const liab = db.nonBankLiabilities.find(b => b.id === id);
    if (!liab) return;
    document.getElementById('nb-id').value = liab.id;
    document.getElementById('nb-name').value = liab.name;
    document.getElementById('nb-date').value = liab.date;
    document.getElementById('nb-assign').value = liab.assignTo;
    document.getElementById('nb-amount').value = liab.totalAmt;
    document.getElementById('nb-months').value = liab.totalMonths;
    document.getElementById('nb-interest').value = liab.interestMonthly;
    document.getElementById('nb-form-title').innerText = "Edit Non Bank Liab.";
    document.getElementById('cancel-nb-btn').classList.remove('hidden');
}

function deleteNBLiability(id) {
    if (!confirm("Delete this entire Non Bank liability record?")) return;
    const db = getDB();
    db.nonBankLiabilities = db.nonBankLiabilities.filter(b => b.id !== id);
    saveToDB('nonBankLiabilities', db.nonBankLiabilities);
    renderExpenseDashboard();
}

function toggleNBRow(id) {
    if (expandedNBRows.has(id)) { expandedNBRows.delete(id); } else { expandedNBRows.add(id); }
    document.querySelectorAll(`.child-nb-${id}`).forEach(r => {
        if (expandedNBRows.has(id)) r.classList.remove('hidden');
        else r.classList.add('hidden');
    });
}

// ---- Add an "Assign" row (unpaid schedule) ----
function addNBScheduleRow(liabId, type) {
    const db = getDB();
    const idx = db.nonBankLiabilities.findIndex(x => x.id === liabId);
    const liab = db.nonBankLiabilities[idx];
    const scheduleList = type === 'int' ? liab.interestSchedules : liab.mainAmtSchedules;
    if (scheduleList.length >= liab.totalMonths) {
        return alert(`Maximum ${liab.totalMonths} rows allowed.`);
    }
    scheduleList.push({ date: '', assignBy: '', amt: '', isPaid: false, paidDate: '', paidBy: '', paidAmt: '', paidOnly: false });
    saveToDB('nonBankLiabilities', db.nonBankLiabilities);
    renderExpenseDashboard();
}

// ---- Add a "Paid" row (direct paid entry) ----
function addNBPaidRow(liabId, type) {
    const db = getDB();
    const idx = db.nonBankLiabilities.findIndex(x => x.id === liabId);
    const liab = db.nonBankLiabilities[idx];
    const scheduleList = type === 'int' ? liab.interestSchedules : liab.mainAmtSchedules;
    if (scheduleList.length >= liab.totalMonths) {
        return alert(`Maximum ${liab.totalMonths} rows allowed.`);
    }
    scheduleList.push({ date: '', assignBy: '', amt: '', isPaid: false, paidDate: '', paidBy: '', paidAmt: '', paidOnly: true });
    saveToDB('nonBankLiabilities', db.nonBankLiabilities);
    renderExpenseDashboard();
}

function saveNBRowEdit(liabId, type, i) {
    const db = getDB();
    const idx = db.nonBankLiabilities.findIndex(x => x.id === liabId);
    const scheduleList = type === 'int' ? db.nonBankLiabilities[idx].interestSchedules : db.nonBankLiabilities[idx].mainAmtSchedules;
    const dateVal = document.getElementById(`row-date-${type}-${liabId}-${i}`).value;
    const assignBy = document.getElementById(`row-assign-${type}-${liabId}-${i}`).value;
    const amt = parseFloat(document.getElementById(`row-amt-${type}-${liabId}-${i}`).value);
    if (!dateVal || !assignBy || isNaN(amt) || amt <= 0) {
        return alert("Please fill Date, Assign By, and a valid Amount before saving!");
    }
    scheduleList[i].date = dateVal;
    scheduleList[i].assignBy = assignBy;
    scheduleList[i].amt = amt;
    saveToDB('nonBankLiabilities', db.nonBankLiabilities);
    renderExpenseDashboard();
}

function saveNBPaidRowEdit(liabId, type, i) {
    const db = getDB();
    const idx = db.nonBankLiabilities.findIndex(x => x.id === liabId);
    const scheduleList = type === 'int' ? db.nonBankLiabilities[idx].interestSchedules : db.nonBankLiabilities[idx].mainAmtSchedules;
    const pDate = document.getElementById(`paid-date-${type}-${liabId}-${i}`).value;
    const pBy = document.getElementById(`paid-by-${type}-${liabId}-${i}`).value;
    const pAmt = parseFloat(document.getElementById(`paid-amt-${type}-${liabId}-${i}`).value);
    if (!pDate || !pBy || isNaN(pAmt) || pAmt <= 0) {
        return alert("Please fill Paid Date, Paid By, and a valid Paid Amount!");
    }
    scheduleList[i].isPaid = true;
    scheduleList[i].paidDate = pDate;
    scheduleList[i].paidBy = pBy;
    scheduleList[i].paidAmt = pAmt;
    scheduleList[i].date = pDate;
    scheduleList[i].amt = pAmt;
    saveToDB('nonBankLiabilities', db.nonBankLiabilities);
    renderExpenseDashboard();
}

function initiateNBPay(liabId, type, itemIndex) {
    const targetObj = document.getElementById(`pay-panel-${type}-${liabId}-${itemIndex}`);
    if (targetObj) targetObj.classList.toggle('hidden');
}

function executeNBPay(liabId, type, itemIndex) {
    const db = getDB();
    const idx = db.nonBankLiabilities.findIndex(x => x.id === liabId);
    const scheduleList = type === 'int' ? db.nonBankLiabilities[idx].interestSchedules : db.nonBankLiabilities[idx].mainAmtSchedules;
    const row = scheduleList[itemIndex];
    if (!row.date || !row.assignBy || !row.amt) {
        return alert("Please save the schedule details (Date, Assign By, Amount) before marking as paid.");
    }
    const pDate = document.getElementById(`pay-date-${type}-${liabId}-${itemIndex}`).value;
    const pBy = document.getElementById(`pay-by-${type}-${liabId}-${itemIndex}`).value;
    const pAmt = parseFloat(document.getElementById(`pay-amt-${type}-${liabId}-${itemIndex}`).value);
    if (!pDate || !pBy || isNaN(pAmt) || pAmt <= 0) {
        return alert("Please fill all Paid fields with valid data!");
    }
    row.isPaid = true;
    row.paidDate = pDate;
    row.paidBy = pBy;
    row.paidAmt = pAmt;
    saveToDB('nonBankLiabilities', db.nonBankLiabilities);
    renderExpenseDashboard();
}

function revertNBPay(liabId, type, itemIndex) {
    if (!confirm("Revert this payment to an unpaid state?")) return;
    const db = getDB();
    const idx = db.nonBankLiabilities.findIndex(x => x.id === liabId);
    const scheduleList = type === 'int' ? db.nonBankLiabilities[idx].interestSchedules : db.nonBankLiabilities[idx].mainAmtSchedules;
    scheduleList[itemIndex].isPaid = false;
    scheduleList[itemIndex].paidDate = '';
    scheduleList[itemIndex].paidBy = '';
    scheduleList[itemIndex].paidAmt = '';
    saveToDB('nonBankLiabilities', db.nonBankLiabilities);
    renderExpenseDashboard();
}

function deleteNBScheduleRow(liabId, type, itemIndex) {
    if (!confirm("Are you sure you want to delete this schedule row?")) return;
    const db = getDB();
    const idx = db.nonBankLiabilities.findIndex(x => x.id === liabId);
    const scheduleList = type === 'int' ? db.nonBankLiabilities[idx].interestSchedules : db.nonBankLiabilities[idx].mainAmtSchedules;
    scheduleList.splice(itemIndex, 1);
    saveToDB('nonBankLiabilities', db.nonBankLiabilities);
    renderExpenseDashboard();
}

// ============================================
// ====== NON INTEREST LIABILITY CRUD ======
// ============================================
function resetNIForm() {
    document.getElementById('ni-form').reset();
    document.getElementById('ni-id').value = '';
    document.getElementById('ni-date').value = getTodayDateStr();
    document.getElementById('ni-form-title').innerText = "Add Non Interest Liab.";
    document.getElementById('cancel-ni-btn').classList.add('hidden');
}

function saveNILiability() {
    const id = document.getElementById('ni-id').value;
    const name = document.getElementById('ni-name').value.trim();
    const date = document.getElementById('ni-date').value;
    const assignTo = document.getElementById('ni-assign').value;
    const totalAmt = parseFloat(document.getElementById('ni-amount').value);
    const months = parseInt(document.getElementById('ni-months').value);
    if (!name || !date || !assignTo || isNaN(totalAmt) || isNaN(months)) {
        return alert("Fill all available fields!");
    }
    const db = getDB();
    if (id) {
        const idx = db.nonInterestLiabilities.findIndex(b => b.id === id);
        db.nonInterestLiabilities[idx] = { ...db.nonInterestLiabilities[idx], name, date, assignTo, totalAmt, totalMonths: months };
    } else {
        db.nonInterestLiabilities.push({ id: generateId(), name, date, assignTo, totalAmt, totalMonths: months, payments: [] });
    }
    saveToDB('nonInterestLiabilities', db.nonInterestLiabilities);
    resetNIForm();
    renderExpenseDashboard();
}

function editNILiability(id) {
    const db = getDB();
    const liab = db.nonInterestLiabilities.find(b => b.id === id);
    if (!liab) return;
    document.getElementById('ni-id').value = liab.id;
    document.getElementById('ni-name').value = liab.name;
    document.getElementById('ni-date').value = liab.date;
    document.getElementById('ni-assign').value = liab.assignTo;
    document.getElementById('ni-amount').value = liab.totalAmt;
    document.getElementById('ni-months').value = liab.totalMonths;
    document.getElementById('ni-form-title').innerText = "Edit Non Interest Liab.";
    document.getElementById('cancel-ni-btn').classList.remove('hidden');
}

function deleteNILiability(id) {
    if (!confirm("Delete this entire Non Interest liability record?")) return;
    const db = getDB();
    db.nonInterestLiabilities = db.nonInterestLiabilities.filter(b => b.id !== id);
    saveToDB('nonInterestLiabilities', db.nonInterestLiabilities);
    renderExpenseDashboard();
}

function toggleNIRow(id) {
    if (expandedNIRows.has(id)) { expandedNIRows.delete(id); } else { expandedNIRows.add(id); cancelNIPayment(id); }
    document.querySelectorAll(`.child-ni-${id}`).forEach(r => {
        if (expandedNIRows.has(id)) r.classList.remove('hidden');
        else r.classList.add('hidden');
    });
}

function toggleNIPaymentForm(liabId) {
    document.getElementById(`add-ni-payment-${liabId}`).classList.toggle('hidden');
    document.getElementById(`pay-ni-id-${liabId}`).value = '';
}

function editNIPayment(liabId, pmtId) {
    const db = getDB();
    const liab = db.nonInterestLiabilities.find(b => b.id === liabId);
    const pmt = liab.payments.find(p => p.id === pmtId);
    if (!pmt) return;
    document.getElementById(`pay-ni-id-${liabId}`).value = pmt.id;
    document.getElementById(`pay-ni-date-${liabId}`).value = pmt.date;
    document.getElementById(`pay-ni-provider-${liabId}`).value = pmt.provider;
    document.getElementById(`pay-ni-amount-${liabId}`).value = pmt.amount;
    document.getElementById(`add-ni-payment-${liabId}`).classList.remove('hidden');
    document.getElementById(`btn-submit-ni-pay-${liabId}`).innerText = "Update";
    document.getElementById(`btn-cancel-ni-pay-${liabId}`).classList.remove('hidden');
}

function cancelNIPayment(liabId) {
    const pIdObj = document.getElementById(`pay-ni-id-${liabId}`);
    if (pIdObj) pIdObj.value = '';
    const pDateObj = document.getElementById(`pay-ni-date-${liabId}`);
    if (pDateObj) pDateObj.value = getTodayDateStr();
    const pProvObj = document.getElementById(`pay-ni-provider-${liabId}`);
    if (pProvObj) pProvObj.value = '';
    const pAmtObj = document.getElementById(`pay-ni-amount-${liabId}`);
    if (pAmtObj) pAmtObj.value = '';
    const addPmtPanel = document.getElementById(`add-ni-payment-${liabId}`);
    if (addPmtPanel) addPmtPanel.classList.add('hidden');
    const btnCancel = document.getElementById(`btn-cancel-ni-pay-${liabId}`);
    if (btnCancel) btnCancel.classList.add('hidden');
    const btnSubmit = document.getElementById(`btn-submit-ni-pay-${liabId}`);
    if (btnSubmit) btnSubmit.innerText = "Save";
}

function saveNIPayment(liabId) {
    const payId = document.getElementById(`pay-ni-id-${liabId}`).value;
    const date = document.getElementById(`pay-ni-date-${liabId}`).value;
    const provider = document.getElementById(`pay-ni-provider-${liabId}`).value.trim();
    const amount = parseFloat(document.getElementById(`pay-ni-amount-${liabId}`).value);
    if (!date || !provider || !amount) return alert("Fill all payment fields!");
    const db = getDB();
    const idx = db.nonInterestLiabilities.findIndex(x => x.id === liabId);
    if (payId) {
        const pmtIndex = db.nonInterestLiabilities[idx].payments.findIndex(p => p.id === payId);
        db.nonInterestLiabilities[idx].payments[pmtIndex] = { id: payId, date, provider, amount };
    } else {
        if (db.nonInterestLiabilities[idx].payments.length >= db.nonInterestLiabilities[idx].totalMonths) {
            return alert("All specified months have already been paid for this schedule!");
        }
        db.nonInterestLiabilities[idx].payments.push({ id: generateId(), date, provider, amount });
    }
    saveToDB('nonInterestLiabilities', db.nonInterestLiabilities);
    renderExpenseDashboard();
}

function deleteNIPayment(liabId, pmtId) {
    if (!confirm("Are you sure you want to delete this payment?")) return;
    const db = getDB();
    const idx = db.nonInterestLiabilities.findIndex(x => x.id === liabId);
    db.nonInterestLiabilities[idx].payments = db.nonInterestLiabilities[idx].payments.filter(p => p.id !== pmtId);
    saveToDB('nonInterestLiabilities', db.nonInterestLiabilities);
    renderExpenseDashboard();
}

// ============================================
// ====== EXPENSE DASHBOARD RENDER ENGINE ======
// ============================================
function renderExpenseDashboard() {
    const db = getDB();

    // Build user options HTML for dropdowns
    let userOptionsHTML = '<option value="">Select User</option>';
    db.users.forEach(u => { userOptionsHTML += `<option value="${u.id}">${u.username}</option>`; });
    ['bank-assign', 'nb-assign', 'ni-assign'].forEach(dd => {
        const dObj = document.getElementById(dd);
        if (!dObj) return;
        const currVal = dObj.value;
        dObj.innerHTML = userOptionsHTML;
        if (currVal) dObj.value = currVal;
    });

    // ---- 1. BANK LIABILITIES ----
    const tbodyBank = document.getElementById('bank-list');
    tbodyBank.innerHTML = '';
    const bankChartAgg = {};

    db.bankLiabilities.forEach(b => {
        const u = db.users.find(x => x.id === b.assignTo);
        const assignedName = u ? u.username : 'Unknown';
        const totalPaid = b.payments.reduce((sum, p) => sum + p.amount, 0);
        const haveToPay = b.haveToPay !== undefined ? b.haveToPay : (b.totalAmt + (b.interest || 0));
        const calculatedInterest = haveToPay - b.totalAmt;
        const calculatedRemainingAmt = Math.max(0, haveToPay - totalPaid);
        const calculatedRemainingMonths = Math.max(0, b.totalMonths - b.payments.length);

        if (!bankChartAgg[b.name]) bankChartAgg[b.name] = { total: 0, interest: 0 };
        bankChartAgg[b.name].total += b.totalAmt;
        bankChartAgg[b.name].interest += calculatedInterest;

        const isExpanded = expandedBankRows.has(b.id);
        const displayClass = isExpanded ? '' : 'hidden';

        tbodyBank.innerHTML += `
            <tr class="table-light cursor-pointer" onclick="toggleBankRow('${b.id}')">
                <td class="text-primary"><strong>${b.name}</strong></td>
                <td>${formatDateDisplay(b.date)}</td>
                <td>${assignedName}</td>
                <td>$${formatAmount(b.totalAmt)}</td>
                <td class="text-success">$${formatAmount(calculatedInterest)}</td>
                <td class="text-primary">$${formatAmount(b.monthlyPay || 0)}</td>
                <td class="text-danger fw-bold">$${formatAmount(calculatedRemainingAmt)}</td>
                <td><span class="badge ${calculatedRemainingMonths === 0 ? 'bg-success' : 'bg-warning text-dark'}">${calculatedRemainingMonths}</span></td>
                <td class="text-center">
                    <button class="btn btn-sm btn-primary" onclick="event.stopPropagation(); editBankLiability('${b.id}')">Edit</button>
                    <button class="btn btn-sm btn-danger" onclick="event.stopPropagation(); deleteBankLiability('${b.id}')">Del</button>
                    <button class="btn btn-sm btn-dark" onclick="event.stopPropagation(); toggleBankRow('${b.id}')">↕</button>
                </td>
            </tr>`;

        let subRowsHtml = '';
        for (let i = 0; i < b.totalMonths; i++) {
            const p = b.payments[i];
            if (p) {
                subRowsHtml += `
                    <tr>
                        <td class="text-center text-muted border-end">#${i + 1}</td>
                        <td>${formatDateDisplay(p.date)}</td>
                        <td>${p.provider}</td>
                        <td class="text-success fw-bold">$${formatAmount(p.amount)}</td>
                        <td class="text-center">
                            <button class="btn btn-sm btn-outline-primary py-0" onclick="editBankPayment('${b.id}', '${p.id}')">✏️</button>
                            <button class="btn btn-sm btn-outline-danger py-0" onclick="deleteBankPayment('${b.id}', '${p.id}')">❌</button>
                        </td>
                    </tr>`;
            } else {
                subRowsHtml += `
                    <tr class="table-secondary text-muted">
                        <td class="text-center border-end">#${i + 1}</td>
                        <td>-</td><td>-</td><td>-</td>
                        <td class="text-center">-</td>
                    </tr>`;
            }
        }

        tbodyBank.innerHTML += `
            <tr class="child-bank-${b.id} ${displayClass} bg-light">
                <td colspan="9" class="p-3">
                    <div class="border rounded p-3 bg-white shadow-sm">
                        <div class="d-flex justify-content-between align-items-center mb-3">
                            <h6 class="mb-0 text-primary">Payments Schedule (${b.payments.length} / ${b.totalMonths} Paid)</h6>
                            ${b.payments.length < b.totalMonths
                ? `<button class="btn btn-sm btn-primary" onclick="togglePaymentForm('${b.id}')">+ Add Payment</button>`
                : `<span class="badge bg-success fs-6">All Months Paid</span>`}
                        </div>
                        <div id="add-payment-${b.id}" class="row g-2 mb-3 hidden border-bottom border-primary pb-3">
                            <input type="hidden" id="pay-id-${b.id}">
                            <div class="col-md-3">
                                <label class="small">Payment Date</label>
                                <input type="date" id="pay-date-${b.id}" class="form-control form-control-sm" value="${getTodayDateStr()}">
                            </div>
                            <div class="col-md-4">
                                <label class="small">Provider / Bank Name</label>
                                <input type="text" id="pay-provider-${b.id}" class="form-control form-control-sm" placeholder="e.g. City Bank">
                            </div>
                            <div class="col-md-3">
                                <label class="small">Amount Paid ($)</label>
                                <input type="number" id="pay-amount-${b.id}" class="form-control form-control-sm">
                            </div>
                            <div class="col-md-2 d-flex align-items-end gap-1">
                                <button class="btn btn-sm btn-primary w-100" id="btn-submit-pay-${b.id}" onclick="saveBankPayment('${b.id}')">Save</button>
                                <button class="btn btn-sm btn-secondary w-100 hidden" id="btn-cancel-pay-${b.id}" onclick="cancelBankPayment('${b.id}')">Cancel</button>
                            </div>
                        </div>
                        <table class="table table-sm table-bordered bg-white mb-0">
                            <thead class="table-light text-secondary">
                                <tr>
                                    <th width="8%" class="text-center border-end">No.</th>
                                    <th width="20%">Date</th>
                                    <th width="42%">Provider</th>
                                    <th width="20%">Amount Paid</th>
                                    <th width="10%" class="text-center">Action</th>
                                </tr>
                            </thead>
                            <tbody>${subRowsHtml}</tbody>
                        </table>
                    </div>
                </td>
            </tr>`;
    });

    // ---- 2. NON BANK LIABILITIES ----
    const tbodyNB = document.getElementById('nb-list');
    if (tbodyNB) tbodyNB.innerHTML = '';

    db.nonBankLiabilities.forEach(b => {
        const u = db.users.find(x => x.id === b.assignTo);
        const assignedName = u ? u.username : 'Unknown';

        const totalMainPaid = b.mainAmtSchedules.filter(s => s.isPaid).reduce((sum, p) => sum + (parseFloat(p.paidAmt) || 0), 0);
        const totalIntPaid = b.interestSchedules.filter(s => s.isPaid).reduce((sum, p) => sum + (parseFloat(p.paidAmt) || 0), 0);
        const scheduledMonthlyMain = b.totalAmt / b.totalMonths;
        const remainExpectedMain = Math.max(0, b.totalAmt - totalMainPaid);

        // 6-month cycle interest: accrues every 6 months while main > 0
        const cycleResult = calcNBCycleInterest(b.date, b.interestMonthly, remainExpectedMain);
        const totalCycleInterestAccrued = cycleResult.totalAccrued;
        const remainExpectedInterest = Math.max(0, totalCycleInterestAccrued - totalIntPaid);
        const fullyPaid = remainExpectedMain === 0 && remainExpectedInterest === 0;

        const isExpanded = expandedNBRows.has(b.id);
        const displayClass = isExpanded ? '' : 'hidden';

        if (tbodyNB) {
            tbodyNB.innerHTML += `
                <tr class="table-light cursor-pointer ${fullyPaid ? 'opacity-75' : ''}" onclick="toggleNBRow('${b.id}')">
                    <td>${formatDateDisplay(b.date)}</td>
                    <td class="text-dark"><strong>${b.name}</strong></td>
                    <td>$${formatAmount(b.totalAmt)}</td>
                    <td>${b.totalMonths} M</td>
                    <td class="text-warning-emphasis">$${formatAmount(b.interestMonthly)}</td>
                    <td>${assignedName}</td>
                    <td class="text-danger fw-bold">$${formatAmount(remainExpectedMain)}</td>
                    <td class="text-danger">
                        $${formatAmount(remainExpectedInterest)}
${cycleResult.monthsElapsed > 0 ? `<br><small class="text-muted">${Math.floor(cycleResult.monthsElapsed / 6)} cycle(s) × $${formatAmount(b.interestMonthly * 6)}</small>` : '<br><small class="text-muted">No cycle yet</small>'}
                    </td>
                    <td><span class="badge ${fullyPaid ? 'bg-success' : 'bg-warning text-dark'}">${fullyPaid ? 'Done' : 'Active'}</span></td>
                    <td class="text-center">
                        <button class="btn btn-sm btn-dark" onclick="event.stopPropagation(); editNBLiability('${b.id}')">Edit</button>
                        <button class="btn btn-sm btn-danger" onclick="event.stopPropagation(); deleteNBLiability('${b.id}')">Del</button>
                        <button class="btn btn-sm btn-outline-dark" onclick="event.stopPropagation(); toggleNBRow('${b.id}')">↕</button>
                    </td>
                </tr>`;

            // ---- buildScheduleRows: renders all 3 row types ----
            const buildScheduleRows = (type, schedules, expectedMonthlyAmt, liabId) => {
                const db2 = getDB();
                let userOpts = '<option value="">-- Assign By --</option>';
                db2.users.forEach(u => { userOpts += `<option value="${u.username}">${u.username}</option>`; });
                let paidByOpts = '<option value="">-- Paid By --</option>';
                db2.users.forEach(u => { paidByOpts += `<option value="${u.username}">${u.username}</option>`; });

                if (schedules.length === 0) {
                    return `<tr><td colspan="9" class="text-center text-muted py-3 fst-italic">No rows yet. Click an "Add" button above to begin.</td></tr>`;
                }

                return schedules.map((sch, i) => {
                    const rowNo = i + 1;

                    if (sch.isPaid) {
                        // ---- PAID (read-only) ----
                        return `
                            <tr class="table-success align-middle">
                                <td class="text-center fw-bold border-end">#${rowNo}</td>
                                <td><del class="text-muted">${sch.date ? formatDateDisplay(sch.date) : '-'}</del></td>
                                <td class="text-muted">${sch.assignBy || (sch.paidOnly ? '<em class="text-muted">Direct</em>' : '-')}</td>
                                <td class="text-muted">$${formatAmount(parseFloat(sch.amt) || 0)}</td>
                                <td class="table-active border-start">
                                    <span class="badge bg-success">✓ Paid</span>&nbsp;${sch.paidDate ? formatDateDisplay(sch.paidDate) : ''}
                                </td>
                                <td class="table-active">${sch.paidBy || ''}</td>
                                <td class="table-active fw-bold text-success">$${formatAmount(parseFloat(sch.paidAmt) || 0)}</td>
                                <td class="table-active text-center" colspan="2">
                                    <button class="btn btn-sm btn-outline-warning py-0" onclick="revertNBPay('${liabId}', '${type}', ${i})">↺ Revert</button>
                                    <button class="btn btn-sm btn-outline-danger py-0 ms-1" onclick="deleteNBScheduleRow('${liabId}', '${type}', ${i})">🗑️</button>
                                </td>
                            </tr>`;

                    } else if (sch.paidOnly) {
                        // ---- DIRECT PAID ENTRY (editable paid-side only) ----
                        let pbOpts = '<option value="">-- Paid By --</option>';
                        db2.users.forEach(u => { pbOpts += `<option value="${u.username}">${u.username}</option>`; });
                        return `
                            <tr class="align-middle table-info">
                                <td class="text-center fw-bold border-end">#${rowNo}</td>
                                <td colspan="3" class="text-center text-muted fst-italic small">
                                    <span class="badge bg-info text-dark">Direct Paid Entry</span>
                                </td>
                                <td class="table-active border-start">
                                    <input type="date" id="paid-date-${type}-${liabId}-${i}" class="form-control form-control-sm" style="min-width:130px" value="${getTodayDateStr()}">
                                </td>
                                <td class="table-active">
                                    <select id="paid-by-${type}-${liabId}-${i}" class="form-select form-select-sm" style="min-width:110px">${pbOpts}</select>
                                </td>
                                <td class="table-active">
                                    <input type="number" id="paid-amt-${type}-${liabId}-${i}" class="form-control form-control-sm" style="min-width:100px" value="${expectedMonthlyAmt}" step="0.01">
                                </td>
                                <td class="table-active text-center" colspan="2">
                                    <button class="btn btn-sm btn-info py-0 px-2" onclick="saveNBPaidRowEdit('${liabId}', '${type}', ${i})">💾 Save Paid</button>
                                    <button class="btn btn-sm btn-outline-danger py-0 ms-1" onclick="deleteNBScheduleRow('${liabId}', '${type}', ${i})">🗑️</button>
                                </td>
                            </tr>`;

                    } else {
                        // ---- ASSIGN / UNPAID ROW (editable assign-side) ----
                        const isRowSaved = !!(sch.date && sch.assignBy && sch.amt);
                        let assignOpts = '<option value="">-- Assign By --</option>';
                        db2.users.forEach(u => { assignOpts += `<option value="${u.username}" ${u.username === (sch.assignBy || '') ? 'selected' : ''}>${u.username}</option>`; });
                        let pbOpts = '<option value="">-- Paid By --</option>';
                        db2.users.forEach(u => { pbOpts += `<option value="${u.username}">${u.username}</option>`; });

                        return `
                            <tr class="align-middle ${!isRowSaved ? 'table-warning' : ''}">
                                <td class="text-center fw-bold border-end">#${rowNo}</td>
                                <td><input type="date" id="row-date-${type}-${liabId}-${i}" class="form-control form-control-sm" style="min-width:130px" value="${sch.date || ''}"></td>
                                <td><select id="row-assign-${type}-${liabId}-${i}" class="form-select form-select-sm" style="min-width:110px">${assignOpts}</select></td>
                                <td><input type="number" id="row-amt-${type}-${liabId}-${i}" class="form-control form-control-sm" style="min-width:100px" value="${sch.amt !== '' ? sch.amt : expectedMonthlyAmt}" step="0.01"></td>
                                <td class="table-active border-start" colspan="3">
                                    <div id="pay-panel-${type}-${liabId}-${i}" class="hidden">
                                        <div class="d-flex gap-1 align-items-center flex-wrap p-1">
                                            <input type="date" id="pay-date-${type}-${liabId}-${i}" class="form-control form-control-sm" style="min-width:130px" value="${getTodayDateStr()}">
                                            <select id="pay-by-${type}-${liabId}-${i}" class="form-select form-select-sm" style="min-width:110px">${pbOpts}</select>
                                            <input type="number" id="pay-amt-${type}-${liabId}-${i}" class="form-control form-control-sm" style="min-width:100px" value="${sch.amt || expectedMonthlyAmt}" step="0.01">
                                            <button class="btn btn-sm btn-success flex-shrink-0" onclick="executeNBPay('${liabId}', '${type}', ${i})">✓ Confirm</button>
                                        </div>
                                    </div>
                                    <span class="text-muted fst-italic px-2" style="font-size:0.8em;">${!isRowSaved ? 'Save row first to enable payment' : 'Awaiting Payment'}</span>
                                </td>
                                <td class="table-active text-center text-nowrap">
                                    <button class="btn btn-sm btn-primary py-0 px-2" onclick="saveNBRowEdit('${liabId}', '${type}', ${i})" title="Save row edits">💾</button>
                                    ${isRowSaved ? `<button class="btn btn-sm btn-success py-0 px-2 ms-1" onclick="initiateNBPay('${liabId}', '${type}', ${i})" title="Mark as paid">Pay</button>` : ''}
                                    <button class="btn btn-sm btn-outline-danger py-0 ms-1" onclick="deleteNBScheduleRow('${liabId}', '${type}', ${i})" title="Delete row">🗑️</button>
                                </td>
                            </tr>`;
                    }
                }).join('');
            };

            const intCount = b.interestSchedules.length;
            const mainCount = b.mainAmtSchedules.length;
            const canAddInt = intCount < b.totalMonths;
            const canAddMain = mainCount < b.totalMonths;

            tbodyNB.innerHTML += `
                <tr class="child-nb-${b.id} ${displayClass} bg-light">
                    <td colspan="10" class="p-4">
                        <div class="d-flex flex-column gap-4">

                            <!-- ===== 6-MONTH CYCLE INTEREST SUMMARY ===== -->
                            <div class="card border-danger shadow-sm">
                                <div class="card-header bg-danger text-white p-2 d-flex justify-content-between align-items-center flex-wrap gap-2">
                                    <span class="fw-bold">🔄 6-Month Interest Cycle Summary</span>
                                    <span class="badge bg-light text-danger fs-6">
                                        Total Accrued: $${formatAmount(totalCycleInterestAccrued)} &nbsp;|&nbsp; Paid: $${formatAmount(totalIntPaid)} &nbsp;|&nbsp; Remain: $${formatAmount(remainExpectedInterest)}
                                    </span>
                                </div>
                                <div class="card-body p-2">
                                    ${cycleResult.monthsElapsed === 0 ?
                    `<p class="text-muted fst-italic mb-0 p-2">No full 6-month cycle has elapsed yet since <strong>${formatDateDisplay(b.date)}</strong>. Interest will begin accruing after the first 6 months.</p>`
                    : `<div class="table-responsive">
        <table class="table table-sm table-bordered mb-0">
            <thead class="table-light" style="font-size:0.82em;">
                <tr>
                    <th>#</th><th>Period</th><th>Interest Due</th><th>Paid</th><th>Unpaid</th><th>Status</th>
                </tr>
            </thead>
            <tbody>
                ${cycleResult.cycleDetails.map((cd, ci) => `
                    <tr class="${cd.cycleUnpaid > 0 ? '' : 'table-success'}">
                        <td>${ci + 1}</td>
                        <td>${cd.label}</td>
                        <td class="text-danger fw-bold">$${formatAmount(cd.cycleDue)}</td>
                        <td class="text-success">$${formatAmount(cd.coveredByPaid)}</td>
                        <td class="${cd.cycleUnpaid > 0 ? 'text-danger fw-bold' : 'text-muted'}">$${formatAmount(cd.cycleUnpaid)}</td>
                        <td>${cd.isPartial
                            ? `<span class="badge bg-info text-dark">In Progress</span>`
                            : cd.cycleUnpaid > 0
                                ? `<span class="badge bg-danger">Unpaid</span>`
                                : `<span class="badge bg-success">Paid</span>`}
                        </td>
                    </tr>`).join('')}
            </tbody>
        </table>
    </div>`
}
                                </div>
                            </div>

                            <!-- ===== INTEREST TRACKER ===== -->
                            <div class="card border-warning shadow-sm">
                                <div class="card-header bg-warning text-dark p-2 d-flex justify-content-between align-items-center flex-wrap gap-2">
                                    <span class="fw-bold">⚠️ Interest Tracker
                                        <small class="fw-normal ms-1">(Expected: $${formatAmount(b.interestMonthly)}/mo &nbsp;|&nbsp; ${intCount}/${b.totalMonths} rows)</small>
                                    </span>
                                    <div class="d-flex gap-1">
                                        ${canAddInt
                    ? `<button class="btn btn-sm btn-dark" onclick="addNBScheduleRow('${b.id}', 'int')">+ Add Assign</button>
                                           <button class="btn btn-sm btn-info text-dark" onclick="addNBPaidRow('${b.id}', 'int')">+ Add Paid</button>`
                    : `<span class="badge bg-success py-2">All ${b.totalMonths} rows added</span>`}
                                    </div>
                                </div>
                                <div class="card-body p-0">
                                    <div style="max-height:320px; overflow-y:auto; overflow-x:auto;">
                                        <table class="table table-sm table-bordered mb-0 text-nowrap">
                                            <thead class="sticky-top" style="top:0; z-index:2; background:#f8f9fa;">
                                                <tr class="table-secondary text-center" style="font-size:0.82em;">
                                                    <th class="border-end" style="width:40px">#</th>
                                                    <th>Date</th>
                                                    <th>Assign By</th>
                                                    <th>Amount</th>
                                                    <th class="border-start table-active">Paid Date</th>
                                                    <th class="table-active">Paid By</th>
                                                    <th class="table-active">Paid Amt</th>
                                                    <th class="table-active text-center" colspan="2">Action</th>
                                                </tr>
                                            </thead>
                                            <tbody>${buildScheduleRows('int', b.interestSchedules, b.interestMonthly, b.id)}</tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>

                            <!-- ===== MAIN AMT TRACKER ===== -->
                            <div class="card border-primary shadow-sm">
                                <div class="card-header bg-primary text-white p-2 d-flex justify-content-between align-items-center flex-wrap gap-2">
                                    <span class="fw-bold">💰 Main Amt Tracker
                                        <small class="fw-normal ms-1">(Expected: $${formatAmount(scheduledMonthlyMain)}/mo &nbsp;|&nbsp; ${mainCount}/${b.totalMonths} rows)</small>
                                    </span>
                                    <div class="d-flex gap-1">
                                        ${canAddMain
                    ? `<button class="btn btn-sm btn-light" onclick="addNBScheduleRow('${b.id}', 'main')">+ Add Assign</button>
                                           <button class="btn btn-sm btn-info" onclick="addNBPaidRow('${b.id}', 'main')">+ Add Paid</button>`
                    : `<span class="badge bg-light text-dark py-2">All ${b.totalMonths} rows added</span>`}
                                    </div>
                                </div>
                                <div class="card-body p-0">
                                    <div style="max-height:320px; overflow-y:auto; overflow-x:auto;">
                                        <table class="table table-sm table-bordered mb-0 text-nowrap">
                                            <thead class="sticky-top" style="top:0; z-index:2; background:#f8f9fa;">
                                                <tr class="table-secondary text-center" style="font-size:0.82em;">
                                                    <th class="border-end" style="width:40px">#</th>
                                                    <th>Date</th>
                                                    <th>Assign By</th>
                                                    <th>Amount</th>
                                                    <th class="border-start table-active">Paid Date</th>
                                                    <th class="table-active">Paid By</th>
                                                    <th class="table-active">Paid Amt</th>
                                                    <th class="table-active text-center" colspan="2">Action</th>
                                                </tr>
                                            </thead>
                                            <tbody>${buildScheduleRows('main', b.mainAmtSchedules, scheduledMonthlyMain, b.id)}</tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>

                        </div>
                    </td>
                </tr>`;
        }
    });

    // ---- 3. NON INTEREST LIABILITIES ----
    const tbodyNI = document.getElementById('ni-list');
    if (!tbodyNI) return;
    tbodyNI.innerHTML = '';
    const niChartAgg = {};

    db.nonInterestLiabilities.forEach(b => {
        const u = db.users.find(x => x.id === b.assignTo);
        const assignedName = u ? u.username : 'Unknown';
        const totalPaid = b.payments.reduce((sum, p) => sum + p.amount, 0);
        const monthlyBePay = b.totalMonths > 0 ? (b.totalAmt / b.totalMonths) : 0;
        const calculatedRemainingAmt = Math.max(0, b.totalAmt - totalPaid);
        const calculatedRemainingMonths = Math.max(0, b.totalMonths - b.payments.length);

        if (!niChartAgg[b.name]) niChartAgg[b.name] = { total: 0 };
        niChartAgg[b.name].total += b.totalAmt;

        const isExpanded = expandedNIRows.has(b.id);
        const displayClass = isExpanded ? '' : 'hidden';

        tbodyNI.innerHTML += `
            <tr class="table-light cursor-pointer" onclick="toggleNIRow('${b.id}')">
                <td class="text-success"><strong>${b.name}</strong></td>
                <td>${formatDateDisplay(b.date)}</td>
                <td>${assignedName}</td>
                <td>$${formatAmount(b.totalAmt)}</td>
                <td class="text-primary">$${formatAmount(monthlyBePay)}</td>
                <td class="text-danger fw-bold">$${formatAmount(calculatedRemainingAmt)}</td>
                <td>${b.totalMonths}</td>
                <td><span class="badge ${calculatedRemainingMonths === 0 ? 'bg-success' : 'bg-warning text-dark'}">${calculatedRemainingMonths}</span></td>
                <td class="text-center">
                    <button class="btn btn-sm btn-success" onclick="event.stopPropagation(); editNILiability('${b.id}')">Edit</button>
                    <button class="btn btn-sm btn-danger" onclick="event.stopPropagation(); deleteNILiability('${b.id}')">Del</button>
                    <button class="btn btn-sm btn-dark" onclick="event.stopPropagation(); toggleNIRow('${b.id}')">↕</button>
                </td>
            </tr>`;

        let subRowsHtml = '';
        for (let i = 0; i < b.totalMonths; i++) {
            const p = b.payments[i];
            if (p) {
                subRowsHtml += `
                    <tr>
                        <td class="text-center text-muted border-end">#${i + 1}</td>
                        <td>${formatDateDisplay(p.date)}</td>
                        <td>${p.provider}</td>
                        <td class="text-success fw-bold">$${formatAmount(p.amount)}</td>
                        <td class="text-center">
                            <button class="btn btn-sm btn-outline-success py-0" onclick="editNIPayment('${b.id}', '${p.id}')">✏️</button>
                            <button class="btn btn-sm btn-outline-danger py-0" onclick="deleteNIPayment('${b.id}', '${p.id}')">❌</button>
                        </td>
                    </tr>`;
            } else {
                subRowsHtml += `
                    <tr class="table-secondary text-muted">
                        <td class="text-center border-end">#${i + 1}</td>
                        <td>-</td><td>-</td><td>-</td>
                        <td class="text-center">-</td>
                    </tr>`;
            }
        }

        tbodyNI.innerHTML += `
            <tr class="child-ni-${b.id} ${displayClass} bg-white">
                <td colspan="9" class="p-3">
                    <div class="border rounded p-3 bg-light shadow-sm">
                        <div class="d-flex justify-content-between align-items-center mb-3">
                            <h6 class="mb-0 text-success">Payments Schedule (${b.payments.length} / ${b.totalMonths} Added)</h6>
                            ${b.payments.length < b.totalMonths
                ? `<button class="btn btn-sm btn-success" onclick="toggleNIPaymentForm('${b.id}')">+ Add Expected Payment</button>`
                : `<span class="badge bg-success fs-6">Schedule Fully Added</span>`}
                        </div>
                        <div id="add-ni-payment-${b.id}" class="row g-2 mb-3 hidden border-bottom border-success pb-3">
                            <input type="hidden" id="pay-ni-id-${b.id}">
                            <div class="col-md-3">
                                <label class="small">Execution Date</label>
                                <input type="date" id="pay-ni-date-${b.id}" class="form-control form-control-sm" value="${getTodayDateStr()}">
                            </div>
                            <div class="col-md-4">
                                <label class="small">Receiver Name</label>
                                <input type="text" id="pay-ni-provider-${b.id}" class="form-control form-control-sm" placeholder="e.g. John Doe">
                            </div>
                            <div class="col-md-3">
                                <label class="small">Installment Amount ($)</label>
                                <input type="number" id="pay-ni-amount-${b.id}" class="form-control form-control-sm">
                            </div>
                            <div class="col-md-2 d-flex align-items-end gap-1">
                                <button class="btn btn-sm btn-success w-100" id="btn-submit-ni-pay-${b.id}" onclick="saveNIPayment('${b.id}')">Save</button>
                                <button class="btn btn-sm btn-secondary w-100 hidden" id="btn-cancel-ni-pay-${b.id}" onclick="cancelNIPayment('${b.id}')">Cancel</button>
                            </div>
                        </div>
                        <table class="table table-sm table-bordered bg-white mb-0">
                            <thead class="table-light text-secondary">
                                <tr>
                                    <th width="8%" class="text-center border-end">No.</th>
                                    <th width="20%">Date</th>
                                    <th width="42%">Receiver Name</th>
                                    <th width="20%">Amount Paid</th>
                                    <th width="10%" class="text-center">Action</th>
                                </tr>
                            </thead>
                            <tbody>${subRowsHtml}</tbody>
                        </table>
                    </div>
                </td>
            </tr>`;
    });

    renderExpenseCharts(bankChartAgg, niChartAgg);
}

// ------ Chart.js Logic ------
function renderExpenseCharts(bankChartAgg, niChartAgg) {
    const bankLabels = Object.keys(bankChartAgg);
    const bankTotalData = bankLabels.map(l => bankChartAgg[l].total);
    const bankInterestData = bankLabels.map(l => bankChartAgg[l].interest);
    const totalBankAmt = bankTotalData.reduce((sum, val) => sum + val, 0);
    const totalBankInterest = bankInterestData.reduce((sum, val) => sum + val, 0);

    const bTitleEl = document.getElementById('bank-pie-chart-title');
    if (bTitleEl) bTitleEl.innerText = `Total Bank Amount Distribution (${formatAmount(totalBankAmt)})`;
    const bLossTitleEl = document.getElementById('bank-loss-chart-title');
    if (bLossTitleEl) bLossTitleEl.innerText = `Loss Analysis (Total Interest: $${formatAmount(totalBankInterest)})`;

    const ctxBankPie = document.getElementById('bank-pie-chart').getContext('2d');
    if (bankPieChartInstance) bankPieChartInstance.destroy();
    let bpLabels = bankLabels.length > 0 ? bankLabels : ["No Data"];
    let bpData = bankLabels.length > 0 ? bankTotalData : [1];
    bankPieChartInstance = new Chart(ctxBankPie, {
        type: 'doughnut',
        data: { labels: bpLabels, datasets: [{ data: bpData, backgroundColor: ['#0d6efd', '#198754', '#dc3545', '#ffc107', '#0dcaf0', '#6f42c1', '#d63384', '#fd7e14'].slice(0, Math.max(bpLabels.length, 1)) }] },
        options: { responsive: true, plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: function (c) { if (bpLabels[0] === "No Data") return " No records"; return ` $${formatAmount(c.raw)}`; } } } } }
    });

    const ctxBankLoss = document.getElementById('bank-loss-chart').getContext('2d');
    if (bankCompChartInstance) bankCompChartInstance.destroy();
    bankCompChartInstance = new Chart(ctxBankLoss, {
        type: 'bar',
        data: { labels: bankLabels, datasets: [{ label: 'Interest / Loss Amount', data: bankInterestData, backgroundColor: '#dc3545', borderRadius: 4 }] },
        options: { responsive: true, scales: { y: { beginAtZero: true } }, plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: function (c) { return ` ${c.dataset.label}: $${formatAmount(c.raw)}`; } } } } }
    });

    const niLabels = Object.keys(niChartAgg || {});
    const niTotalData = niLabels.map(l => niChartAgg[l].total);
    const niProfitData = niLabels.map(l => niChartAgg[l].total * 0.10);
    const totalNIAmt = niTotalData.reduce((sum, val) => sum + val, 0);
    const totalNIProfit = niProfitData.reduce((sum, val) => sum + val, 0);

    const niTitleEl = document.getElementById('ni-pie-chart-title');
    if (niTitleEl) niTitleEl.innerText = `Total NI Amount Distribution (${formatAmount(totalNIAmt)})`;
    const niProfitTitleEl = document.getElementById('ni-profit-chart-title');
    if (niProfitTitleEl) niProfitTitleEl.innerText = `Profit Analysis (Total Est. Profit: $${formatAmount(totalNIProfit)})`;

    const ctxNiPieObj = document.getElementById('ni-pie-chart');
    if (ctxNiPieObj) {
        const ctxNiPie = ctxNiPieObj.getContext('2d');
        if (niPieChartInstance) niPieChartInstance.destroy();
        let nPieLabels = niLabels.length > 0 ? niLabels : ["No Data"];
        let nPieData = niLabels.length > 0 ? niTotalData : [1];
        niPieChartInstance = new Chart(ctxNiPie, {
            type: 'doughnut',
            data: { labels: nPieLabels, datasets: [{ data: nPieData, backgroundColor: ['#198754', '#0d6efd', '#ffc107', '#0dcaf0', '#6f42c1', '#d63384', '#fd7e14', '#dc3545'].slice(0, Math.max(nPieLabels.length, 1)) }] },
            options: { responsive: true, plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: function (c) { if (nPieLabels[0] === "No Data") return " No records"; return ` $${formatAmount(c.raw)}`; } } } } }
        });
    }

    const ctxNiProfitObj = document.getElementById('ni-profit-chart');
    if (ctxNiProfitObj) {
        const ctxNiProfit = ctxNiProfitObj.getContext('2d');
        if (niProfitChartInstance) niProfitChartInstance.destroy();
        niProfitChartInstance = new Chart(ctxNiProfit, {
            type: 'bar',
            data: { labels: niLabels, datasets: [{ label: 'Estimated Profit (10%)', data: niProfitData, backgroundColor: '#198754', borderRadius: 4 }] },
            options: { responsive: true, scales: { y: { beginAtZero: true } }, plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: function (c) { return ` ${c.dataset.label}: $${formatAmount(c.raw)}`; } } } } }
        });
    }
}

function renderUserCharts(monthDataMap, yearDataMap) {
    const ctxMonth = document.getElementById('user-month-chart').getContext('2d');
    const ctxYear = document.getElementById('user-year-chart').getContext('2d');
    if (userMonthChartInstance) userMonthChartInstance.destroy();
    if (userYearChartInstance) userYearChartInstance.destroy();
    const chartOptions = {
        responsive: true,
        scales: { y: { beginAtZero: true } },
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (c) { return ` Total: $${formatAmount(c.raw)}`; } } } }
    };
    userMonthChartInstance = new Chart(ctxMonth, {
        type: 'bar',
        data: { labels: Object.keys(monthDataMap), datasets: [{ label: 'Monthly Income', data: Object.values(monthDataMap), backgroundColor: '#0d6efd', borderRadius: 4 }] },
        options: chartOptions
    });
    userYearChartInstance = new Chart(ctxYear, {
        type: 'bar',
        data: { labels: Object.keys(yearDataMap), datasets: [{ label: 'Yearly Income', data: Object.values(yearDataMap), backgroundColor: '#198754', borderRadius: 4 }] },
        options: chartOptions
    });
}

function renderAdminCharts(pieDataMap, trendConfig, missingConfig) {
    const ctxPie = document.getElementById('admin-pie-chart').getContext('2d');
    const pLabels = Object.keys(pieDataMap);
    const pData = Object.values(pieDataMap);
    if (pLabels.length === 0) { pLabels.push("No Data"); pData.push(1); }
    if (adminPieChartInstance) adminPieChartInstance.destroy();
    adminPieChartInstance = new Chart(ctxPie, {
        type: 'pie',
        data: { labels: pLabels, datasets: [{ data: pData, backgroundColor: ['#0d6efd', '#198754', '#dc3545', '#ffc107', '#0dcaf0', '#6f42c1', '#d63384', '#fd7e14'].slice(0, Math.max(pLabels.length, 1)) }] },
        options: { responsive: true, plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: function (c) { if (pLabels[0] === "No Data") return " No records found"; return ` $${formatAmount(c.raw)}`; } } } } }
    });

    const ctxTrend = document.getElementById('admin-month-trend-chart').getContext('2d');
    if (adminMonthTrendChartInstance) adminMonthTrendChartInstance.destroy();
    adminMonthTrendChartInstance = new Chart(ctxTrend, {
        type: 'bar',
        data: { labels: trendConfig.labels, datasets: trendConfig.datasets },
        options: { responsive: true, scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } }, plugins: { legend: { position: 'bottom', display: true }, tooltip: { callbacks: { label: function (c) { return ` ${c.dataset.label}: $${formatAmount(c.raw)}`; } } } } }
    });

    const ctxMissing = document.getElementById('admin-missing-chart').getContext('2d');
    if (adminMissingChartInstance) adminMissingChartInstance.destroy();
    let mLabels = missingConfig.labels;
    let mDsets = missingConfig.datasets;
    if (mLabels.length === 0) {
        mLabels = ["100% Maintained"];
        mDsets = [{ label: "None Missing", data: [0], backgroundColor: '#198754' }];
    }
    adminMissingChartInstance = new Chart(ctxMissing, {
        type: 'bar',
        data: { labels: mLabels, datasets: mDsets },
        options: { responsive: true, scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true, ticks: { stepSize: 1 } } }, plugins: { legend: { position: 'bottom', display: mLabels[0] !== "100% Maintained" }, tooltip: { callbacks: { label: function (c) { if (c.raw > 0) return ` Missed: ${c.dataset.label}`; return null; } } } } }
    });
}

// Initial Bootup
window.onload = function () {
    migrateNBSchedules();
    checkAuth();
};
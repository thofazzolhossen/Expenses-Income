// income.js


// ------ User Dashboard ------
async function saveIncome() {
    const id = document.getElementById('income-id').value;
    const amount = parseFloat(document.getElementById('income-amount').value);
    const dateVal = document.getElementById('income-date').value;
    const desc = document.getElementById('income-desc').value;
    const dbData = await getDB();
    const userId = dbData.currentUser?.id;
    if (!amount || !dateVal || !desc) return alert("Fill all fields!");
    if (!userId) return alert("No user session!");

    if (id) {
        // Update existing income
        await saveToDB('incomes', { ...dbData.incomes.find(i => i.id === id), amount, date: dateVal, desc }, id);
    } else {
        // Add new income
        const newIncome = { id: generateId(), userId, amount, date: dateVal, desc };
        await saveToDB('incomes', newIncome, newIncome.id);
    }
    resetIncomeForm();
    await renderUserDashboard();
}

async function deleteIncome(id) {
    if (!confirm("Delete this income record?")) return;
    // Remove from Firestore by id
    await db.collection('incomes').doc(id).delete();
    await renderUserDashboard();
}

async function editIncome(id) {
    const dbData = await getDB();
    const inc = dbData.incomes.find(i => i.id === id);
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

async function renderUserDashboard() {
    const dbData = await getDB();
    const filterMonth = document.getElementById('filter-user-month').value;
    const tbody = document.getElementById('user-income-list');
    tbody.innerHTML = '';
    let userIncomes = dbData.incomes.filter(i => i.userId === dbData.currentUser?.id);
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
async function renderAdminDashboard() {
    const dbData = await getDB();
    const userSelect = document.getElementById('filter-admin-user');
    const currentSelectedUser = userSelect.value;
    userSelect.innerHTML = '<option value="">All Users</option>';
    dbData.users.forEach(u => {
        userSelect.innerHTML += `<option value="${u.id}" ${u.id === currentSelectedUser ? 'selected' : ''}>${u.username}</option>`;
    });
    const filterMonth = document.getElementById('filter-admin-month').value;
    const filterUser = document.getElementById('filter-admin-user').value;
    const tbody = document.getElementById('admin-income-list');
    tbody.innerHTML = '';
    document.getElementById('admin-total-users').innerText = dbData.users.length;
    let filteredIncomes = dbData.incomes;
    if (filterMonth) filteredIncomes = filteredIncomes.filter(i => getMonthKey(i.date) === filterMonth);
    if (filterUser) filteredIncomes = filteredIncomes.filter(i => i.userId === filterUser);
    let globalTotal = 0;
    const pieDataMap = {};
    const groupedByMonth = {};
    filteredIncomes.forEach(inc => {
        globalTotal += inc.amount;
        const u = dbData.users.find(u => u.id === inc.userId);
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
    const trendIncomes = filterUser ? dbData.incomes.filter(i => i.userId === filterUser) : dbData.incomes;
    const activeTrendMonthKeys = [...new Set(trendIncomes.map(i => getMonthKey(i.date)))].sort();
    const trendLabels = activeTrendMonthKeys.map(m => formatMonthYear(m));
    const trendDatasets = [];
    const colors = ['#0d6efd', '#198754', '#dc3545', '#ffc107', '#0dcaf0', '#6f42c1', '#d63384', '#fd7e14'];
    let cIdx = 0;
    const trendUserIds = [...new Set(trendIncomes.map(i => i.userId))];
    trendUserIds.forEach(uid => {
        const u = dbData.users.find(x => x.id === uid);
        const uname = u ? u.username : 'Unknown';
        const dataForUser = activeTrendMonthKeys.map(mKey =>
            trendIncomes.filter(i => i.userId === uid && getMonthKey(i.date) === mKey).reduce((a, b) => a + b.amount, 0)
        );
        trendDatasets.push({ label: uname, data: dataForUser, backgroundColor: colors[cIdx % colors.length] });
        cIdx++;
    });
    const targetMonthKeys = filterMonth ? [filterMonth] : [...new Set(dbData.incomes.map(i => getMonthKey(i.date)))].sort();
    document.getElementById('missing-chart-title').innerText = filterMonth ? `Missing Income: ${formatMonthYear(filterMonth)}` : "Total Missing Months (All Time)";
    const missingUsers = [];
    const missingDatasets = [];
    const missingMatrix = {};
    targetMonthKeys.forEach(m => missingMatrix[m] = []);
    dbData.users.forEach(u => {
        const userMonthKeys = new Set(dbData.incomes.filter(i => i.userId === u.id).map(i => getMonthKey(i.date)));
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

// ------ Chart.js Logic for Income ------
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
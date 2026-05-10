// Expenses.js


// ============================================
// ====== BANK LIABILITY CRUD ======
// ============================================

async function loadUsersToDropdown() {
    const dbData = await getDB();
    const users = dbData?.users ?? [];

    const selects = [
        document.getElementById('bank-assign'),
        document.getElementById('nb-assign'),
        document.getElementById('ni-assign')
    ];

    selects.forEach(select => {
        select.innerHTML = '<option value="">Select User</option>';

        users.forEach(user => {
            select.innerHTML += `
        <option value="${user.username}">
            ${user.username}
        </option>
    `;
        });
    });
}
function resetBankForm() {
    document.getElementById('bank-form').reset();
    document.getElementById('bank-id').value = '';
    document.getElementById('bank-date').value = getTodayDateStr();
    document.getElementById('bank-form-title').innerText = "Add Bank Liability";
    document.getElementById('cancel-bank-btn').classList.add('hidden');
}

async function saveBankLiability() {
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

    if (id) {
        const existingSnap = await db.collection('bankLiabilities').doc(id).get();
        const existingData = existingSnap.data() || {};
        await saveToDB('bankLiabilities', {
            id, name, date, assignTo, totalAmt, totalMonths: months, haveToPay, monthlyPay,
            payments: existingData.payments || []
        }, id);
    } else {
        const newId = generateId();
        await saveToDB('bankLiabilities', {
            id: newId, name, date, assignTo, totalAmt, totalMonths: months, haveToPay, monthlyPay, payments: []
        }, newId);
    }
    resetBankForm();
    await renderExpenseDashboard();
}

async function editBankLiability(id) {
    const dbData = await getDB();
    const bank = dbData.bankLiabilities.find(b => b.id === id);
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

async function deleteBankLiability(id) {
    if (!confirm("Delete this entire Bank liability record?")) return;
    await db.collection('bankLiabilities').doc(id).delete();
    await renderExpenseDashboard();
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

async function editBankPayment(liabId, pmtId) {
    const dbData = await getDB();
    const bank = dbData.bankLiabilities.find(b => b.id === liabId);
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

async function saveBankPayment(liabId) {
    const payId = document.getElementById(`pay-id-${liabId}`).value;
    const date = document.getElementById(`pay-date-${liabId}`).value;
    const provider = document.getElementById(`pay-provider-${liabId}`).value.trim();
    const amount = parseFloat(document.getElementById(`pay-amount-${liabId}`).value);
    if (!date || !provider || !amount) return alert("Fill all payment fields!");
    const docRef = db.collection('bankLiabilities').doc(liabId);
    const docSnap = await docRef.get();
    const bank = docSnap.data();
    if (!bank) return;
    if (payId) {
        // Update payment
        const idx = bank.payments.findIndex(p => p.id === payId);
        bank.payments[idx] = { id: payId, date, provider, amount };
    } else {
        if (bank.payments.length >= bank.totalMonths) {
            return alert("All specified months have already been paid for this schedule!");
        }
        bank.payments.push({ id: generateId(), date, provider, amount });
    }
    await docRef.set(bank);
    await renderExpenseDashboard();
}

async function deleteBankPayment(liabId, pmtId) {
    if (!confirm("Are you sure you want to delete this payment?")) return;
    const docRef = db.collection('bankLiabilities').doc(liabId);
    const docSnap = await docRef.get();
    const bank = docSnap.data();
    if (!bank) return;
    bank.payments = bank.payments.filter(p => p.id !== pmtId);
    await docRef.set(bank);
    await renderExpenseDashboard();
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

async function saveNBLiability() {
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
    if (id) {
        const doc = await db.collection('nonBankLiabilities').doc(id).get();
        const old = doc.data() || {};
        await saveToDB('nonBankLiabilities', {
            ...old, id, name, date, assignTo, totalAmt, totalMonths: duration, interestMonthly
        }, id);
    } else {
        const newId = generateId();
        await saveToDB('nonBankLiabilities', {
            id: newId, name, date, assignTo, totalAmt, totalMonths: duration, interestMonthly,
            interestSchedules: [], mainAmtSchedules: []
        }, newId);
    }
    resetNBForm();
    await renderExpenseDashboard();
}

async function editNBLiability(id) {
    const dbData = await getDB();
    const liab = dbData.nonBankLiabilities.find(b => b.id === id);
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

async function deleteNBLiability(id) {
    if (!confirm("Delete this entire Non Bank liability record?")) return;
    await db.collection('nonBankLiabilities').doc(id).delete();
    await renderExpenseDashboard();
}

function toggleNBRow(id) {
    if (expandedNBRows.has(id)) { expandedNBRows.delete(id); } else { expandedNBRows.add(id); }
    document.querySelectorAll(`.child-nb-${id}`).forEach(r => {
        if (expandedNBRows.has(id)) r.classList.remove('hidden');
        else r.classList.add('hidden');
    });
}

async function addNBScheduleRow(liabId, type) {
    const dbData = await getDB();
    const idx = dbData.nonBankLiabilities.findIndex(x => x.id === liabId);
    const liab = dbData.nonBankLiabilities[idx];
    const scheduleList = type === 'int' ? liab.interestSchedules : liab.mainAmtSchedules;
    if (scheduleList.length >= liab.totalMonths) {
        return alert(`Maximum ${liab.totalMonths} rows allowed.`);
    }
    scheduleList.push({ date: '', assignBy: '', amt: '', isPaid: false, paidDate: '', paidBy: '', paidAmt: '', paidOnly: false });
    await db.collection('nonBankLiabilities').doc(liabId).set(dbData.nonBankLiabilities[idx]);

    renderExpenseDashboard();
}

async function addNBPaidRow(liabId, type) {
    const dbData = await getDB();
    const idx = dbData.nonBankLiabilities.findIndex(x => x.id === liabId);
    const liab = dbData.nonBankLiabilities[idx];
    const scheduleList = type === 'int' ? liab.interestSchedules : liab.mainAmtSchedules;
    if (scheduleList.length >= liab.totalMonths) {
        return alert(`Maximum ${liab.totalMonths} rows allowed.`);
    }
    scheduleList.push({ date: '', assignBy: '', amt: '', isPaid: false, paidDate: '', paidBy: '', paidAmt: '', paidOnly: true });
    await db.collection('nonBankLiabilities').doc(liabId).set(dbData.nonBankLiabilities[idx]);

    renderExpenseDashboard();
}

async function saveNBRowEdit(liabId, type, i) {

    const dbData = await getDB();

    const idx = dbData.nonBankLiabilities.findIndex(x => x.id === liabId);

    const scheduleList =
        type === 'int'
            ? dbData.nonBankLiabilities[idx].interestSchedules
            : dbData.nonBankLiabilities[idx].mainAmtSchedules;

    const dateVal =
        document.getElementById(`row-date-${type}-${liabId}-${i}`).value;

    const assignBy =
        document.getElementById(`row-assign-${type}-${liabId}-${i}`).value;

    const amt =
        parseFloat(
            document.getElementById(`row-amt-${type}-${liabId}-${i}`).value
        );

    if (!dateVal || !assignBy || isNaN(amt) || amt <= 0) {
        return alert("Please fill all fields");
    }

    scheduleList[i].date = dateVal;
    scheduleList[i].assignBy = assignBy;
    scheduleList[i].amt = amt;

    await db.collection('nonBankLiabilities').doc(liabId).set(dbData.nonBankLiabilities[idx]);


    await renderExpenseDashboard();
}

async function saveNBPaidRowEdit(liabId, type, i) {
    const dbData = await getDB();
    const idx = dbData.nonBankLiabilities.findIndex(x => x.id === liabId);
    const scheduleList = type === 'int' ? dbData.nonBankLiabilities[idx].interestSchedules : dbData.nonBankLiabilities[idx].mainAmtSchedules;
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
    await db.collection('nonBankLiabilities').doc(liabId).set(dbData.nonBankLiabilities[idx]);

    renderExpenseDashboard();
}

function initiateNBPay(liabId, type, itemIndex) {
    const targetObj = document.getElementById(`pay-panel-${type}-${liabId}-${itemIndex}`);
    if (targetObj) targetObj.classList.toggle('hidden');
}

async function executeNBPay(liabId, type, itemIndex) {
    const dbData = await getDB();
    const idx = dbData.nonBankLiabilities.findIndex(x => x.id === liabId);
    const scheduleList = type === 'int' ? dbData.nonBankLiabilities[idx].interestSchedules : dbData.nonBankLiabilities[idx].mainAmtSchedules;
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
    await db.collection('nonBankLiabilities').doc(liabId).set(dbData.nonBankLiabilities[idx]);

    renderExpenseDashboard();
}

async function revertNBPay(liabId, type, itemIndex) {
    if (!confirm("Revert this payment to an unpaid state?")) return;
    const dbData = await getDB();
    const idx = dbData.nonBankLiabilities.findIndex(x => x.id === liabId);
    const scheduleList = type === 'int' ? dbData.nonBankLiabilities[idx].interestSchedules : dbData.nonBankLiabilities[idx].mainAmtSchedules;
    scheduleList[itemIndex].isPaid = false;
    scheduleList[itemIndex].paidDate = '';
    scheduleList[itemIndex].paidBy = '';
    scheduleList[itemIndex].paidAmt = '';
    await db.collection('nonBankLiabilities').doc(liabId).set(dbData.nonBankLiabilities[idx]);

    renderExpenseDashboard();
}

async function deleteNBScheduleRow(liabId, type, itemIndex) {
    if (!confirm("Are you sure you want to delete this schedule row?")) return;
    const dbData = await getDB();
    const idx = dbData.nonBankLiabilities.findIndex(x => x.id === liabId);
    const scheduleList = type === 'int' ? dbData.nonBankLiabilities[idx].interestSchedules : dbData.nonBankLiabilities[idx].mainAmtSchedules;
    scheduleList.splice(itemIndex, 1);
    await db.collection('nonBankLiabilities').doc(liabId).set(dbData.nonBankLiabilities[idx]);

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

async function saveNILiability() {
    const id = document.getElementById('ni-id').value;
    const name = document.getElementById('ni-name').value.trim();
    const date = document.getElementById('ni-date').value;
    const assignTo = document.getElementById('ni-assign').value;
    const totalAmt = parseFloat(document.getElementById('ni-amount').value);
    const months = parseInt(document.getElementById('ni-months').value);
    if (!name || !date || !assignTo || isNaN(totalAmt) || isNaN(months)) {
        return alert("Fill all available fields!");
    }
    if (id) {
        const doc = await db.collection('nonInterestLiabilities').doc(id).get();
        const old = doc.data() || {};
        await saveToDB('nonInterestLiabilities', {
            ...old, id, name, date, assignTo, totalAmt, totalMonths: months
        }, id);
    } else {
        const newId = generateId();
        await saveToDB('nonInterestLiabilities', {
            id: newId, name, date, assignTo, totalAmt, totalMonths: months, payments: []
        }, newId);
    }
    resetNIForm();
    await renderExpenseDashboard();
}

async function editNILiability(id) {
    const dbData = await getDB();
    const liab = dbData.nonInterestLiabilities.find(b => b.id === id);
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

async function deleteNILiability(id) {
    if (!confirm("Delete this entire Non Interest liability record?")) return;
    await db.collection('nonInterestLiabilities').doc(id).delete();
    await renderExpenseDashboard();
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

async function editNIPayment(liabId, pmtId) {
    const dbData = await getDB();
    const liab = dbData.nonInterestLiabilities.find(b => b.id === liabId);
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

async function saveNIPayment(liabId) {
    const payId = document.getElementById(`pay-ni-id-${liabId}`).value;
    const date = document.getElementById(`pay-ni-date-${liabId}`).value;
    const provider = document.getElementById(`pay-ni-provider-${liabId}`).value.trim();
    const amount = parseFloat(document.getElementById(`pay-ni-amount-${liabId}`).value);

    if (!date || !provider || !amount) {
        return alert("Fill all payment fields!");
    }

    const dbData = await getDB();

    const idx = dbData.nonInterestLiabilities.findIndex(
        x => x.id === liabId
    );

    if (idx === -1) return;

    if (payId) {

        const pmtIndex =
            dbData.nonInterestLiabilities[idx]
                .payments.findIndex(p => p.id === payId);

        dbData.nonInterestLiabilities[idx]
            .payments[pmtIndex] = {
            id: payId,
            date,
            provider,
            amount
        };

    } else {

        if (
            dbData.nonInterestLiabilities[idx]
                .payments.length >=
            dbData.nonInterestLiabilities[idx].totalMonths
        ) {
            return alert(
                "All specified months have already been paid!"
            );
        }

        dbData.nonInterestLiabilities[idx]
            .payments.push({
                id: generateId(),
                date,
                provider,
                amount
            });
    }

    await db.collection('nonInterestLiabilities')
        .doc(liabId)
        .set(dbData.nonInterestLiabilities[idx]);

    await renderExpenseDashboard();

    cancelNIPayment(liabId);
}

async function deleteNIPayment(liabId, pmtId) {
    if (!confirm("Are you sure you want to delete this payment?")) return;
    const dbData = await getDB();
    const idx = dbData.nonInterestLiabilities.findIndex(x => x.id === liabId);
    dbData.nonInterestLiabilities[idx].payments = dbData.nonInterestLiabilities[idx].payments.filter(p => p.id !== pmtId);
    await db.collection('nonInterestLiabilities')
        .doc(liabId)
        .set(dbData.nonInterestLiabilities[idx]);
    renderExpenseDashboard();
}

// ============================================
// ====== EXPENSE DASHBOARD RENDER ENGINE ======
// ============================================
async function renderExpenseDashboard() {
    const dbData = await getDB();

    let userOptionsHTML = '<option value="">Select User</option>';
    dbData.users.forEach(u => { userOptionsHTML += `<option value="${u.id}">${u.username}</option>`; });
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

    dbData.bankLiabilities.forEach(b => {
        const u = dbData.users.find(x => x.id === b.assignTo);
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
    const nbLabels = dbData.nonBankLiabilities.map(nb => nb.name);
    const nbAmounts = dbData.nonBankLiabilities.map(nb => nb.totalAmt);
    const nbTotal = nbAmounts.reduce((sum, val) => sum + val, 0);

    const nbTitleEl = document.getElementById('nb-pie-chart-title');
    if (nbTitleEl) nbTitleEl.innerText = `Total Non Bank Amt ($${formatAmount(nbTotal)})`;

    const ctxNbPieObj = document.getElementById('nb-pie-chart');
    if (ctxNbPieObj) {
        const ctxNbPie = ctxNbPieObj.getContext('2d');
        if (window.nbPieChartInstance) window.nbPieChartInstance.destroy();
        let nPieLabels = nbLabels.length > 0 ? nbLabels : ["No Data"];
        let nPieData = nbLabels.length > 0 ? nbAmounts : [0];
        window.nbPieChartInstance = new Chart(ctxNbPie, {
            type: 'line',
            data: {
                labels: nPieLabels,
                datasets: [{
                    label: 'Liability Amount ($)',
                    data: nPieData,
                    borderColor: '#0dcaf0',
                    backgroundColor: 'rgba(13,202,240,0.2)',
                    tension: 0.3,
                    pointBackgroundColor: '#0dcaf0',
                    pointBorderColor: '#0dcaf0',
                    fill: true
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function (context) {
                                if (nPieLabels[0] === "No Data") return "No records";
                                return `${context.label}: $${formatAmount(context.raw)}`;
                            }
                        }
                    },
                    title: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Amount ($)'
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Name'
                        }
                    }
                }
            }
        });
    }

    //----------------------------
    const nbInterestLabels = dbData.nonBankLiabilities.map(nb => nb.name);
    const nbInterestData = dbData.nonBankLiabilities.map(nb => nb.interestMonthly);
    const nbInterestTotal = nbInterestData.reduce((sum, val) => sum + val, 0);

    const nbInterestTitleEl = document.getElementById('nb-interest-bar-chart-title');
    if (nbInterestTitleEl) nbInterestTitleEl.innerText = `Total Non Bank Interest Distribution ($${formatAmount(nbInterestTotal)})`;

    const ctxNbInterestBarObj = document.getElementById('nb-interest-bar-chart');
    if (ctxNbInterestBarObj) {
        const ctxNbInterestBar = ctxNbInterestBarObj.getContext('2d');
        if (window.nbInterestBarChartInstance) window.nbInterestBarChartInstance.destroy();
        let barLabels = nbInterestLabels.length > 0 ? nbInterestLabels : ["No Data"];
        let barData = nbInterestLabels.length > 0 ? nbInterestData : [0];
        window.nbInterestBarChartInstance = new Chart(ctxNbInterestBar, {
            type: 'bar',
            data: {
                labels: barLabels,
                datasets: [{
                    label: 'Total Interest ($)',
                    data: barData,
                    backgroundColor: '#ffc107'
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function (context) {
                                if (barLabels[0] === "No Data") return "No records";
                                return `${context.label}: $${formatAmount(context.raw)}`;
                            }
                        }
                    },
                    title: {
                        display: true,
                        text: `Non Bank Liabilities - Total Interest`
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Interest ($)'
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Name'
                        }
                    }
                }
            }
        });
    }


    //------------------------------
    const tbodyNB = document.getElementById('nb-list');
    if (tbodyNB) tbodyNB.innerHTML = '';

    dbData.nonBankLiabilities.forEach(b => {
        const u = dbData.users.find(x => x.id === b.assignTo);
        const assignedName = u ? u.username : 'Unknown';

        const totalMainPaid = b.mainAmtSchedules.filter(s => s.isPaid).reduce((sum, p) => sum + (parseFloat(p.paidAmt) || 0), 0);
        const totalIntPaid = b.interestSchedules.filter(s => s.isPaid).reduce((sum, p) => sum + (parseFloat(p.paidAmt) || 0), 0);
        const scheduledMonthlyMain = b.totalAmt / b.totalMonths;
        const remainExpectedMain = Math.max(0, b.totalAmt - totalMainPaid);

        const fullyPaid = remainExpectedMain === 0;

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
                    <td class="text-danger">$${formatAmount(totalIntPaid)}</td>
                    <td><span class="badge ${fullyPaid ? 'bg-success' : 'bg-warning text-dark'}">${fullyPaid ? 'Done' : 'Active'}</span></td>
                    <td class="text-center">
                        <button class="btn btn-sm btn-dark" onclick="event.stopPropagation(); editNBLiability('${b.id}')">Edit</button>
                        <button class="btn btn-sm btn-danger" onclick="event.stopPropagation(); deleteNBLiability('${b.id}')">Del</button>
                        <button class="btn btn-sm btn-outline-dark" onclick="event.stopPropagation(); toggleNBRow('${b.id}')">↕</button>
                    </td>
                </tr>`;

            const buildScheduleRows = (type, schedules, expectedMonthlyAmt, liabId) => {
                
                if (schedules.length === 0) {
                    return `<tr><td colspan="9" class="text-center text-muted py-3 fst-italic">No rows yet. Click an "Add" button above to begin.</td></tr>`;
                }

                return schedules.map((sch, i) => {
                    const rowNo = i + 1;

                    if (sch.isPaid) {
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
                        let pbOpts = '<option value="">-- Paid By --</option>';
                        dbData.users.forEach(u => { pbOpts += `<option value="${u.username}">${u.username}</option>`; });
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
                        const isRowSaved = !!(sch.date && sch.assignBy && sch.amt);
                        let assignOpts = '<option value="">-- Assign By --</option>';
                        dbData.users.forEach(u => { assignOpts += `<option value="${u.username}" ${u.username === (sch.assignBy || '') ? 'selected' : ''}>${u.username}</option>`; });
                        let pbOpts = '<option value="">-- Paid By --</option>';
                        dbData.users.forEach(u => { pbOpts += `<option value="${u.username}">${u.username}</option>`; });

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

    dbData.nonInterestLiabilities.forEach(b => {
        const u = dbData.users.find(x => x.id === b.assignTo);
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

// ------ Chart.js Logic for Expenses ------
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
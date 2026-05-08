// index.js

// Firebase config
const firebaseConfig = {
    apiKey: "AIzaSyBrff2u9vIsmoW54tW-TzEjkoO2Ye84WJ0",
    authDomain: "loan-management-system-20763.firebaseapp.com",
    projectId: "loan-management-system-20763",
    storageBucket: "loan-management-system-20763.appspot.com",
    messagingSenderId: "720980731201",
    appId: "1:720980731201:web:6c1c53584d57cf7ba8edc0",
    measurementId: "G-8RF5FX5V1N"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

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

// --- Firestore CRUD ---
async function getDB() {
    const [usersSnap, incomesSnap, bankLiabilitiesSnap, nonBankLiabilitiesSnap, nonInterestLiabilitiesSnap] = await Promise.all([
        db.collection('users').get(),
        db.collection('incomes').get(),
        db.collection('bankLiabilities').get(),
        db.collection('nonBankLiabilities').get(),
        db.collection('nonInterestLiabilities').get()
    ]);
    return {
        users: usersSnap.docs.map(doc => doc.data()),
        incomes: incomesSnap.docs.map(doc => doc.data()),
        bankLiabilities: bankLiabilitiesSnap.docs.map(doc => doc.data()),
        nonBankLiabilities: nonBankLiabilitiesSnap.docs.map(doc => doc.data()),
        nonInterestLiabilities: nonInterestLiabilitiesSnap.docs.map(doc => doc.data()),
        currentUser: JSON.parse(localStorage.getItem('currentUser')) || null    };
}

async function saveToDB(collection, data, id = null) {
    if (id) {
        await db.collection(collection).doc(id).set(data);
    } else {
        await db.collection(collection).add(data);
    }
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// ------ Authentication System ------
async function register() {
    const user = document.getElementById('auth-username').value.trim();
    const pass = document.getElementById('auth-password').value.trim();
    if (!user || !pass) return alert("Enter username & password!");
    const dbData = await getDB();
    if (dbData.users.find(u => u.username === user)) return alert("User already exists!");
    const newUser = { id: generateId(), username: user, password: pass };
    await saveToDB('users', newUser, newUser.id);
    alert("Account Opened Successfully! You can now login.");
}

async function login() {
    const user = document.getElementById('auth-username').value.trim();
    const pass = document.getElementById('auth-password').value.trim();
    const dbData = await getDB();
    const validUser = dbData.users.find(u => u.username === user && u.password === pass);
    if (validUser) {
        localStorage.setItem('currentUser', JSON.stringify(validUser));
        await checkAuth();
    } else {
        alert("Invalid credentials!");
    }
}

async function logout() {
    localStorage.removeItem('currentUser');
    await checkAuth();
}

// ------ Navigation & UI Manager ------
async function checkAuth() {
    const dbData = await getDB();
    const isAuth = dbData.currentUser !== null;
    document.getElementById('nav-user-dash').classList.toggle('hidden', !isAuth);
    document.getElementById('nav-admin-dash').classList.toggle('hidden', !isAuth);
    document.getElementById('nav-expense-dash').classList.toggle('hidden', !isAuth);
    document.getElementById('nav-logout').classList.toggle('hidden', !isAuth);
    if (isAuth) {
        document.getElementById('welcome-text').innerText = `- Welcome, ${dbData.currentUser.username}`;
        showSection('user-dashboard');
    } else {
        showSection('auth-section');
    }
}

async function showSection(sectionId) {
    document.getElementById('auth-section').classList.add('hidden');
    document.getElementById('user-dashboard').classList.add('hidden');
    document.getElementById('admin-dashboard').classList.add('hidden');
    document.getElementById('expense-dashboard').classList.add('hidden');
    document.getElementById(sectionId).classList.remove('hidden');
    if (sectionId === 'user-dashboard') { resetIncomeForm(); renderUserDashboard(); }
    if (sectionId === 'admin-dashboard') renderAdminDashboard();
    if (sectionId === 'expense-dashboard') {
        await loadUsersToDropdown(); resetBankForm(); resetNBForm(); resetNIForm(); renderExpenseDashboard();
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

// Initial Bootup
window.onload = function () {
    checkAuth();
};
/**
 * FASTMONEY - WITHDRAW CONTROLLER
 * Payment methods, Validation & Simulation
 */

const tg = window.Telegram.WebApp;

// === 1. КОНФИГУРАЦИЯ ===
const FEES = {
    usdt: { min: 10, fee: 1, label: "$" },
    ton:  { min: 5, fee: 0.1, label: "TON" },
    card: { min: 500, fee: 50, label: "RUB" }, // min 500 руб
    stars:{ min: 100, fee: 10, label: "★" }
};

const EXCHANGE_RATES = {
    USDT: 1, // Базовая
    RUB: 92.5,
    TON: 0.2, // 1 USD = 0.2 TON (примерно 5$)
    STARS: 50 // 1 USD = 50 Stars
};

// === 2. СОСТОЯНИЕ ===
let appState = JSON.parse(localStorage.getItem('fastMoneyState')) || {
    balance: { RUB: { real: 0, demo: 10000 }, USDT: { real: 0, demo: 1000 } },
    currency: 'USDT',
    mode: 'demo'
};

let form = {
    method: 'usdt', // usdt, ton, card, stars
    amount: 0
};

// === 3. ИНИЦИАЛИЗАЦИЯ ===
document.addEventListener('DOMContentLoaded', () => {
    tg.ready();
    tg.expand();
    
    updateBalanceUI();
    selectMethod('usdt'); // Дефолт
    
    // Листенер ввода суммы
    document.getElementById('amount-input').addEventListener('input', calculateTotal);
});

// === 4. ЛОГИКА ===

function selectMethod(method) {
    form.method = method;
    
    // UI Кнопок
    document.querySelectorAll('.method-card').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`.method-card[data-method="${method}"]`).classList.add('active');
    
    // UI Полей
    const label = document.getElementById('addr-label');
    const input = document.getElementById('addr-input');
    const convHint = document.getElementById('conversion-hint');
    
    // Сброс полей
    input.value = '';
    
    if (method === 'usdt') {
        label.innerText = "Адрес кошелька (TRC20)";
        input.placeholder = "T...";
        convHint.classList.add('hidden');
    } else if (method === 'ton') {
        label.innerText = "Адрес TON Wallet";
        input.placeholder = "UQ...";
        convHint.classList.add('hidden');
    } else if (method === 'card') {
        label.innerText = "Номер карты (RF)";
        input.placeholder = "0000 0000 0000 0000";
        convHint.classList.remove('hidden'); // Показываем конвертацию в рубли
    } else if (method === 'stars') {
        label.innerText = "Ваш User ID (Telegram)";
        input.value = appState.user ? appState.user.id : ''; // Автозаполнение ID
        input.readOnly = true;
        convHint.classList.add('hidden');
    }
    
    calculateTotal();
    tg.HapticFeedback.selectionChanged();
}

function calculateTotal() {
    const inputVal = parseFloat(document.getElementById('amount-input').value);
    
    if (isNaN(inputVal) || inputVal < 0) {
        updateSummary(0, 0);
        return;
    }
    
    form.amount = inputVal;
    
    // Расчет в валюте баланса (допустим, баланс всегда в USD для удобства расчетов в этом коде, 
    // но у нас есть appState.currency. Для простоты будем считать, что вывод идет в валюте баланса).
    // Если метод Card, то конвертируем USD -> RUB для отображения.
    
    // Комиссия
    const feeConfig = FEES[form.method];
    let fee = feeConfig.fee;
    
    // Если карта, комиссия в рублях, надо перевести в USD для вычета из баланса (или наоборот)
    // Упростим: все расчеты в USD.
    // Card fee: 3%
    
    let totalReceive = 0;
    let feeDisplay = "";
    
    if (form.method === 'card') {
        // Конвертация в рубли для подсказки
        const rubVal = inputVal * EXCHANGE_RATES.RUB;
        document.getElementById('conv-val').innerText = rubVal.toFixed(0);
        
        // Комиссия 3%
        fee = inputVal * 0.03;
        totalReceive = inputVal - fee;
        feeDisplay = `${fee.toFixed(2)} $ (3%)`;
    } else {
        // Фикс. комиссия
        totalReceive = inputVal - fee;
        feeDisplay = `${fee} $`;
    }
    
    if (totalReceive < 0) totalReceive = 0;
    
    updateSummary(feeDisplay, totalReceive.toFixed(2));
}

function updateSummary(fee, total) {
    document.getElementById('fee-val').innerText = fee;
    document.getElementById('total-receive').innerText = `${total} $`;
    
    // Валидация кнопки
    const btn = document.getElementById('withdraw-btn');
    const balance = getBalance();
    
    if (form.amount > balance || form.amount <= 0 || (form.amount < FEES[form.method].min && form.method !== 'card')) { 
        // Проверка минимума (упрощенная)
        btn.disabled = true;
        btn.style.opacity = '0.5';
    } else {
        btn.disabled = false;
        btn.style.opacity = '1';
    }
}

function processWithdraw() {
    const balance = getBalance();
    const addr = document.getElementById('addr-input').value;
    
    if (form.amount > balance) { alert("Недостаточно средств!"); return; }
    if (addr.length < 5) { alert("Введите корректные реквизиты!"); return; }
    
    // Списание (Виртуальное)
    const curr = appState.currency;
    const mode = appState.mode;
    appState.balance[curr][mode] -= form.amount;
    
    // Добавление в историю (опционально, если есть страница истории)
    if(!appState.history) appState.history = [];
    appState.history.push({
        game: 'Withdraw', 
        amount: form.amount, 
        type: 'loss', // списание
        time: Date.now() 
    });
    
    saveState();
    updateBalanceUI();
    
    // Модалка успеха
    document.getElementById('modal-success').classList.remove('hidden');
    tg.HapticFeedback.notificationOccurred('success');
    
    // Симуляция процесса
    setTimeout(() => {
        document.querySelector('.loader-ring').style.display = 'none';
        document.querySelector('.check-icon').classList.remove('hidden');
        document.getElementById('status-title').innerText = "УСПЕШНО!";
        document.getElementById('status-text').innerText = "Средства поступят в течение 15 минут.";
        document.getElementById('finish-btn').classList.remove('hidden');
    }, 2000);
}

// === 5. УТИЛИТЫ ===

function setMaxAmount() {
    const bal = getBalance();
    document.getElementById('amount-input').value = bal;
    calculateTotal();
}

async function pasteFromClipboard() {
    try {
        const text = await navigator.clipboard.readText();
        document.getElementById('addr-input').value = text;
    } catch (err) {
        alert("Нет доступа к буферу обмена");
    }
}

function getBalance() {
    const curr = appState.currency;
    const mode = appState.mode;
    return appState.balance[curr][mode];
}

function updateBalanceUI() {
    const bal = getBalance();
    document.getElementById('balance-val').innerText = bal.toLocaleString();
    
    const map = { 'RUB': '₽', 'USDT': '$', 'STARS': '★' };
    document.getElementById('currency-sym').innerText = map[appState.currency];
}

function saveState() {
    localStorage.setItem('fastMoneyState', JSON.stringify(appState));
}

window.openInfoModal = () => document.getElementById('modal-info').classList.remove('hidden');
window.closeInfoModal = () => document.getElementById('modal-info').classList.add('hidden');

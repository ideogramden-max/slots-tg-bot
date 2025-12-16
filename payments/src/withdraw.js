/**
 * FASTMONEY - WITHDRAW CONTROLLER
 * Логика вывода средств: валидация, комиссии, отправка заявки.
 */

const tg = window.Telegram.WebApp;

// === СОСТОЯНИЕ ===
const WdState = {
    balance: 0.00,
    method: 'usdt',
    isLoading: false
};

// === КОНФИГУРАЦИЯ КОМИССИЙ И ЛИМИТОВ ===
// (В идеале это должно приходить с бэкенда, но для UI дублируем)
const FEES = {
    'usdt': { 
        min: 10,       // Мин. сумма вывода ($)
        fix: 1.00,     // Фикс комиссия ($)
        percent: 0,    // Процент
        label: 'TRC20 Адрес',
        placeholder: 'T...' 
    },
    'ton': { 
        min: 5, 
        fix: 0.2,      // ~$1 (упрощенно)
        percent: 0,
        label: 'Адрес TON Wallet',
        placeholder: 'UQ...' 
    },
    'card': { 
        min: 5,        // ~$5 (500 RUB)
        fix: 0.5,      // ~$0.5 (50 RUB)
        percent: 0.03, // 3%
        label: 'Номер карты (РФ)',
        placeholder: '0000 0000 0000 0000' 
    }
};

// === 1. ИНИЦИАЛИЗАЦИЯ ===
document.addEventListener('DOMContentLoaded', () => {
    tg.ready();
    tg.expand();

    // 1. Загружаем баланс
    loadBalance();

    // 2. Листенер ввода суммы
    document.getElementById('amount-input').addEventListener('input', calculate);

    // 3. Выбор метода по умолчанию
    selectMethod('usdt');
});

// === 2. ЛОГИКА UI ===

async function loadBalance() {
    try {
        const res = await API.post(Config.API.USER_INIT);
        if (res.status === 'ok') {
            WdState.balance = parseFloat(res.balance.real);
            document.getElementById('balance-val').innerText = Utils.formatMoney(WdState.balance);
        }
    } catch (e) {
        console.warn("Balance sync failed");
    }
}

window.selectMethod = (method) => {
    if (WdState.isLoading) return;
    WdState.method = method;
    
    const conf = FEES[method];
    if (!conf) return; // Если метод отключен (например Stars)

    // Обновляем карточки
    document.querySelectorAll('.method-card').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`.method-card[data-method="${method}"]`).classList.add('active');

    // Обновляем поле реквизитов
    document.getElementById('addr-label').innerText = conf.label;
    document.getElementById('addr-input').placeholder = conf.placeholder;
    document.getElementById('addr-input').value = '';

    // Показываем/скрываем подсказку конвертации для карт
    const hint = document.getElementById('conversion-hint');
    if (method === 'card') hint.classList.remove('hidden');
    else hint.classList.add('hidden');

    calculate();
    Utils.vibrate('selection');
};

window.setMaxAmount = () => {
    document.getElementById('amount-input').value = WdState.balance;
    calculate();
    Utils.vibrate('light');
};

async function pasteFromClipboard() {
    try {
        const text = await navigator.clipboard.readText();
        if (text) {
            document.getElementById('addr-input').value = text;
            Utils.vibrate('success');
        }
    } catch (err) {
        tg.showAlert("Нет доступа к буферу обмена");
    }
}

/**
 * Калькулятор комиссий и валидация
 */
function calculate() {
    const inputVal = parseFloat(document.getElementById('amount-input').value) || 0;
    const conf = FEES[WdState.method];
    const btn = document.getElementById('withdraw-btn');
    const feeEl = document.getElementById('fee-val');
    const totalEl = document.getElementById('total-receive');

    // 1. Расчет комиссии
    // Fee = Fix + (Amount * Percent)
    let fee = conf.fix + (inputVal * conf.percent);
    let receive = inputVal - fee;

    if (receive < 0) receive = 0;

    // 2. Обновляем UI
    feeEl.innerText = `${fee.toFixed(2)} $`;
    totalEl.innerText = `${receive.toFixed(2)} $`;

    // Конвертация для карт (примерно)
    if (WdState.method === 'card') {
        const rubRate = Config.CURRENCY.RATES['RUB'];
        const rubVal = Math.floor(inputVal * rubRate);
        document.getElementById('conv-val').innerText = rubVal.toLocaleString();
    }

    // 3. Валидация
    let isValid = true;

    if (inputVal <= 0) isValid = false;
    if (inputVal > WdState.balance) isValid = false; // Не хватает денег
    if (inputVal < conf.min) isValid = false;        // Меньше минимума

    if (isValid) {
        btn.disabled = false;
        btn.style.opacity = '1';
    } else {
        btn.disabled = true;
        btn.style.opacity = '0.5';
    }
}

// === 3. ОТПРАВКА ЗАЯВКИ ===

window.processWithdraw = async () => {
    const amount = parseFloat(document.getElementById('amount-input').value);
    const address = document.getElementById('addr-input').value.trim();
    const method = WdState.method;

    // Финальные проверки
    if (amount > WdState.balance) {
        return tg.showAlert("Недостаточно средств на балансе!");
    }
    if (address.length < 5) {
        return tg.showAlert("Введите корректные реквизиты!");
    }

    // Блокируем кнопку
    WdState.isLoading = true;
    const btn = document.getElementById('withdraw-btn');
    btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i>';
    
    try {
        const payload = {
            user_id: App.user.id || tg.initDataUnsafe.user.id, // Из глобального стейта или ТГ
            amount: amount,
            method: method,
            address: address
        };

        const res = await API.post(Config.API.PAYOUT_REQ, payload);

        if (res.status === 'ok') {
            showSuccessModal();
            // Обновляем баланс локально, пока не обновится с сервера
            WdState.balance -= amount;
            document.getElementById('balance-val').innerText = Utils.formatMoney(WdState.balance);
        } else {
            throw new Error(res.error || "Ошибка сервера");
        }

    } catch (e) {
        console.error(e);
        tg.showAlert("Ошибка: " + e.message);
        btn.innerText = "ВЫВЕСТИ СРЕДСТВА";
        WdState.isLoading = false;
    }
};

function showSuccessModal() {
    const modal = document.getElementById('modal-success');
    const loader = modal.querySelector('.loader-ring');
    const icon = modal.querySelector('.check-icon');
    const title = document.getElementById('status-title');
    const text = document.getElementById('status-text');
    const closeBtn = document.getElementById('finish-btn');

    modal.classList.remove('hidden');
    Utils.vibrate('success');

    // Эмуляция процесса (визуал)
    setTimeout(() => {
        loader.style.display = 'none';
        icon.classList.remove('hidden');
        title.innerText = "УСПЕШНО!";
        title.style.color = "#00ff88";
        text.innerText = "Заявка создана. Ожидайте поступления средств.";
        closeBtn.classList.remove('hidden');
    }, 2000);
}

// === 4. МОДАЛКИ (Info) ===
window.openInfoModal = () => document.getElementById('modal-info').classList.remove('hidden');
window.closeInfoModal = () => document.getElementById('modal-info').classList.add('hidden');

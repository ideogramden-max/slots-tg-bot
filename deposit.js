/**
 * FASTMONEY - DEPOSIT CONTROLLER
 * Integration with Python Backend & 1plat
 */

const tg = window.Telegram.WebApp;

// Адрес твоего Python-бота (Backend)
// Замени на реальный IP или домен!
const BACKEND_URL = "https://alpha-firms-electronics-return.trycloudflare.com/api/create_payment";

// Курс (примерный, для отображения)
const EXCHANGE_RATE = 95; // 1$ = 95 RUB

// === СОСТОЯНИЕ ===
let appState = JSON.parse(localStorage.getItem('fastMoneyState')) || {
    balance: { RUB: { real: 0, demo: 10000 }, USDT: { real: 0, demo: 1000 } },
    currency: 'USDT',
    mode: 'demo'
};

let form = {
    amountRUB: 0,
    method: 'card'
};

// === ИНИЦИАЛИЗАЦИЯ ===
document.addEventListener('DOMContentLoaded', () => {
    tg.ready();
    tg.expand();
    
    updateBalanceUI();
    
    // Листенер ввода
    const input = document.getElementById('amount-input');
    input.addEventListener('input', (e) => {
        updateCalc(parseFloat(e.target.value));
    });
});

// === ЛОГИКА ===

function selectMethod(method) {
    form.method = method;
    document.querySelectorAll('.method-card').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`.method-card[data-method="${method}"]`).classList.add('active');
    tg.HapticFeedback.selectionChanged();
}

function setAmount(val) {
    const input = document.getElementById('amount-input');
    // Добавляем к текущему или ставим новое? Обычно ставим новое в криптоботах
    // Но лучше сделаем добавление для удобства?
    // Сделаем просто установку.
    input.value = val;
    updateCalc(val);
    tg.HapticFeedback.selectionChanged();
}

function updateCalc(rubAmount) {
    if (isNaN(rubAmount) || rubAmount < 0) rubAmount = 0;
    form.amountRUB = rubAmount;
    
    document.getElementById('pay-amount').innerText = rubAmount.toLocaleString() + ' ₽';
    
    // Конвертация в USD (игровую валюту)
    const usdAmount = rubAmount / EXCHANGE_RATE;
    document.getElementById('receive-amount').innerText = usdAmount.toFixed(2) + ' $';
}

async function initiatePayment() {
    // 1. Проверки
    if (form.amountRUB < 100) {
        alert("Минимальная сумма 100 ₽");
        tg.HapticFeedback.notificationOccurred('error');
        return;
    }

    const userId = tg.initDataUnsafe.user ? tg.initDataUnsafe.user.id : null;
    if (!userId) {
        alert("Ошибка: Запустите через Telegram");
        return;
    }

    // 2. UI Загрузка
    document.getElementById('modal-loading').classList.remove('hidden');
    
    try {
        // 3. Запрос к нашему Python Backend
        // Мы отправляем user_id и сумму в рублях.
        // Бот сгенерирует подпись и вернет ссылку на 1plat.
        
        const response = await fetch(BACKEND_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                user_id: userId,
                amount: form.amountRUB,
                method: form.method // Можно передать для статистики, но 1plat сам предложит выбор
            })
        });

        if (!response.ok) throw new Error("Server Error");

        const data = await response.json();

        // 4. Редирект на оплату
        // 1plat требует POST форму. Бот вернул { url: "...", payload: { ... } }
        
        createAndSubmitForm(data.url, data.payload);

    } catch (e) {
        console.error(e);
        document.getElementById('modal-loading').classList.add('hidden');
        alert("Ошибка создания счета. Проверьте интернет или попробуйте позже.");
    }
}

// Создание невидимой формы для POST запроса
function createAndSubmitForm(url, payload) {
    const form = document.createElement("form");
    form.method = "POST";
    form.action = url;
    // form.target = "_blank"; // Раскомментировать, если нужно в новом окне (в TG WebApp лучше _self или редирект)
    
    for (const key in payload) {
        if (payload.hasOwnProperty(key)) {
            const hiddenField = document.createElement("input");
            hiddenField.type = "hidden";
            hiddenField.name = key;
            hiddenField.value = payload[key];
            form.appendChild(hiddenField);
        }
    }

    document.body.appendChild(form);
    form.submit();
}

// === УТИЛИТЫ ===

function updateBalanceUI() {
    const curr = appState.currency;
    const mode = appState.mode;
    document.getElementById('balance-val').innerText = appState.balance[curr][mode].toLocaleString();
}

window.openInfoModal = () => document.getElementById('modal-info').classList.remove('hidden');
window.closeInfoModal = () => document.getElementById('modal-info').classList.add('hidden');

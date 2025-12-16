/**
 * FASTMONEY - DEPOSIT CONTROLLER
 * Логика пополнения: выбор метода, калькулятор, отправка формы.
 */

const tg = window.Telegram.WebApp;

// Состояние формы
const DepState = {
    method: 'card', // card, sbp, stars, crypto
    amount: '',     // Введенное значение (в валюте метода)
    isLoading: false
};

// Конфигурация методов (лимиты и метки)
const METHOD_CONFIG = {
    'card':   { currency: 'RUB', min: 100, label: '₽', rateKey: 'RUB' },
    'sbp':    { currency: 'RUB', min: 100, label: '₽', rateKey: 'RUB' },
    'stars':  { currency: 'XTR', min: 50,  label: '★', rateKey: 'STARS' }, // XTR - код звезд
    'crypto': { currency: 'USD', min: 10,  label: '$', rateKey: 'USDT' }
};

// === 1. ИНИЦИАЛИЗАЦИЯ ===
document.addEventListener('DOMContentLoaded', () => {
    tg.ready();
    tg.expand();

    // Загружаем текущий баланс для шапки
    loadBalance();

    // Слушатель ввода суммы
    const input = document.getElementById('amount-input');
    input.addEventListener('input', (e) => {
        DepState.amount = e.target.value;
        recalculate();
    });

    // Инициализация дефолтного метода
    selectMethod('card');
});

// === 2. ЛОГИКА UI ===

async function loadBalance() {
    try {
        const res = await API.post(Config.API.USER_INIT);
        if (res.status === 'ok') {
            document.getElementById('current-balance').innerText = Utils.formatMoney(res.balance.real);
        }
    } catch (e) {
        console.warn("Balance load fail");
    }
}

/**
 * Выбор метода оплаты
 */
window.selectMethod = (method) => {
    if (DepState.isLoading) return;
    
    DepState.method = method;
    const conf = METHOD_CONFIG[method];

    // 1. Обновляем UI карточек
    document.querySelectorAll('.method-card').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`.method-card[data-method="${method}"]`).classList.add('active');

    // 2. Обновляем инпут (Валюта и Placeholder)
    const input = document.getElementById('amount-input');
    const label = document.getElementById('input-label');
    const tag = document.getElementById('input-currency');

    input.placeholder = `Min ${conf.min}`;
    tag.innerText = conf.label;
    
    // Меняем текст лейбла
    if (method === 'stars') label.innerText = "Сумма пополнения (Stars)";
    else if (method === 'crypto') label.innerText = "Сумма пополнения (USDT)";
    else label.innerText = "Сумма пополнения (RUB)";

    // 3. Обновляем быстрые кнопки
    updateQuickButtons(method);

    // 4. Пересчитываем (если что-то введено)
    recalculate();
    
    Utils.vibrate('selection');
};

/**
 * Обновление кнопок +100 / +500 в зависимости от валюты
 */
function updateQuickButtons(method) {
    const container = document.getElementById('quick-buttons');
    container.innerHTML = ''; // Очистка

    let amounts = [];
    if (method === 'stars') amounts = [50, 100, 500, 1000];
    else if (method === 'crypto') amounts = [10, 50, 100, 500];
    else amounts = [100, 500, 1000, 5000]; // RUB

    amounts.forEach(val => {
        const btn = document.createElement('button');
        btn.innerText = `+${val}`;
        btn.onclick = () => window.addAmount(val);
        container.appendChild(btn);
    });
}

/**
 * Добавление суммы из быстрых кнопок
 */
window.addAmount = (val) => {
    const input = document.getElementById('amount-input');
    let current = parseFloat(input.value) || 0;
    input.value = current + val;
    DepState.amount = input.value;
    recalculate();
    Utils.vibrate('light');
};

/**
 * Калькулятор конвертации
 */
function recalculate() {
    const val = parseFloat(DepState.amount);
    const conf = METHOD_CONFIG[DepState.method];
    
    const payEl = document.getElementById('pay-amount');
    const receiveEl = document.getElementById('receive-amount');

    if (!val || val < 0) {
        payEl.innerText = `0 ${conf.label}`;
        receiveEl.innerText = "0.00 $";
        return;
    }

    // Отображаем сумму списания
    payEl.innerText = `${val.toLocaleString()} ${conf.label}`;

    // Считаем зачисление в USD
    // Rate: Сколько единиц этой валюты в 1 USD
    // Пример: RUB = 96.5. Значит 1000 RUB = 1000 / 96.5 = 10.36 USD
    const rate = Config.CURRENCY.RATES[conf.rateKey] || 1;
    const usdAmount = val / rate;

    receiveEl.innerText = Utils.formatMoney(usdAmount) + " $";
}

// === 3. ЛОГИКА ОПЛАТЫ ===

window.initiatePayment = async () => {
    const val = parseFloat(DepState.amount);
    const conf = METHOD_CONFIG[DepState.method];

    // Валидация
    if (!val || isNaN(val)) {
        alert("Введите сумму");
        return;
    }
    if (val < conf.min) {
        alert(`Минимальная сумма: ${conf.min} ${conf.label}`);
        Utils.vibrate('error');
        return;
    }

    // Блокировка интерфейса
    DepState.isLoading = true;
    document.getElementById('modal-loading').classList.remove('hidden');
    
    try {
        // Формируем запрос
        const payload = {
            amount: val, // Сумма в валюте метода (RUB, Stars...)
            method: DepState.method,
            currency: conf.currency
        };

        // Отправляем на бэкенд
        const response = await API.post(Config.API.PAYMENT_CREATE, payload);

        // Обработка ответа
        if (response.url && response.payload) {
            // Сценарий 1: Редирект на платежку (1plat) через POST форму
            // Backend должен вернуть { url: "...", payload: { key: value, sign: ... } }
            createAndSubmitForm(response.url, response.payload);
        
        } else if (response.invoice_link) {
            // Сценарий 2: Telegram Stars (Invoice Link)
            document.getElementById('modal-loading').classList.add('hidden');
            tg.openInvoice(response.invoice_link, (status) => {
                if (status === 'paid') {
                    tg.showAlert("Оплата прошла успешно!");
                    window.location.href = '../../index.html';
                } else {
                    DepState.isLoading = false;
                }
            });

        } else if (response.payment_url) {
            // Сценарий 3: Просто ссылка (Crypto)
            window.location.href = response.payment_url;
        } else {
            throw new Error("Некорректный ответ сервера");
        }

    } catch (e) {
        console.error(e);
        document.getElementById('modal-loading').classList.add('hidden');
        alert("Ошибка создания платежа: " + e.message);
        DepState.isLoading = false;
    }
};

/**
 * Создает невидимую форму и отправляет POST запрос
 * (Нужно для 1plat и других мерчантов)
 */
function createAndSubmitForm(url, data) {
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = url;
    
    // Создаем инпуты
    for (const key in data) {
        if (data.hasOwnProperty(key)) {
            const input = document.createElement('input');
            input.type = 'hidden';
            input.name = key;
            input.value = data[key];
            form.appendChild(input);
        }
    }

    document.body.appendChild(form);
    form.submit();
}

// === 4. МОДАЛКИ (Info) ===
window.openInfoModal = () => document.getElementById('modal-info').classList.remove('hidden');
window.closeInfoModal = () => document.getElementById('modal-info').classList.add('hidden');

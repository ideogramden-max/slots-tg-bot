/**
 * FASTMONEY - WALLET HUB CONTROLLER
 * Логика главной страницы кошелька: Баланс, Курсы, История.
 */

const tg = window.Telegram.WebApp;

// Состояние страницы
const WalletState = {
    balance: 0.00,
    history: [],
    isLoading: false
};

// === 1. ИНИЦИАЛИЗАЦИЯ ===
document.addEventListener('DOMContentLoaded', () => {
    tg.ready();
    tg.expand();

    // Загрузка данных
    loadWalletData();

    // Настройка кнопки обновления
    const refreshBtn = document.querySelector('.refresh-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            refreshBtn.style.transform = 'rotate(360deg)';
            setTimeout(() => refreshBtn.style.transform = 'none', 500);
            loadWalletData();
        });
    }
});

// === 2. ЗАГРУЗКА ДАННЫХ ===

async function loadWalletData() {
    if (WalletState.isLoading) return;
    WalletState.isLoading = true;

    try {
        // Запускаем параллельно обновление баланса и истории
        await Promise.all([
            fetchBalance(),
            fetchHistory()
        ]);
        
        Utils.vibrate('light');

    } catch (error) {
        console.error("Wallet Load Error:", error);
        // Если ошибка сети, показываем демо-данные (или алерт)
        // alert("Ошибка загрузки данных кошелька");
    } finally {
        WalletState.isLoading = false;
        // Убираем спиннеры если они были
        const loader = document.querySelector('.loader-placeholder');
        if (loader) loader.remove();
    }
}

/**
 * Получение актуального баланса
 */
async function fetchBalance() {
    try {
        // Используем эндпоинт инициализации, он возвращает точный баланс
        // Или отдельный /api/user/balance если есть
        const response = await API.post(Config.API.USER_INIT);
        
        if (response.status === 'ok') {
            WalletState.balance = parseFloat(response.balance.real); // Только реальный баланс
            renderBalance();
        }
    } catch (e) {
        console.warn("Balance sync failed, using cached/zero");
    }
}

/**
 * Получение истории транзакций
 */
async function fetchHistory() {
    try {
        const response = await API.post(Config.API.TRANS_HISTORY);
        
        if (response.transactions) {
            WalletState.history = response.transactions;
            renderHistory();
        } else {
            // Если сервер не вернул массив, считаем что пусто
            renderHistory([]);
        }
    } catch (e) {
        console.warn("History sync failed");
        // Показываем заглушку при ошибке
        renderHistory([]); 
    }
}

// === 3. ОТРИСОВКА (RENDER) ===

function renderBalance() {
    const balEl = document.getElementById('wallet-balance');
    const rubEl = document.getElementById('wallet-balance-rub');

    // 1. Основной баланс (USDT)
    // Анимация чисел через Utils или простая вставка
    balEl.innerText = Utils.formatMoney(WalletState.balance, false);

    // 2. Примерный баланс в Рублях
    // Берем курс из конфига
    const rubRate = Config.CURRENCY.RATES['RUB'] || 95;
    const rubVal = Math.floor(WalletState.balance * rubRate);
    
    rubEl.innerText = rubVal.toLocaleString('ru-RU');
}

function renderHistory(list = null) {
    const transactions = list || WalletState.history;
    const container = document.getElementById('transaction-list');
    const emptyState = document.getElementById('empty-history');

    container.innerHTML = ''; // Очистка

    if (!transactions || transactions.length === 0) {
        emptyState.classList.remove('hidden');
        return;
    }

    emptyState.classList.add('hidden');

    // Сортировка: новые сверху (если сервер не сортирует)
    // transactions.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    transactions.forEach(tx => {
        const el = createTransactionElement(tx);
        container.appendChild(el);
    });
}

/**
 * Создание DOM-элемента транзакции
 */
function createTransactionElement(tx) {
    // tx structure: { type: 'deposit'|'withdraw', amount: 100, status: 'paid'|'pending', created_at: '...' }
    
    const div = document.createElement('div');
    const isDeposit = tx.type === 'deposit';
    div.className = `tx-item ${isDeposit ? 'in' : 'out'}`;

    // Иконка
    const iconClass = isDeposit ? 'fa-arrow-down' : 'fa-arrow-up';
    
    // Статус и Текст
    let statusText = 'Ожидание';
    let statusClass = 'pending';
    
    if (tx.status === 'paid' || tx.status === 'success') {
        statusText = 'Успешно';
        statusClass = 'success';
    } else if (tx.status === 'error' || tx.status === 'canceled') {
        statusText = 'Отмена';
        statusClass = 'error';
    }

    // Название метода (маппинг)
    const methodNames = {
        'card': 'Карта РФ',
        'sbp': 'СБП',
        'crypto': 'USDT',
        'stars': 'Stars'
    };
    const methodLabel = methodNames[tx.method] || (isDeposit ? 'Пополнение' : 'Вывод средств');

    // Дата
    const dateStr = Utils.formatDate(tx.created_at);

    // Сумма (форматирование)
    const sign = isDeposit ? '+' : '-';
    const amountStr = `${sign} ${Utils.formatMoney(tx.amount)} $`;

    div.innerHTML = `
        <div class="tx-left">
            <div class="tx-icon">
                <i class="fa-solid ${iconClass}"></i>
            </div>
            <div class="tx-info">
                <span class="tx-title">${methodLabel}</span>
                <span class="tx-date">${dateStr}</span>
            </div>
        </div>
        <div class="tx-right">
            <span class="tx-amount">${amountStr}</span>
            <span class="tx-status ${statusClass}">${statusText}</span>
        </div>
    `;

    return div;
}

// === 4. МОДАЛКИ (Info) ===
window.openInfoModal = () => {
    document.getElementById('modal-info').classList.remove('hidden');
    Utils.vibrate('light');
};

window.closeInfoModal = () => {
    document.getElementById('modal-info').classList.add('hidden');
};

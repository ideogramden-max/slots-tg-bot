/**
 * FASTMONEY - PENALTY SHOOTOUT ENGINE
 * Ball physics emulation & Goalkeeper AI logic
 */

const tg = window.Telegram.WebApp;

// === 1. КОНФИГУРАЦИЯ ===
const CONFIG = {
    multiplier: 1.92, // Коэффициент победы
    animationDuration: 600, // мс (полет мяча)
    resetDelay: 2000 // мс (перед показом модалки)
};

// Соответствие зон удара и классов анимации
const ZONES = {
    'tl': { ball: 'kick-tl', keeper: 'dive-top-left' },
    'tr': { ball: 'kick-tr', keeper: 'dive-top-right' },
    'c':  { ball: 'kick-c',  keeper: 'stay-center' },
    'bl': { ball: 'kick-bl', keeper: 'dive-left' },
    'br': { ball: 'kick-br', keeper: 'dive-right' }
};

const ZONE_KEYS = Object.keys(ZONES);

// === 2. СОСТОЯНИЕ (STATE) ===

// Глобальное
let appState = JSON.parse(localStorage.getItem('fastMoneyState')) || {
    balance: { RUB: { real: 0, demo: 10000 }, USDT: { real: 0, demo: 1000 } },
    currency: 'USDT',
    mode: 'demo'
};

// Локальное
let game = {
    isKicking: false, // Мяч летит
    isPrepared: false, // Ставка сделана, ждем выбора угла
    bet: 100
};

// Аудио
const audio = {
    play(id) {
        const el = document.getElementById('snd-' + id);
        if (el) {
            el.currentTime = 0;
            el.play().catch(() => {});
        }
    }
};

// === 3. ИНИЦИАЛИЗАЦИЯ ===
document.addEventListener('DOMContentLoaded', () => {
    tg.ready();
    tg.expand();
    
    updateBalanceUI();
    setupControls();
    
    // Фейковая история
    addHistoryItem('goal');
    addHistoryItem('miss');
    addHistoryItem('goal');
});

// === 4. ИГРОВОЙ ПРОЦЕСС ===

// Шаг 1: Подготовка (Нажатие "Сделать ставку")
function prepareRound() {
    if (game.isKicking || game.isPrepared) return;

    // Проверка баланса
    const curr = appState.currency;
    const mode = appState.mode;
    if (appState.balance[curr][mode] < game.bet) {
        alert("Недостаточно средств!");
        return;
    }

    // Блокируем настройки, открываем ворота
    game.isPrepared = true;
    
    // UI
    document.getElementById('targets').classList.remove('disabled');
    document.getElementById('main-btn').style.display = 'none'; // Скрываем кнопку, теперь кликаем по воротам
    document.querySelector('.penalty-controls').style.opacity = '0.5'; // Затемняем низ
    
    // Сброс позиций (на всякий случай)
    resetPositions();
    
    audio.play('whistle'); // Свисток судьи
    tg.HapticFeedback.impactOccurred('light');
}

// Шаг 2: Удар (Клик по зоне)
function kick(playerZone) {
    if (!game.isPrepared || game.isKicking) return;
    
    game.isKicking = true;
    game.isPrepared = false; // Блокируем повторный клик
    
    // Списание ставки
    const curr = appState.currency;
    const mode = appState.mode;
    appState.balance[curr][mode] -= game.bet;
    saveState();
    updateBalanceUI();

    // Блокировка UI
    document.getElementById('targets').classList.add('disabled');

    // === ЛОГИКА РЕЗУЛЬТАТА ===
    // Решаем, победа или нет (шанс ~50%)
    // Для коэффициента 1.92 шанс должен быть около 50-52% (с учетом house edge)
    const isWin = Math.random() > 0.5;

    // Определяем, куда прыгнет вратарь
    let keeperZone;
    
    if (isWin) {
        // Вратарь прыгает НЕ туда, куда ударил игрок
        const otherZones = ZONE_KEYS.filter(z => z !== playerZone);
        keeperZone = otherZones[Math.floor(Math.random() * otherZones.length)];
    } else {
        // Вратарь прыгает ТУДА ЖЕ (Сэйв)
        keeperZone = playerZone;
    }

    // === АНИМАЦИЯ ===
    performAnimation(playerZone, keeperZone);

    // === ЗАВЕРШЕНИЕ ===
    setTimeout(() => {
        finishRound(isWin, playerZone, keeperZone);
    }, CONFIG.animationDuration);
}

function performAnimation(pZone, kZone) {
    const ballWrapper = document.getElementById('ball-wrapper');
    const keeper = document.getElementById('keeper');

    // Звук удара
    audio.play('kick');
    tg.HapticFeedback.impactOccurred('heavy');

    // Классы анимации мяча
    ballWrapper.className = 'ball-wrapper kicked'; // Базовые + вращение
    ballWrapper.classList.add(ZONES[pZone].ball);  // Направление

    // Классы анимации вратаря
    keeper.className = 'goalkeeper';
    keeper.classList.add(ZONES[kZone].keeper);
}

function finishRound(isWin, pZone, kZone) {
    const resultMsg = document.getElementById('result-msg');
    
    if (isWin) {
        // ГОЛ
        resultMsg.innerText = "GOAL!";
        resultMsg.className = 'result-msg visible'; // Золотой
        
        audio.play('goal');
        tg.HapticFeedback.notificationOccurred('success');
        
        // Начисление
        const winAmount = Math.floor(game.bet * CONFIG.multiplier);
        const curr = appState.currency;
        const mode = appState.mode;
        appState.balance[curr][mode] += winAmount;
        saveState();
        updateBalanceUI();

        addHistoryItem('goal');
        
        // Модалка чуть позже
        setTimeout(() => showWinModal(winAmount), 800);

    } else {
        // СЭЙВ
        resultMsg.innerText = "SAVED!";
        resultMsg.className = 'result-msg visible miss'; // Красный
        
        audio.play('save');
        tg.HapticFeedback.notificationOccurred('error');
        
        addHistoryItem('miss');
        
        setTimeout(() => {
            document.getElementById('modal-loss').classList.remove('hidden');
        }, 800);
    }
}

// Сброс для нового раунда
function resetPositions() {
    const ballWrapper = document.getElementById('ball-wrapper');
    const keeper = document.getElementById('keeper');
    const resultMsg = document.getElementById('result-msg');

    ballWrapper.className = 'ball-wrapper'; // Сброс полета и вращения
    keeper.className = 'goalkeeper idle';   // Сброс прыжка, возврат в idle
    resultMsg.className = 'result-msg hidden';
}

function fullReset() {
    resetPositions();
    game.isKicking = false;
    game.isPrepared = false;
    
    // UI возврат
    document.getElementById('main-btn').style.display = 'flex';
    document.querySelector('.penalty-controls').style.opacity = '1';
    document.getElementById('targets').classList.add('disabled');
}

// === 5. UI И УПРАВЛЕНИЕ ===

function setupControls() {
    // Ставки
    window.setBet = (val) => {
        if (game.isPrepared || game.isKicking) return;
        
        if (val === 'max') game.bet = 5000;
        else game.bet = val;

        if (game.bet > 10000) game.bet = 10000;
        if (game.bet < 100) game.bet = 100;

        document.getElementById('bet-amount').innerText = game.bet;
        tg.HapticFeedback.selectionChanged();
    };

    document.getElementById('btn-inc').addEventListener('click', () => {
        if (game.bet < 10000) { game.bet += 100; document.getElementById('bet-amount').innerText = game.bet; }
    });
    document.getElementById('btn-dec').addEventListener('click', () => {
        if (game.bet > 100) { game.bet -= 100; document.getElementById('bet-amount').innerText = game.bet; }
    });
}

// История
function addHistoryItem(type) {
    const container = document.getElementById('history-container');
    const item = document.createElement('div');
    
    if (type === 'goal') {
        item.className = 'ball-mark';
        item.innerText = '⚽';
    } else {
        item.className = 'ball-mark miss';
        item.innerText = '❌';
    }
    
    container.prepend(item);
    if (container.children.length > 15) container.removeChild(container.lastChild);
}

// Модалки
function showWinModal(amount) {
    document.getElementById('win-amount').innerText = amount.toLocaleString();
    document.getElementById('win-currency').innerText = getCurrSym();
    document.getElementById('modal-win').classList.remove('hidden');
}

window.closeWinModal = () => {
    document.getElementById('modal-win').classList.add('hidden');
    fullReset();
};
window.closeLossModal = () => {
    document.getElementById('modal-loss').classList.add('hidden');
    fullReset();
};

window.openInfoModal = () => document.getElementById('modal-info').classList.remove('hidden');
window.closeInfoModal = () => document.getElementById('modal-info').classList.add('hidden');

// Утилиты
function updateBalanceUI() {
    const curr = appState.currency;
    const mode = appState.mode;
    document.getElementById('balance-display').innerText = appState.balance[curr][mode].toLocaleString();
    document.getElementById('currency-display').innerText = getCurrSym();
}
function getCurrSym() { return { 'RUB': '₽', 'USDT': '$', 'STARS': '★' }[appState.currency] || ''; }
function saveState() { localStorage.setItem('fastMoneyState', JSON.stringify(appState)); }

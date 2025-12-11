/**
 * FASTMONEY - KNB ENGINE (Rock Paper Scissors)
 * Logic, Animation & Betting System
 */

const tg = window.Telegram.WebApp;

// === 1. КОНФИГУРАЦИЯ ===
const CONFIG = {
    shakeDuration: 1500, // 1.5 сек тряски (3 взмаха по 0.5с в CSS)
    winMultiplier: 2.00,
    drawMultiplier: 1.00 // Возврат ставки
};

const WEAPONS = ['rock', 'paper', 'scissors'];
const ICONS = {
    rock: 'fa-hand-back-fist',
    paper: 'fa-hand',
    scissors: 'fa-hand-scissors'
};

// === 2. СОСТОЯНИЕ (STATE) ===

// Глобальное
let appState = JSON.parse(localStorage.getItem('fastMoneyState')) || {
    balance: { RUB: { real: 0, demo: 10000 }, USDT: { real: 0, demo: 1000 } },
    currency: 'USDT',
    mode: 'demo'
};

// Локальное
let game = {
    isPlaying: false,
    bet: 100,
    history: [] // ['win', 'loss', 'draw']
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
    
    // Бинды ставок
    setupControls();
    
    // Фейковая история для красоты
    addHistoryDot('win');
    addHistoryDot('loss');
    addHistoryDot('draw');
});

// === 4. ИГРОВОЙ ПРОЦЕСС ===

function playRound(playerChoice) {
    if (game.isPlaying) return;

    // Проверка баланса
    const curr = appState.currency;
    const mode = appState.mode;
    if (appState.balance[curr][mode] < game.bet) {
        alert("Недостаточно средств!");
        return;
    }

    // Старт
    game.isPlaying = true;
    
    // Списание
    appState.balance[curr][mode] -= game.bet;
    saveState();
    updateBalanceUI();

    // UI Блокировка
    document.getElementById('weapons-area').classList.add('disabled');
    document.getElementById('status-text').innerText = "СУ... Е... ФА!";
    
    // Сброс иконок на "Камень" (для тряски)
    resetHands();
    
    // Запуск анимации тряски
    const pHand = document.getElementById('player-hand');
    const eHand = document.getElementById('enemy-hand');
    
    pHand.classList.add('shake');
    eHand.classList.add('shake');
    
    // Звук взмаха
    audio.play('shake');
    tg.HapticFeedback.impactOccurred('medium');

    // Ожидание конца анимации
    setTimeout(() => {
        // Остановка тряски
        pHand.classList.remove('shake');
        eHand.classList.remove('shake');
        
        // Выбор бота
        const botChoice = WEAPONS[Math.floor(Math.random() * WEAPONS.length)];
        
        // Показ результатов
        showResult(playerChoice, botChoice);
        
    }, CONFIG.shakeDuration);
}

function showResult(pChoice, bChoice) {
    // Меняем иконки
    const pHand = document.getElementById('player-hand');
    const eHand = document.getElementById('enemy-hand');
    
    pHand.innerHTML = `<i class="fa-solid ${ICONS[pChoice]}"></i>`;
    eHand.innerHTML = `<i class="fa-solid ${ICONS[bChoice]}"></i>`;
    
    // Определяем победителя
    let result = 'draw';
    
    if (pChoice === bChoice) {
        result = 'draw';
    } else if (
        (pChoice === 'rock' && bChoice === 'scissors') ||
        (pChoice === 'paper' && bChoice === 'rock') ||
        (pChoice === 'scissors' && bChoice === 'paper')
    ) {
        result = 'win';
    } else {
        result = 'loss';
    }

    // Обработка исхода
    handleOutcome(result);
}

function handleOutcome(result) {
    const curr = appState.currency;
    const mode = appState.mode;
    let winAmount = 0;

    if (result === 'win') {
        winAmount = Math.floor(game.bet * CONFIG.winMultiplier);
        appState.balance[curr][mode] += winAmount;
        
        document.getElementById('status-text').innerText = "ТЫ ПОБЕДИЛ!";
        document.getElementById('status-text').style.color = "#00ff88";
        
        audio.play('win');
        tg.HapticFeedback.notificationOccurred('success');
        showModal('modal-win', winAmount);
        
    } else if (result === 'draw') {
        winAmount = Math.floor(game.bet * CONFIG.drawMultiplier);
        appState.balance[curr][mode] += winAmount; // Возврат
        
        document.getElementById('status-text').innerText = "НИЧЬЯ";
        document.getElementById('status-text').style.color = "#ccc";
        
        audio.play('select');
        tg.HapticFeedback.notificationOccurred('warning');
        showModal('modal-draw');
        
    } else {
        document.getElementById('status-text').innerText = "БОТ ПОБЕДИЛ";
        document.getElementById('status-text').style.color = "#ff0055";
        
        audio.play('lose');
        tg.HapticFeedback.notificationOccurred('error');
        showModal('modal-loss');
    }

    saveState();
    updateBalanceUI();
    addHistoryDot(result);
}

function resetHands() {
    // Возвращаем кулаки
    document.getElementById('player-hand').innerHTML = `<i class="fa-solid fa-hand-back-fist"></i>`;
    document.getElementById('enemy-hand').innerHTML = `<i class="fa-solid fa-hand-back-fist"></i>`;
}

// === 5. УПРАВЛЕНИЕ И UI ===

function showModal(id, amount = 0) {
    const modal = document.getElementById(id);
    modal.classList.remove('hidden');
    
    if (id === 'modal-win') {
        document.getElementById('win-amount').innerText = amount.toLocaleString();
        document.getElementById('win-currency').innerText = getCurrSym();
    }
}

window.closeResultModal = () => {
    // Закрываем все модалки
    document.querySelectorAll('.modal-overlay').forEach(el => el.classList.add('hidden'));
    
    // Сброс UI для новой игры
    document.getElementById('weapons-area').classList.remove('disabled');
    document.getElementById('status-text').innerText = "ВЫБЕРИ ОРУЖИЕ";
    document.getElementById('status-text').style.color = "#888";
    
    resetHands();
    game.isPlaying = false;
};

function addHistoryDot(type) {
    const container = document.getElementById('history-container');
    const dot = document.createElement('div');
    dot.className = `dot ${type}`;
    
    // Добавляем в начало
    container.prepend(dot);
    
    // Храним только последние 20
    if (container.children.length > 20) {
        container.removeChild(container.lastChild);
    }
}

function setupControls() {
    // Ставки
    window.setBet = (val, type) => {
        if (game.isPlaying) return;
        
        if (val === 'max') game.bet = 10000;
        else if (type === 'mul') game.bet = Math.floor(game.bet * val);
        else game.bet = val;

        if (game.bet > 10000) game.bet = 10000;
        if (game.bet < 1) game.bet = 1;

        document.getElementById('bet-amount').innerText = game.bet;
        tg.HapticFeedback.selectionChanged();
    };

    document.getElementById('btn-inc').addEventListener('click', () => {
        if (game.bet < 10000) game.bet += 100;
        document.getElementById('bet-amount').innerText = game.bet;
    });
    document.getElementById('btn-dec').addEventListener('click', () => {
        if (game.bet > 100) game.bet -= 100;
        document.getElementById('bet-amount').innerText = game.bet;
    });
}

// === 6. УТИЛИТЫ ===

function updateBalanceUI() {
    const curr = appState.currency;
    const mode = appState.mode;
    document.getElementById('balance-display').innerText = appState.balance[curr][mode].toLocaleString();
    document.getElementById('currency-display').innerText = getCurrSym();
}
function getCurrSym() { return { 'RUB': '₽', 'USDT': '$', 'STARS': '★' }[appState.currency] || ''; }
function saveState() { localStorage.setItem('fastMoneyState', JSON.stringify(appState)); }

// Модалки
window.openInfoModal = () => document.getElementById('modal-info').classList.remove('hidden');
window.closeInfoModal = () => document.getElementById('modal-info').classList.add('hidden');

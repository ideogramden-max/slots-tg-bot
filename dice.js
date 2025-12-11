/**
 * FASTMONEY - DICE ENGINE
 * Logic for slider, probability math & animations
 */

const tg = window.Telegram.WebApp;

// === 1. КОНФИГУРАЦИЯ ===
const CONFIG = {
    minChance: 2,
    maxChance: 98,
    houseEdge: 2, // 2% преимущество казино
    scrambleDuration: 400 // время анимации чисел
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
    isRolling: false,
    bet: 100,
    chance: 50,      // % шанса победы
    direction: 'under', // 'under' (<) или 'over' (>)
    multiplier: 1.96,
    lastResult: 50.00
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
    
    // Инициализация слайдера
    const slider = document.getElementById('dice-slider');
    slider.value = game.chance;
    
    // Бинды
    setupControls();
    
    // Первый просчет UI
    updateGameMath();
    updateSliderVisuals();
});

// === 4. ЛОГИКА СЛАЙДЕРА И МАТЕМАТИКА ===

function updateGameMath() {
    // 1. Ограничение шанса
    if (game.chance < CONFIG.minChance) game.chance = CONFIG.minChance;
    if (game.chance > CONFIG.maxChance) game.chance = CONFIG.maxChance;

    // 2. Расчет множителя
    // Формула: (100 - Edge) / Chance
    let mult = (100 - CONFIG.houseEdge) / game.chance;
    
    // Округляем до сотых, но не меньше 1.01
    mult = Math.floor(mult * 100) / 100;
    if (mult < 1.01) mult = 1.01;
    game.multiplier = mult;

    // 3. Расчет потенциального выигрыша
    const profit = Math.floor(game.bet * game.multiplier) - game.bet;
    const totalWin = Math.floor(game.bet * game.multiplier);

    // 4. Обновление UI
    document.getElementById('chance-val').innerText = game.chance + '%';
    document.getElementById('multiplier-val').innerText = game.multiplier.toFixed(2) + 'x';
    document.getElementById('potential-win').innerText = totalWin;
}

function updateSliderVisuals() {
    const fill = document.getElementById('range-fill');
    const slider = document.getElementById('dice-slider');
    
    // Синхронизируем инпут
    slider.value = game.chance;

    // Логика отрисовки зеленой зоны
    if (game.direction === 'under') {
        // Победа если < Chance
        // Зеленая зона слева (0) до Chance
        fill.style.left = '0%';
        fill.style.width = game.chance + '%';
        fill.style.background = '#00ff88'; // Зеленый
    } else {
        // Победа если > (100 - Chance)
        // Зеленая зона справа. Ширина = Chance.
        // Left = 100 - Chance
        fill.style.left = (100 - game.chance) + '%';
        fill.style.width = game.chance + '%';
        fill.style.background = '#00ff88';
    }
}

// === 5. ИГРОВОЙ ПРОЦЕСС (ROLL) ===

function rollDice() {
    if (game.isRolling) return;

    // Проверка баланса
    const curr = appState.currency;
    const mode = appState.mode;
    if (appState.balance[curr][mode] < game.bet) {
        alert("Недостаточно средств!");
        return;
    }

    // Старт
    game.isRolling = true;
    appState.balance[curr][mode] -= game.bet;
    saveState();
    updateBalanceUI();

    // UI эффекты
    document.getElementById('roll-btn').style.opacity = '0.7';
    document.getElementById('result-status').innerText = "ROLLING...";
    document.getElementById('result-val').classList.remove('win', 'loss');
    document.getElementById('roll-marker').classList.add('hidden'); // Прячем маркер на время ролла
    
    audio.play('roll');
    tg.HapticFeedback.impactOccurred('medium');

    // Анимация чисел (Scramble)
    const resultEl = document.getElementById('result-val');
    const startTime = Date.now();
    
    const scrambleInt = setInterval(() => {
        const rnd = (Math.random() * 100).toFixed(2);
        resultEl.innerText = rnd;
    }, 50);

    // Завершение ролла через X мс
    setTimeout(() => {
        clearInterval(scrambleInt);
        finishRoll();
    }, CONFIG.scrambleDuration);
}

function finishRoll() {
    // Генерация результата (0.00 - 99.99)
    const result = (Math.random() * 100);
    const resultFixed = result.toFixed(2);
    
    document.getElementById('result-val').innerText = resultFixed;
    
    // Проверка победы
    let isWin = false;
    
    if (game.direction === 'under') {
        // Победа если результат < шанса
        if (result < game.chance) isWin = true;
    } else {
        // Победа если результат > (100 - шанса)
        // Пример: Шанс 80%. Победа > 20.
        const threshold = 100 - game.chance;
        if (result > threshold) isWin = true;
    }

    // Движение маркера
    moveMarker(result);

    // Обработка исхода
    if (isWin) {
        handleWin();
    } else {
        handleLoss();
    }

    game.isRolling = false;
    document.getElementById('roll-btn').style.opacity = '1';
}

function moveMarker(val) {
    const marker = document.getElementById('roll-marker');
    const markerVal = marker.querySelector('.marker-val');
    
    marker.classList.remove('hidden');
    marker.style.left = val + '%';
    markerVal.innerText = val.toFixed(2);
    
    // Цвет маркера зависит от попадания в зеленую зону, а не просто от победы
    // Но для простоты: если победа - маркер зеленый
}

function handleWin() {
    const winAmount = Math.floor(game.bet * game.multiplier);
    
    // Начисление
    const curr = appState.currency;
    const mode = appState.mode;
    appState.balance[curr][mode] += winAmount;
    saveState();
    updateBalanceUI();

    // UI
    document.getElementById('result-val').classList.add('win');
    document.getElementById('result-status').innerText = "YOU WON!";
    document.getElementById('result-status').style.color = "#00ff88";
    
    // Маркер
    document.querySelector('.marker-val').className = 'marker-val win';
    document.getElementById('roll-marker').className = 'roll-marker win';

    // Тост
    showToast(`+${winAmount}`);
    
    audio.play('win');
    tg.HapticFeedback.notificationOccurred('success');
}

function handleLoss() {
    // UI
    document.getElementById('result-val').classList.add('loss');
    document.getElementById('result-status').innerText = "BET LOST";
    document.getElementById('result-status').style.color = "#ff0055";

    // Маркер
    document.querySelector('.marker-val').className = 'marker-val loss';
    document.getElementById('roll-marker').className = 'roll-marker loss';

    audio.play('lose');
    tg.HapticFeedback.notificationOccurred('error');
}

// === 6. УПРАВЛЕНИЕ ===

function setupControls() {
    // Слайдер
    const slider = document.getElementById('dice-slider');
    
    slider.addEventListener('input', (e) => {
        game.chance = parseInt(e.target.value);
        updateGameMath();
        updateSliderVisuals();
        tg.HapticFeedback.selectionChanged();
    });

    // Направление (Under/Over)
    window.setDirection = (dir) => {
        if (game.isRolling) return;
        game.direction = dir;
        
        // UI кнопок
        document.getElementById('btn-under').classList.toggle('active', dir === 'under');
        document.getElementById('btn-over').classList.toggle('active', dir === 'over');
        
        updateSliderVisuals();
        tg.HapticFeedback.selectionChanged();
    };

    // Кнопка Ролл
    document.getElementById('roll-btn').addEventListener('click', rollDice);

    // Ставки
    window.setBet = (val, type) => {
        if (game.isRolling) return;
        
        if (val === 'max') game.bet = 5000;
        else if (type === 'mul') game.bet = Math.floor(game.bet * val);
        else game.bet = val;

        // Лимиты
        if (game.bet > 10000) game.bet = 10000;
        if (game.bet < 1) game.bet = 1;

        document.getElementById('bet-amount').innerText = game.bet;
        updateGameMath(); // Обновить потенциальный выигрыш
        tg.HapticFeedback.selectionChanged();
    };

    document.getElementById('btn-inc').addEventListener('click', () => {
        if (game.bet < 10000) { game.bet += 100; document.getElementById('bet-amount').innerText = game.bet; updateGameMath(); }
    });
    document.getElementById('btn-dec').addEventListener('click', () => {
        if (game.bet > 100) { game.bet -= 100; document.getElementById('bet-amount').innerText = game.bet; updateGameMath(); }
    });
}

// === 7. УТИЛИТЫ ===

function updateBalanceUI() {
    const curr = appState.currency;
    const mode = appState.mode;
    document.getElementById('balance-display').innerText = appState.balance[curr][mode].toLocaleString();
    document.getElementById('currency-display').innerText = getCurrSym();
    document.querySelector('.curr-s').innerText = getCurrSym();
}

function getCurrSym() { return { 'RUB': '₽', 'USDT': '$', 'STARS': '★' }[appState.currency] || ''; }

function saveState() {
    localStorage.setItem('fastMoneyState', JSON.stringify(appState));
}

function showToast(text) {
    const toast = document.getElementById('toast-win');
    document.getElementById('toast-val').innerText = text;
    toast.classList.remove('hidden');
    
    // Сброс анимации
    const card = toast.querySelector('.toast-card');
    card.style.animation = 'none';
    card.offsetHeight; /* reflow */
    card.style.animation = 'slideDown 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)';

    setTimeout(() => toast.classList.add('hidden'), 1500);
}

// Модалки
window.openInfoModal = () => document.getElementById('modal-info').classList.remove('hidden');
window.closeInfoModal = () => document.getElementById('modal-info').classList.add('hidden');

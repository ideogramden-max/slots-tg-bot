/**
 * FASTMONEY - SAFE CRACKING ENGINE
 * Geometry, Physics & Probability Logic
 */

const tg = window.Telegram.WebApp;

// === 1. КОНФИГУРАЦИЯ ===
const CONFIG = {
    houseEdge: 2, // 2% преимущество
    spinDuration: 3000, // 3 секунды
    pointerOffset: 0 // Корректировка угла (если стрелка сверху, это -90 или 270 град)
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
    isCracking: false,
    bet: 100,
    chance: 50,      // Шанс в %
    multiplier: 1.96,
    currentRotation: 0, // Накопленный угол
    zoneStartAngle: 0   // Где начинается зеленая зона (0-360)
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
    
    // Инициализация слайдера и диска
    updateMath();
    renderSafeZone();
});

// === 4. МАТЕМАТИКА И СЛАЙДЕР ===

function updateMath() {
    // 1. Ограничиваем шанс
    if (game.chance < 10) game.chance = 10;
    if (game.chance > 90) game.chance = 90;

    // 2. Множитель: (100 - Edge) / Chance
    let mult = (100 - CONFIG.houseEdge) / game.chance;
    if (mult < 1.01) mult = 1.01;
    game.multiplier = mult;

    // 3. Потенциальный выигрыш
    const winVal = Math.floor(game.bet * game.multiplier);

    // 4. UI
    document.getElementById('chance-val').innerText = game.chance + '%';
    document.getElementById('potential-win').innerText = `Выигрыш: ${winVal} ${getCurrSym()}`;
    document.getElementById('current-mult').innerText = 'x' + game.multiplier.toFixed(2);
    
    // Обновляем визуальную зону на диске
    renderSafeZone();
}

function renderSafeZone() {
    // Рисуем зеленую зону с помощью conic-gradient
    const sector = document.getElementById('win-sector');
    const degrees = (game.chance / 100) * 360;
    
    // Градиент: Зеленый от 0 до degrees, прозрачный дальше
    // Мы вращаем сам элемент div, чтобы менять позицию зоны
    sector.style.background = `conic-gradient(#00ff88 ${degrees}deg, transparent 0deg)`;
    
    // Поворачиваем зону на случайный угол (или сохраненный), чтобы она не всегда была сверху
    // Но пока мы не играем, пусть стоит ровно или как в прошлом раунде
    sector.style.transform = `rotate(${game.zoneStartAngle}deg)`;
}

// === 5. ИГРОВОЙ ПРОЦЕСС ===

function crackSafe() {
    if (game.isCracking) return;

    // Проверка баланса
    const curr = appState.currency;
    const mode = appState.mode;
    if (appState.balance[curr][mode] < game.bet) {
        alert("Недостаточно средств!");
        return;
    }

    // Старт
    game.isCracking = true;
    appState.balance[curr][mode] -= game.bet;
    saveState();
    updateBalanceUI();

    // UI
    document.getElementById('crack-btn').style.opacity = '0.5';
    document.getElementById('lock-status').innerText = "CRACKING...";
    document.getElementById('lock-status').style.color = "#ffd700";
    document.getElementById('difficulty-slider').disabled = true;

    // 1. Генерируем новую позицию зеленой зоны (чтобы было честно и визуально менялось)
    // Зона шириной game.chance (в градусах)
    const zoneWidth = (game.chance / 100) * 360;
    game.zoneStartAngle = Math.floor(Math.random() * 360);
    const zoneEndAngle = game.zoneStartAngle + zoneWidth;
    
    // Применяем позицию зоны (визуально диск обновится)
    const sector = document.getElementById('win-sector');
    sector.style.transition = 'none'; // Мгновенно перемещаем зону перед вращением
    sector.style.transform = `rotate(${game.zoneStartAngle}deg)`;

    // 2. Определяем результат (Win/Loss)
    const isWin = Math.random() * 100 < game.chance;

    // 3. Вычисляем угол остановки ДИСКА
    // Диск вращается. Стрелка (поинтер) стоит на месте (СВЕРХУ, т.е. 0 градусов в CSS rotation, но это 12 часов).
    // В CSS conic-gradient 0deg - это 12 часов.
    // Значит, если мы хотим попасть в зону, нам нужно повернуть диск так, чтобы
    // сектор [start...end] оказался под стрелкой (0deg).
    
    // Угол на диске, который окажется под стрелкой.
    let targetAngleOnDisk;
    
    if (isWin) {
        // Выбираем случайную точку ВНУТРИ зоны
        // normalized relative to zone start
        const offset = Math.random() * zoneWidth; 
        // Абсолютный угол на диске
        targetAngleOnDisk = (game.zoneStartAngle + offset) % 360;
    } else {
        // Выбираем случайную точку СНАРУЖИ зоны
        const safeZoneSize = zoneWidth;
        const dangerZoneSize = 360 - safeZoneSize;
        const offset = Math.random() * dangerZoneSize;
        // Start angle of danger zone is end of safe zone
        targetAngleOnDisk = (zoneEndAngle + offset) % 360;
    }

    // 4. Вращаем диск
    // Чтобы точка X на диске оказалась сверху (0deg), нужно повернуть диск на -X.
    // Добавляем полные обороты для эффекта.
    const spins = 5 + Math.floor(Math.random() * 3);
    const totalDegrees = (spins * 360) + (360 - targetAngleOnDisk);
    
    // Добавляем к текущему, чтобы вращение было плавным и вперед
    // (Округляем текущее до 360, чтобы не накапливать дроби)
    const currentMod = game.currentRotation % 360;
    const dist = totalDegrees - currentMod; // Сколько докрутить
    // Чтобы всегда крутилось по часовой, dist должен быть положительным
    // Но CSS rotate - это просто число.
    // Проще: NewRotation = Current + (360 * 5) - (AngleDiff)
    // AngleDiff: где сейчас стрелка (относительно 0 диска) -> куда надо.
    
    // Простая логика:
    // targetRotation = game.currentRotation + (360 * 5) + (angle needed to align);
    // Это сложно. Проще так:
    // Мы хотим, чтобы диск повернулся так, что (Rotation % 360) == (360 - targetAngleOnDisk).
    // TargetVisualRotation = (360 - targetAngleOnDisk).
    
    const targetVisualRotation = (360 - targetAngleOnDisk);
    // Ближайшее вращение вперед:
    let nextRotation = game.currentRotation + (360 * 5); // минимум 5 оборотов
    const remainder = nextRotation % 360;
    const adjustment = targetVisualRotation - remainder;
    
    // Если adjustment < 0, мы добавляем 360, чтобы крутить вперед?
    // Нет, просто прибавляем adjustment (он выровняет нас на target).
    // Если adjustment отрицательный, мы чуть откатимся назад, это плохо.
    // Сделаем так:
    nextRotation += adjustment;
    if (nextRotation < game.currentRotation + 360 * 3) nextRotation += 360; // Гарантия оборотов

    game.currentRotation = nextRotation;

    // ЗАПУСК ВРАЩЕНИЯ
    const wheel = document.getElementById('dial-wheel');
    wheel.style.transition = `transform ${CONFIG.spinDuration}ms cubic-bezier(0.15, 0.9, 0.2, 1)`;
    wheel.style.transform = `rotate(${game.currentRotation}deg)`;
    
    audio.play('spin');
    tg.HapticFeedback.impactOccurred('medium');
    generateSparks();

    // Ждем конца
    setTimeout(() => {
        handleResult(isWin);
    }, CONFIG.spinDuration);
}

function handleResult(isWin) {
    game.isCracking = false;
    document.getElementById('crack-btn').style.opacity = '1';
    document.getElementById('difficulty-slider').disabled = false;

    if (isWin) {
        // --- ПОБЕДА ---
        audio.play('click'); // Щелчок замка
        setTimeout(() => audio.play('win'), 200);
        
        document.getElementById('lock-status').innerText = "UNLOCKED";
        document.getElementById('lock-status').style.color = "#00ff88";
        
        tg.HapticFeedback.notificationOccurred('success');

        const winAmount = Math.floor(game.bet * game.multiplier);
        
        // Начисление
        const curr = appState.currency;
        const mode = appState.mode;
        appState.balance[curr][mode] += winAmount;
        saveState();
        updateBalanceUI();

        showWinModal(winAmount);

    } else {
        // --- ПОРАЖЕНИЕ ---
        audio.play('alarm');
        document.getElementById('lock-status').innerText = "FAILED";
        document.getElementById('lock-status').style.color = "#ff0055";
        
        tg.HapticFeedback.notificationOccurred('error');
        
        document.getElementById('modal-loss').classList.remove('hidden');
    }
}

// Эффект искр
function generateSparks() {
    const container = document.getElementById('sparks');
    // Можно добавить простой CSS/JS эмиттер, если нужно
    // В данной версии оставим пустым для производительности, 
    // либо добавим пару div-ов анимации
}

// === 6. УПРАВЛЕНИЕ ===

function setupControls() {
    // Слайдер
    const slider = document.getElementById('difficulty-slider');
    slider.addEventListener('input', (e) => {
        if (game.isCracking) return;
        game.chance = parseInt(e.target.value);
        updateMath();
        tg.HapticFeedback.selectionChanged();
    });

    // Кнопка
    document.getElementById('crack-btn').addEventListener('click', crackSafe);

    // Ставки
    window.setBet = (val) => {
        if (game.isCracking) return;
        if (val === 'max') game.bet = 10000;
        else game.bet = val;
        document.getElementById('bet-amount').innerText = game.bet;
        updateMath();
        tg.HapticFeedback.selectionChanged();
    };

    document.getElementById('btn-inc').addEventListener('click', () => {
        if (game.bet < 10000) { game.bet += 100; document.getElementById('bet-amount').innerText = game.bet; updateMath(); }
    });
    document.getElementById('btn-dec').addEventListener('click', () => {
        if (game.bet > 100) { game.bet -= 100; document.getElementById('bet-amount').innerText = game.bet; updateMath(); }
    });
}

// === 7. УТИЛИТЫ ===

function updateBalanceUI() {
    const curr = appState.currency;
    const mode = appState.mode;
    document.getElementById('balance-display').innerText = appState.balance[curr][mode].toLocaleString();
    document.getElementById('currency-display').innerText = getCurrSym();
}
function getCurrSym() { return { 'RUB': '₽', 'USDT': '$', 'STARS': '★' }[appState.currency] || ''; }
function saveState() { localStorage.setItem('fastMoneyState', JSON.stringify(appState)); }

// Модалки
function showWinModal(amount) {
    document.getElementById('win-amount').innerText = amount.toLocaleString();
    document.getElementById('win-currency').innerText = getCurrSym();
    document.getElementById('modal-win').classList.remove('hidden');
}

window.closeWinModal = () => document.getElementById('modal-win').classList.add('hidden');
window.closeLossModal = () => document.getElementById('modal-loss').classList.add('hidden');
window.openInfoModal = () => document.getElementById('modal-info').classList.remove('hidden');
window.closeInfoModal = () => document.getElementById('modal-info').classList.add('hidden');

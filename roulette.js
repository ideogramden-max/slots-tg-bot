/**
 * FASTMONEY - RUSSIAN ROULETTE ENGINE
 * Survival logic, probability math & cylinder animation
 */

const tg = window.Telegram.WebApp;

// === 1. ГЛОБАЛЬНЫЕ НАСТРОЙКИ ===
const CONFIG = {
    totalChambers: 6,
    houseEdge: 0.98, // 2% комиссия
    spinDuration: 3000 // 3 секунды крутится
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
    isSpinning: false,
    bet: 100,
    bullets: 1,      // Кол-во патронов (1-5)
    currentRotation: 0, // Текущий угол поворота (чтобы крутить дальше, а не сбрасывать)
    multiplier: 1.18,
    survivalChance: 83.3
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
    updateMath();      // Расчет шансов
    renderBullets();   // Отрисовка патронов в барабане
    
    // Бинды
    setupControls();
});

// === 4. ЛОГИКА ИГРЫ ===

function shoot() {
    if (game.isSpinning) return;

    // Проверка баланса
    const curr = appState.currency;
    const mode = appState.mode;
    if (appState.balance[curr][mode] < game.bet) {
        alert("Недостаточно средств!");
        return;
    }

    // Старт
    game.isSpinning = true;
    appState.balance[curr][mode] -= game.bet;
    saveState();
    updateBalanceUI();

    // UI
    document.getElementById('shoot-btn').style.opacity = '0.7';
    document.getElementById('shoot-btn').disabled = true;
    document.getElementById('game-status').innerText = "БАРАБАН КРУТИТСЯ...";
    document.getElementById('blood-overlay').classList.add('hidden'); // Убираем кровь если была

    // Звук раскрутки
    audio.play('spin');
    tg.HapticFeedback.impactOccurred('medium');

    // ОПРЕДЕЛЕНИЕ РЕЗУЛЬТАТА (0..5)
    // Допустим, патроны лежат в камерах от 0 до (bullets-1).
    // Если выпадает число < bullets — это СМЕРТЬ.
    // Если число >= bullets — это ВЫЖИВАНИЕ.
    
    const outcomeIndex = Math.floor(Math.random() * CONFIG.totalChambers);
    const isDead = outcomeIndex < game.bullets;

    // Анимация вращения
    spinCylinder(outcomeIndex, isDead);
}

function spinCylinder(targetIndex, isDead) {
    const cylinder = document.getElementById('cylinder');
    
    // Рассчитываем угол. 
    // Каждая камера занимает 60 градусов (360/6).
    // Мы хотим, чтобы targetIndex оказался НАВЕРХУ (под стрелкой).
    // Для этого нужно повернуть барабан так, чтобы этот индекс стал в 0 градусов (или -360).
    // Учитываем текущее вращение, чтобы крутилось всегда в одну сторону (против часовой стрелки, например).
    
    const chamberAngle = 60;
    const extraSpins = 5; // Сколько полных оборотов сделать (для эффекта)
    
    // Формула: Текущий угол - (Обороты * 360) - (ЦелевойИндекс * 60)
    // Вычитаем, чтобы крутилось влево (или прибавляем для вправо).
    // targetIndex * 60 — это где находится камера. Нам нужно сместить её в 0.
    
    // Немного рандома внутри камеры (+-2 градуса), чтобы не всегда идеально ровно
    const jitter = Math.random() * 4 - 2;
    
    const targetRotation = game.currentRotation - (360 * extraSpins) - (targetIndex * chamberAngle) + jitter;
    
    // Применяем CSS
    cylinder.style.transition = `transform ${CONFIG.spinDuration}ms cubic-bezier(0.15, 0.8, 0.2, 1)`;
    cylinder.style.transform = `rotate(${targetRotation}deg)`;
    
    // Обновляем глобальную переменную, чтобы следующий спин продолжался отсюда
    // Но для корректности математики, нам нужно будет "нормализовать" угол для следующего расчета
    // (впрочем, CSS transition работает с абсолютными числами, так что просто копим минус)
    game.currentRotation = targetRotation - (targetRotation % 360); // Выравниваем для следующего раза (опционально)

    // Ожидание конца анимации
    setTimeout(() => {
        handleResult(isDead);
    }, CONFIG.spinDuration);
}

function handleResult(isDead) {
    game.isSpinning = false;
    document.getElementById('shoot-btn').style.opacity = '1';
    document.getElementById('shoot-btn').disabled = false;

    if (isDead) {
        // --- ПРОИГРЫШ ---
        audio.play('bang'); // ВЫСТРЕЛ
        tg.HapticFeedback.notificationOccurred('error');
        
        // КРОВЬ
        document.getElementById('blood-overlay').classList.remove('hidden');
        document.getElementById('game-status').innerText = "ВЫСТРЕЛ! ☠️";
        
        // Модалка
        setTimeout(() => {
            document.getElementById('modal-loss').classList.remove('hidden');
        }, 500);

    } else {
        // --- ПОБЕДА ---
        audio.play('click'); // ЩЕЛЧОК (осечка)
        tg.HapticFeedback.notificationOccurred('success');
        document.getElementById('game-status').innerText = "ЩЕЛЧОК... ЖИВ! 😅";

        // Расчет денег
        const winAmount = Math.floor(game.bet * game.multiplier);
        
        const curr = appState.currency;
        const mode = appState.mode;
        appState.balance[curr][mode] += winAmount;
        saveState();
        updateBalanceUI();

        // Модалка
        showWinModal(winAmount);
        audio.play('win');
    }
}

// === 5. МАТЕМАТИКА И ВИЗУАЛ ===

function setBullets(count) {
    if (game.isSpinning) return;
    
    game.bullets = count;
    
    // UI Кнопок
    document.querySelectorAll('.b-opt').forEach(btn => btn.classList.remove('active'));
    // Активируем нужную (индекс count-1)
    document.querySelectorAll('.b-opt')[count - 1].classList.add('active');
    
    updateMath();
    renderBullets();
    tg.HapticFeedback.selectionChanged();
}

function updateMath() {
    // Шанс выжить: (6 - bullets) / 6
    const safeChambers = CONFIG.totalChambers - game.bullets;
    const chance = safeChambers / CONFIG.totalChambers;
    
    game.survivalChance = (chance * 100).toFixed(1);
    
    // Множитель: (1 / chance) * HouseEdge
    // Пример: 1 патрон (5/6 safe) -> 1.2 * 0.98 = 1.176
    let mult = (1 / chance) * CONFIG.houseEdge;
    if (mult < 1.01) mult = 1.01;
    game.multiplier = mult.toFixed(2);
    
    // Обновляем текст
    document.getElementById('current-mult').innerText = game.multiplier + 'x';
    document.getElementById('survival-chance').innerText = game.survivalChance + '%';
    
    // Цвет шанса
    const chanceEl = document.getElementById('survival-chance');
    if (game.survivalChance > 60) chanceEl.style.color = '#00ff88';
    else if (game.survivalChance > 30) chanceEl.style.color = '#f1c40f';
    else chanceEl.style.color = '#ff0055';
}

function renderBullets() {
    // Показываем патроны в камерах c1...c6
    // Если bullets=2, то показываем в камере 1 и 2 (индексы 0 и 1)
    
    const holes = document.querySelectorAll('.bullet-hole');
    
    holes.forEach((hole, index) => {
        if (index < game.bullets) {
            hole.classList.remove('hidden');
        } else {
            hole.classList.add('hidden');
        }
    });
}

// === 6. УПРАВЛЕНИЕ СТАВКАМИ ===

function setupControls() {
    // Кнопка Выстрел
    document.getElementById('shoot-btn').addEventListener('click', shoot);

    // Ставки
    window.setBet = (val) => {
        if (game.isSpinning) return;
        if (val === 'max') game.bet = 10000;
        else game.bet = val;
        document.getElementById('bet-amount').innerText = game.bet;
        tg.HapticFeedback.selectionChanged();
    };

    document.getElementById('btn-inc').addEventListener('click', () => {
        if (game.bet < 50000) game.bet += 100;
        document.getElementById('bet-amount').innerText = game.bet;
    });
    document.getElementById('btn-dec').addEventListener('click', () => {
        if (game.bet > 100) game.bet -= 100;
        document.getElementById('bet-amount').innerText = game.bet;
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
window.closeLossModal = () => {
    document.getElementById('modal-loss').classList.add('hidden');
    document.getElementById('blood-overlay').classList.add('hidden'); // Убираем кровь при закрытии
};
window.openInfoModal = () => document.getElementById('modal-info').classList.remove('hidden');
window.closeInfoModal = () => document.getElementById('modal-info').classList.add('hidden');

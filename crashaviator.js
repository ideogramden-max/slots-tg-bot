/**
 * FASTMONEY - CRASH ENGINE (AVIATOR STYLE)
 * Real-time canvas rendering & game logic
 */

const tg = window.Telegram.WebApp;

// === 1. ГЛОБАЛЬНЫЕ НАСТРОЙКИ ===
const CONFIG = {
    minBet: 100,
    maxBet: 10000,
    growthSpeed: 0.0006, // Скорость роста кривой
    updateInterval: 16,  // ~60 FPS
};

// === 2. СОСТОЯНИЕ (STATE) ===

// Глобальное (Баланс)
let appState = JSON.parse(localStorage.getItem('fastMoneyState')) || {
    balance: { RUB: { real: 0, demo: 10000 }, USDT: { real: 0, demo: 1000 } },
    currency: 'USDT',
    mode: 'demo'
};

// Локальное состояние игры
let game = {
    status: 'IDLE', // IDLE, BETTING, FLYING, CRASHED
    multiplier: 1.00,
    crashPoint: 0,
    startTime: 0,
    betAmount: 100,
    userHasBet: false,
    userCashedOut: false,
    history: []
};

// === 3. CANVAS ENGINE (ГРАФИКА) ===
const canvas = document.getElementById('crash-canvas');
const ctx = canvas.getContext('2d');
let animationFrameId;

// Настройка размеров Canvas (Retina ready)
function resizeCanvas() {
    const container = document.querySelector('.graph-container');
    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    
    ctx.scale(dpr, dpr);
    
    // Сохраняем логические размеры для расчетов
    game.width = rect.width;
    game.height = rect.height;
}

// Отрисовка кадра
function drawFrame() {
    if (game.status !== 'FLYING' && game.status !== 'CRASHED') return;

    // Очистка
    ctx.clearRect(0, 0, game.width, game.height);

    // Вычисляем время полета
    const elapsed = Date.now() - game.startTime;
    
    // Масштабирование (Zoom Out), если множитель большой
    // Чем больше время, тем больше масштаб "сжимает" график
    let scaleX = 1;
    let scaleY = 1;
    
    if (elapsed > 4000) {
        const factor = elapsed / 4000;
        scaleX = 1 / Math.pow(factor, 0.5);
        scaleY = 1 / Math.pow(factor, 0.7);
    }

    // Рисуем кривую
    ctx.beginPath();
    ctx.moveTo(0, game.height);
    
    // Рисуем точки графика
    // Формула: x = t, y = t^2 (упрощенно)
    const steps = 50;
    let currentX = 0;
    let currentY = game.height;

    for (let t = 0; t <= elapsed; t += elapsed / steps) {
        const x = (t / 5000) * game.width * 0.8 * scaleX; // 5 сек до края по X
        
        // Экспоненциальный рост Y
        const growth = (Math.exp(t * CONFIG.growthSpeed) - 1);
        const y = game.height - (growth * 100 * scaleY);

        ctx.lineTo(x, y);
        
        // Запоминаем последнюю точку для ракеты
        if (t + (elapsed/steps) > elapsed) {
            currentX = x;
            currentY = y;
        }
    }

    ctx.lineWidth = 4;
    ctx.strokeStyle = '#00f3ff'; // Неоновый голубой
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#00f3ff';
    ctx.stroke();
    ctx.shadowBlur = 0; // Сброс тени

    // Заливка под графиком
    ctx.lineTo(currentX, game.height);
    ctx.lineTo(0, game.height);
    ctx.fillStyle = 'rgba(0, 243, 255, 0.1)';
    ctx.fill();

    // Обновляем позицию ракеты (DOM элемент)
    updateRocketPosition(currentX, currentY);

    if (game.status === 'FLYING') {
        animationFrameId = requestAnimationFrame(drawFrame);
    }
}

function updateRocketPosition(x, y) {
    const rocket = document.getElementById('rocket-element');
    // Смещаем относительно контейнера
    // x и y - координаты внутри canvas (логические)
    
    // Ограничиваем, чтобы не улетела за экран (визуально)
    const safeX = Math.min(x, game.width - 40);
    const safeY = Math.max(y, 40);

    rocket.style.transform = `translate(${safeX}px, ${safeY - game.height}px)`; // -height т.к. CSS bottom:0
    
    // Поворот ракеты (вычисляем угол наклона)
    // Чем выше летит, тем вертикальнее (до 80 градусов)
    const angle = Math.min(15 + (game.multiplier * 5), 80);
    rocket.querySelector('i').style.transform = `rotate(${angle - 45}deg)`; // -45 т.к. иконка исходно 45
}

// === 4. ЛОГИКА ИГРЫ ===

// Генерация точки краша (Честная математика)
function generateCrashPoint() {
    // E = 0.99 / (1 - random)
    // Это стандартный алгоритм для Crash игр
    const r = Math.random();
    let crash = 0.99 / (1 - r);
    
    // Округляем до сотых
    crash = Math.floor(crash * 100) / 100;
    
    // Иногда крашится сразу (1.00x)
    if (crash < 1.01) crash = 1.00;
    
    // Ограничим макс выигрыш для демо (чтобы не сломать JS)
    if (crash > 100) crash = 100; 

    return crash;
}

// Старт раунда
function startRound() {
    if (game.status !== 'IDLE') return;
    
    // Списание ставки (если поставил)
    if (game.userHasBet) {
        const curr = appState.currency;
        const mode = appState.mode;
        if (appState.balance[curr][mode] < game.betAmount) {
            alert('Недостаточно средств!');
            game.userHasBet = false;
            updateButtonState();
            return;
        }
        appState.balance[curr][mode] -= game.betAmount;
        saveState();
        UI.updateBalance();
    }

    game.status = 'FLYING';
    game.crashPoint = generateCrashPoint();
    game.startTime = Date.now();
    game.multiplier = 1.00;
    game.userCashedOut = false;

    // UI обновления
    document.getElementById('game-message').classList.add('hidden');
    document.getElementById('crash-msg').classList.add('hidden');
    document.getElementById('current-multiplier').classList.remove('hidden');
    
    const rocket = document.getElementById('rocket-element');
    rocket.classList.remove('boom');
    rocket.classList.add('flying');

    updateButtonState();
    tg.HapticFeedback.impactOccurred('medium'); // Вибрация старта

    // Запуск цикла
    gameLoop();
    drawFrame();
}

// Основной цикл
function gameLoop() {
    if (game.status !== 'FLYING') return;

    const elapsed = Date.now() - game.startTime;
    
    // Рост множителя (Экспонента)
    // 1.00 -> ...
    game.multiplier = 1 + (Math.exp(elapsed * CONFIG.growthSpeed) - 1);
    
    // Обновляем текст
    document.getElementById('current-multiplier').innerText = game.multiplier.toFixed(2) + 'x';
    document.getElementById('current-multiplier').style.color = 'white';

    // Проверка краша
    if (game.multiplier >= game.crashPoint) {
        crash();
    } else {
        // Проверка авто-вывода (если бы он был)
        requestAnimationFrame(gameLoop);
    }
}

// Краш (Конец раунда)
function crash() {
    game.status = 'CRASHED';
    cancelAnimationFrame(animationFrameId);

    // UI Эффекты
    document.getElementById('current-multiplier').style.color = '#ff0055';
    document.getElementById('crash-msg').classList.remove('hidden');
    document.getElementById('game-message').classList.add('hidden');

    const rocket = document.getElementById('rocket-element');
    rocket.classList.remove('flying');
    rocket.classList.add('boom'); // Взрыв
    rocket.innerHTML = '<i class="fa-solid fa-burst"></i>'; // Иконка взрыва

    // Звук
    tg.HapticFeedback.notificationOccurred('error');

    // Добавляем в историю
    addToHistory(game.crashPoint);

    // Сброс кнопки
    updateButtonState();

    // Авто-рестарт через 3 сек
    setTimeout(resetGame, 3000);
}

// Сброс к началу
function resetGame() {
    game.status = 'IDLE';
    
    // Сброс UI
    document.getElementById('rocket-element').innerHTML = '<i class="fa-solid fa-jet-fighter-up"></i><div class="rocket-trail"></div>';
    document.getElementById('rocket-element').classList.remove('boom');
    document.getElementById('rocket-element').style.transform = 'translate(10px, 0)';
    
    document.getElementById('crash-msg').classList.add('hidden');
    document.getElementById('game-message').innerText = "ОЖИДАНИЕ...";
    document.getElementById('game-message').classList.remove('hidden');
    document.getElementById('current-multiplier').innerText = "1.00x";
    
    ctx.clearRect(0, 0, game.width, game.height);
    
    // Если пользователь ставил, нужно сбросить флаг для следующего раунда,
    // НО если он хочет авто-ставку, можно оставить. 
    // Для демо сбрасываем ставку.
    game.userHasBet = false;
    updateButtonState();

    // Запуск таймера нового раунда
    let countdown = 3;
    const interval = setInterval(() => {
        document.getElementById('game-message').innerText = `СТАРТ ЧЕРЕЗ ${countdown}...`;
        countdown--;
        if (countdown < 0) {
            clearInterval(interval);
            startRound();
        }
    }, 1000);
}

// Забрать выигрыш
function cashOut() {
    if (game.status !== 'FLYING' || !game.userHasBet || game.userCashedOut) return;

    game.userCashedOut = true;
    const winAmount = Math.floor(game.betAmount * game.multiplier);
    
    // Начисление
    const curr = appState.currency;
    const mode = appState.mode;
    appState.balance[curr][mode] += winAmount;
    saveState();
    UI.updateBalance();

    // UI
    updateButtonState();
    showWinToast(winAmount);
    
    // Звук
    tg.HapticFeedback.notificationOccurred('success');
}

// === 5. UI КОНТРОЛЛЕР ===
const UI = {
    balance: document.getElementById('balance-display'),
    currency: document.getElementById('currency-display'),
    
    updateBalance() {
        const curr = appState.currency;
        const mode = appState.mode;
        const symMap = { 'RUB': '₽', 'USDT': '$', 'STARS': '★' };
        
        this.balance.innerText = appState.balance[curr][mode].toLocaleString();
        this.currency.innerText = symMap[curr];
    }
};

function updateButtonState() {
    const btn = document.getElementById('main-btn');
    const title = btn.querySelector('.btn-title');
    const sub = btn.querySelector('.btn-sub');

    // Сброс классов
    btn.className = 'action-button';

    if (game.status === 'IDLE') {
        if (game.userHasBet) {
            btn.classList.add('btn-cancel');
            title.innerText = "ОТМЕНИТЬ";
            sub.innerText = "Ожидание старта...";
        } else {
            btn.classList.add('btn-bet');
            title.innerText = "ПОСТАВИТЬ";
            sub.innerText = "На следующий раунд";
        }
    } else if (game.status === 'FLYING') {
        if (game.userHasBet && !game.userCashedOut) {
            btn.classList.add('btn-cashout');
            title.innerText = "ЗАБРАТЬ";
            // Показываем текущий выигрыш на кнопке
            const currentWin = Math.floor(game.betAmount * game.multiplier);
            sub.innerText = `+${currentWin}`; 
        } else if (game.userCashedOut) {
            btn.classList.add('btn-bet'); // Блокирована визуально
            btn.style.opacity = '0.5';
            title.innerText = "ВЫВЕДЕНО";
            sub.innerText = "Ждите конца раунда";
        } else {
            btn.classList.add('btn-bet');
            btn.style.opacity = '0.5';
            title.innerText = "ИДЕТ ИГРА";
            sub.innerText = "Ждите новый раунд";
        }
    } else if (game.status === 'CRASHED') {
         btn.classList.add('btn-bet');
         btn.style.opacity = '0.5';
         title.innerText = "КРАШ";
         sub.innerText = "Раунд окончен";
    }
}

// Логика кнопки
document.getElementById('main-btn').addEventListener('click', () => {
    tg.HapticFeedback.selectionChanged();

    if (game.status === 'IDLE') {
        // Тогл ставки
        game.userHasBet = !game.userHasBet;
        updateButtonState();
    } else if (game.status === 'FLYING') {
        // Вывод
        if (game.userHasBet && !game.userCashedOut) {
            cashOut();
        }
    }
});

// Ставки
window.setBet = (val) => {
    if (val === 'max') game.betAmount = 5000;
    else game.betAmount = val;
    document.getElementById('bet-amount').innerText = game.betAmount;
    tg.HapticFeedback.selectionChanged();
};

document.getElementById('btn-inc').addEventListener('click', () => {
    if (game.betAmount < 10000) game.betAmount += 100;
    document.getElementById('bet-amount').innerText = game.betAmount;
});
document.getElementById('btn-dec').addEventListener('click', () => {
    if (game.betAmount > 100) game.betAmount -= 100;
    document.getElementById('bet-amount').innerText = game.betAmount;
});

// История
function addToHistory(multiplier) {
    const container = document.getElementById('history-container');
    const div = document.createElement('div');
    
    let colorClass = 'blue';
    if (multiplier < 1.10) colorClass = 'red';
    else if (multiplier >= 2.00 && multiplier < 10) colorClass = 'green';
    else if (multiplier >= 10.00) colorClass = 'gold';

    div.className = `badge ${colorClass}`;
    div.innerText = multiplier.toFixed(2) + 'x';
    
    container.prepend(div); // Добавляем в начало
    
    // Удаляем старые, если больше 20
    if (container.children.length > 20) {
        container.removeChild(container.lastChild);
    }
}

function showWinToast(amount) {
    const toast = document.getElementById('modal-win');
    document.getElementById('win-display-amount').innerText = amount.toLocaleString();
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 2000);
}

// === 6. UTILS ===
function saveState() {
    localStorage.setItem('fastMoneyState', JSON.stringify(appState));
}

// Управление модалками
window.openInfoModal = () => document.getElementById('modal-info').classList.remove('hidden');
window.closeInfoModal = () => document.getElementById('modal-info').classList.add('hidden');

// === 7. INIT ===
document.addEventListener('DOMContentLoaded', () => {
    tg.ready();
    tg.expand();
    
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    
    UI.updateBalance();
    
    // Генерируем фейковую историю
    for(let i=0; i<10; i++) addToHistory(generateCrashPoint());
    
    // Запускаем первый цикл подготовки
    resetGame();
});

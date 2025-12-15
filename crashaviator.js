/**
 * FASTMONEY - CRASH ENGINE (Client-Server Version)
 * Frontend connects to Python Backend via API
 */

const tg = window.Telegram.WebApp;

// === 1. КОНФИГУРАЦИЯ (SETTINGS) ===
const CONFIG = {
    // --- СЕТЬ И СЕРВЕР ---
    // Твоя вечная ссылка на бэкенд (Cloudflare Tunnel)
    SERVER_URL: "https://alpha-firms-electronics-return.trycloudflare.com",
    
    // Частота опроса сервера (Polling) в миллисекундах
    // Чем меньше, тем точнее синхронизация, но выше нагрузка
    pollInterval: 1000, 

    // --- ФИЗИКА И МАТЕМАТИКА ---
    // Скорость роста графика (Экспонента). 
    // ВАЖНО: Должна строго совпадать с GROWTH_SPEED в Python (crashaviator.py)
    growthSpeed: 0.0006, 
    
    // Максимальное время полета для масштабирования графика (в мс)
    // После этого времени график начинает "сжиматься" (Zoom Out)
    zoomThreshold: 4000,

    // --- ЛИМИТЫ СТАВОК (Client Side Validation) ---
    betting: {
        min: 100,           // Минимальная ставка
        max: 500000,        // Максимальная ставка
        default: 100,       // Ставка по умолчанию
        maxWin: 10000000    // Максимальный выигрыш (визуальное ограничение)
    },

    // --- ВИЗУАЛЬНЫЕ НАСТРОЙКИ (CANVAS) ---
    graphics: {
        fps: 60,                // Целевой FPS анимации
        lineWidth: 4,           // Толщина линии графика
        lineColor: '#00f3ff',   // Цвет линии (Неоновый голубой)
        lineShadow: '#00f3ff',  // Цвет свечения линии
        lineShadowBlur: 15,     // Сила свечения
        
        fillColor: 'rgba(0, 243, 255, 0.1)', // Цвет заливки под графиком
        
        // Цвета текста множителя в центре
        textColorFlying: '#ffffff',
        textColorCashed: '#00ff88', // Зеленый (когда забрал)
        textColorCrash: '#ff0055',  // Красный (при краше)
        
        // Сетка координат
        gridColor: 'rgba(255, 255, 255, 0.05)',
        showGrid: true
    },

    // --- ТАЙМИНГИ И ЗАДЕРЖКИ ---
    timings: {
        resetDelay: 3000,       // Сколько висит надпись CRASHED до перезапуска (мс)
        animationDuration: 16,  // ~60 FPS (1000ms / 60)
        toastDuration: 2000     // Сколько висит уведомление о выигрыше
    },

    // --- ОТЛАДКА ---
    debug: false // Включить логи в консоль браузера
};

// === 2. СОСТОЯНИЕ (STATE) ===

// Загружаем глобальное состояние приложения
let appState = JSON.parse(localStorage.getItem('fastMoneyState')) || {
    balance: { RUB: { real: 0, demo: 10000 }, USDT: { real: 0, demo: 1000 } },
    currency: 'USDT',
    mode: 'demo'
};

let game = {
    status: 'IDLE', // IDLE, WAITING_SERVER, FLYING, CRASHED, CASHED_OUT
    multiplier: 1.00,
    startTime: 0,
    betAmount: 100,
    pollInterval: null, // Интервал проверки статуса
    width: 0,
    height: 0
};

// === 3. CANVAS ENGINE (ГРАФИКА) ===
const canvas = document.getElementById('crash-canvas');
const ctx = canvas.getContext('2d');
let animationFrameId;

function resizeCanvas() {
    const container = document.querySelector('.graph-container');
    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    
    game.width = rect.width;
    game.height = rect.height;
}

function drawFrame() {
    if (game.status !== 'FLYING' && game.status !== 'CRASHED' && game.status !== 'CASHED_OUT') return;

    ctx.clearRect(0, 0, game.width, game.height);

    // Считаем время от старта сервера
    const elapsed = Date.now() - game.startTime;
    
    // Масштабирование графика (Zoom Out)
    let scaleX = 1;
    let scaleY = 1;
    if (elapsed > 4000) {
        const factor = elapsed / 4000;
        scaleX = 1 / Math.pow(factor, 0.5);
        scaleY = 1 / Math.pow(factor, 0.7);
    }

    ctx.beginPath();
    ctx.moveTo(0, game.height);
    
    const steps = 50;
    let currentX = 0;
    let currentY = game.height;

    for (let t = 0; t <= elapsed; t += elapsed / steps) {
        const x = (t / 5000) * game.width * 0.8 * scaleX; 
        const growth = (Math.exp(t * CONFIG.growthSpeed) - 1);
        const y = game.height - (growth * 100 * scaleY);
        ctx.lineTo(x, y);
        if (t + (elapsed/steps) > elapsed) { currentX = x; currentY = y; }
    }

    ctx.lineWidth = 4;
    ctx.strokeStyle = '#00f3ff';
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#00f3ff';
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.lineTo(currentX, game.height);
    ctx.lineTo(0, game.height);
    ctx.fillStyle = 'rgba(0, 243, 255, 0.1)';
    ctx.fill();

    updateRocketPosition(currentX, currentY);

    if (game.status === 'FLYING' || game.status === 'CASHED_OUT') {
        animationFrameId = requestAnimationFrame(drawFrame);
    }
}

function updateRocketPosition(x, y) {
    const rocket = document.getElementById('rocket-element');
    const safeX = Math.min(x, game.width - 40);
    const safeY = Math.max(y, 40);
    rocket.style.transform = `translate(${safeX}px, ${safeY - game.height}px)`;
    
    const angle = Math.min(15 + (game.multiplier * 5), 80);
    rocket.querySelector('i').style.transform = `rotate(${angle - 45}deg)`;
}

// === 4. ЛОГИКА ИГРЫ (API) ===

// 1. СТАРТ РАУНДА (Запрос к серверу)
async function startRound() {
    if (game.status !== 'IDLE') return;
    
    const userId = tg.initDataUnsafe.user ? tg.initDataUnsafe.user.id : 0;
    
    // Если запускаем не из Телеграм (для тестов в браузере), можно раскомментировать:
    // const userId = 12345678; 

    if (!userId) { alert("Запустите через Telegram"); return; }

    game.status = 'WAITING_SERVER';
    updateButtonState();

    try {
        const response = await fetch(`${CONFIG.SERVER_URL}/api/crash/bet`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                user_id: userId, 
                amount: game.betAmount,
                mode: appState.mode // Отправляем текущий режим (real/demo)
            })
        });
        
        const data = await response.json();

        if (data.error) {
            // Красивый алерт для ошибки баланса
            if (data.error === "Insufficient funds") {
                tg.showPopup({
                    title: 'Ошибка',
                    message: 'Недостаточно средств на балансе!',
                    buttons: [{type: 'ok'}]
                });
            } else {
                alert("Ошибка: " + data.error);
            }
            resetGame();
            return;
        }

        // Успешный старт
        game.status = 'FLYING';
        // Python шлет timestamp в секундах (float), JS нужно мс
        game.startTime = data.server_time * 1000; 
        game.multiplier = 1.00;
        
        // Обновляем баланс UI сразу (сервер уже списал)
        updateBalanceUI(data.balance);

        // UI
        prepareUIForFlight();
        
        // Запуск циклов
        drawFrame();
        gameLoop();
        startStatusPolling(userId); // Следим, не крашнулось ли

    } catch (e) {
        console.error(e);
        // Если совсем нет связи
        tg.showPopup({title: 'Ошибка сети', message: 'Не удалось соединиться с сервером.'});
        resetGame();
    }
}

// 2. ЗАБРАТЬ ВЫИГРЫШ (CASHOUT)
async function cashOut() {
    if (game.status !== 'FLYING') return;
    
    // Блокируем кнопку, чтобы не нажать дважды
    const btn = document.getElementById('main-btn');
    btn.disabled = true;

    const userId = tg.initDataUnsafe.user ? tg.initDataUnsafe.user.id : 0;

    try {
        const response = await fetch(`${CONFIG.SERVER_URL}/api/crash/cashout`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId })
        });
        
        const data = await response.json();

        if (data.status === 'won') {
            // УСПЕХ
            game.status = 'CASHED_OUT'; 
            
            // Обновляем баланс (сервер прислал новый)
            if (data.balance !== undefined) {
                updateBalanceUI(data.balance);
            }
            
            finishGame(true, data.win_amount, data.multiplier);
            
        } else if (data.status === 'crashed') {
            // НЕ УСПЕЛ (Пинг или краш на сервере раньше)
            crash(data.crash_point);
        }

    } catch (e) {
        console.error(e);
        // Если ошибка сети при выводе, продолжаем поллинг, он скажет результат
    }
}

// 3. ПРОВЕРКА СТАТУСА (POLLING)
// Каждую секунду спрашиваем сервер: "Мы еще летим?"
function startStatusPolling(userId) {
    if (game.pollInterval) clearInterval(game.pollInterval);
    
    game.pollInterval = setInterval(async () => {
        if (game.status !== 'FLYING') {
            clearInterval(game.pollInterval);
            return;
        }

        try {
            const response = await fetch(`${CONFIG.SERVER_URL}/api/crash/status`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: userId })
            });
            const data = await response.json();

            if (data.status === 'crashed') {
                crash(data.crash_point);
            }
            // Если flying, всё ок, продолжаем

        } catch (e) { console.error("Poll error", e); }
    }, 1000);
}

// === 5. ВИЗУАЛЬНАЯ ЛОГИКА ===

function gameLoop() {
    if (game.status !== 'FLYING') return;

    const elapsed = Date.now() - game.startTime;
    game.multiplier = 1 + (Math.exp(elapsed * CONFIG.growthSpeed) - 1);
    
    // Обновляем текст
    document.getElementById('current-multiplier').innerText = game.multiplier.toFixed(2) + 'x';

    requestAnimationFrame(gameLoop);
}

function crash(finalMult) {
    game.status = 'CRASHED';
    clearInterval(game.pollInterval);
    cancelAnimationFrame(animationFrameId); // Стоп график

    // Показываем точную цифру краша от сервера
    document.getElementById('current-multiplier').innerText = finalMult.toFixed(2) + 'x';
    document.getElementById('current-multiplier').style.color = '#ff0055';
    
    // UI
    document.getElementById('crash-msg').classList.remove('hidden');
    document.getElementById('rocket-element').classList.add('boom');
    document.getElementById('rocket-element').innerHTML = '<i class="fa-solid fa-burst"></i>';
    
    tg.HapticFeedback.notificationOccurred('error');
    addToHistory(finalMult);
    updateButtonState();

    setTimeout(resetGame, 3000);
}

function finishGame(win, amount, mult) {
    // Остановка для игрока
    game.status = 'IDLE'; 
    clearInterval(game.pollInterval);
    // Не сбрасываем график сразу, даем насладиться цифрой
    
    document.getElementById('current-multiplier').style.color = '#00ff88';
    
    showWinToast(amount);
    tg.HapticFeedback.notificationOccurred('success');

    updateButtonState();
    setTimeout(resetGame, 3000);
}

function prepareUIForFlight() {
    document.getElementById('game-message').classList.add('hidden');
    document.getElementById('crash-msg').classList.add('hidden');
    document.getElementById('current-multiplier').classList.remove('hidden');
    document.getElementById('current-multiplier').style.color = 'white';
    
    const rocket = document.getElementById('rocket-element');
    rocket.classList.remove('boom');
    rocket.classList.add('flying');
    
    updateButtonState();
    tg.HapticFeedback.impactOccurred('medium');
}

function resetGame() {
    game.status = 'IDLE';
    clearInterval(game.pollInterval);
    
    document.getElementById('rocket-element').innerHTML = '<i class="fa-solid fa-jet-fighter-up"></i><div class="rocket-trail"></div>';
    document.getElementById('rocket-element').classList.remove('boom');
    document.getElementById('rocket-element').style.transform = 'translate(10px, 0)';
    
    document.getElementById('crash-msg').classList.add('hidden');
    document.getElementById('game-message').innerText = "ГОТОВ К ВЗЛЕТУ";
    document.getElementById('game-message').classList.remove('hidden');
    document.getElementById('current-multiplier').innerText = "1.00x";
    
    ctx.clearRect(0, 0, game.width, game.height);
    updateButtonState();
}

// === 6. UI КОНТРОЛЛЕР ===

function updateButtonState() {
    const btn = document.getElementById('main-btn');
    const title = btn.querySelector('.btn-title');
    const sub = btn.querySelector('.btn-sub');

    btn.className = 'action-button'; // сброс

    if (game.status === 'IDLE') {
        btn.classList.add('btn-bet');
        title.innerText = "ПОСТАВИТЬ";
        sub.innerText = "Начать раунд";
        btn.disabled = false;
    } else if (game.status === 'WAITING_SERVER') {
        btn.classList.add('btn-bet');
        title.innerText = "ЗАГРУЗКА...";
        btn.disabled = true;
    } else if (game.status === 'FLYING') {
        btn.classList.add('btn-cashout');
        title.innerText = "ЗАБРАТЬ";
        // Динамический выигрыш
        sub.innerText = "Пока не поздно!";
        btn.disabled = false;
    } else if (game.status === 'CRASHED') {
         btn.classList.add('btn-bet');
         btn.style.opacity = '0.5';
         title.innerText = "КРАШ";
         sub.innerText = "Раунд окончен";
         btn.disabled = true;
    }
}

// Обработчик кнопки
document.getElementById('main-btn').addEventListener('click', () => {
    tg.HapticFeedback.selectionChanged();
    if (game.status === 'IDLE') startRound();
    else if (game.status === 'FLYING') cashOut();
});

// Ставки
window.setBet = (val) => {
    if (game.status !== 'IDLE') return;
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

// История и Утилиты
function addToHistory(multiplier) {
    const container = document.getElementById('history-container');
    const div = document.createElement('div');
    let colorClass = multiplier < 1.10 ? 'red' : (multiplier >= 10 ? 'gold' : (multiplier >= 2 ? 'green' : 'blue'));
    div.className = `badge ${colorClass}`;
    div.innerText = multiplier.toFixed(2) + 'x';
    container.prepend(div);
}

function showWinToast(amount) {
    const toast = document.getElementById('modal-win');
    document.getElementById('win-display-amount').innerText = amount.toLocaleString();
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 2000);
}

function updateBalanceUI(balance) {
    const balEl = document.getElementById('balance-display');
    
    // Если передали баланс - сохраняем и показываем
    if (balance !== undefined) {
        appState.balance[appState.mode] = balance;
        localStorage.setItem('fastMoneyState', JSON.stringify(appState));
        balEl.innerText = Math.floor(balance).toLocaleString();
    } else {
        // Иначе читаем из стейта
        const currBal = appState.balance[appState.mode];
        balEl.innerText = Math.floor(currBal).toLocaleString();
    }
    
    // Валюта
    const map = { 'RUB': '₽', 'USDT': '$', 'STARS': '★' };
    const symEl = document.getElementById('currency-display');
    if(symEl) symEl.innerText = map[appState.currency] || '$';
}

// Модалки
window.openInfoModal = () => document.getElementById('modal-info').classList.remove('hidden');
window.closeInfoModal = () => document.getElementById('modal-info').classList.add('hidden');

// Инит Canvas
document.addEventListener('DOMContentLoaded', () => {
    tg.ready(); tg.expand();
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    resetGame();
});

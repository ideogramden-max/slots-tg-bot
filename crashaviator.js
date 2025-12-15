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

// 2.1. ГЛОБАЛЬНОЕ СОСТОЯНИЕ (APP STATE)
// Данные, которые синхронизируются между всеми страницами через localStorage
let appState = (() => {
    const saved = localStorage.getItem('fastMoneyState');
    const defaults = {
        user: { 
            id: 0, 
            name: "Guest", 
            avatar: null, 
            xp: 0 
        },
        balance: { 
            real: 0, 
            demo: 10000 // Начальный демо-баланс
        },
        currency: 'USDT', // Текущая валюта отображения
        mode: 'demo',     // Текущий режим ('real' или 'demo')
        settings: {
            sound: true,
            haptic: true
        }
    };
    
    return saved ? { ...defaults, ...JSON.parse(saved) } : defaults;
})();

// 2.2. ЛОКАЛЬНОЕ СОСТОЯНИЕ ИГРЫ (GAME STATE)
// Переменные, которые меняются в реальном времени внутри раунда
let game = {
    // Статус текущего процесса
    // IDLE: Ожидание ставки
    // WAITING_SERVER: Отправили ставку, ждем ответа сервера
    // WAITING_START: Ставка принята, ждем начала раунда (серверного таймера)
    // FLYING: Раунд идет, график растет
    // CASHED_OUT: Игрок забрал деньги, но раунд еще идет
    // CRASHED: Раунд окончен взрывом
    status: 'IDLE',

    // Логика полета
    multiplier: 1.00,       // Текущий отображаемый коэффициент
    startTime: 0,           // Timestamp начала раунда (от сервера)
    serverCrashPoint: 0,    // (Для отладки) Точка краша, если сервер её прислал в конце
    
    // Данные игрока в текущем раунде
    betAmount: CONFIG.betting.default, // Текущая выбранная ставка
    currentWin: 0,          // Сколько игрок выиграет, если нажмет сейчас
    userHasBet: false,      // Сделана ли ставка в текущем раунде
    userCashedOut: false,   // Успел ли забрать
    
    // Параметры отрисовки Canvas
    width: 0,               // Ширина холста (динамическая)
    height: 0,              // Высота холста (динамическая)
    
    // История множителей (локальный кэш для ленты сверху)
    history: [],

    // Управление таймерами (чтобы корректно очищать память)
    timers: {
        animationFrame: null, // ID анимации графика
        pollInterval: null,   // ID опроса сервера
        countdown: null       // ID таймера обратного отсчета
    }
};

// Функция для сохранения глобального состояния (вызывать при изменении баланса/режима)
function saveState() {
    localStorage.setItem('fastMoneyState', JSON.stringify(appState));
}

// === 3. CANVAS ENGINE (ГРАФИКА) ===

const canvas = document.getElementById('crash-canvas');
const ctx = canvas.getContext('2d', { alpha: true }); // Включаем прозрачность

// 3.1. НАСТРОЙКА РАЗМЕРОВ (RETINA FIX)
// Вызывается при загрузке и при повороте экрана
function resizeCanvas() {
    const container = document.querySelector('.graph-container');
    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    
    // Физический размер (пиксели устройства)
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    
    // Логический размер (CSS пиксели)
    game.width = rect.width;
    game.height = rect.height;
    
    // Масштабируем контекст
    ctx.scale(dpr, dpr);
}

// 3.2. ОСНОВНОЙ ЦИКЛ ОТРИСОВКИ
function drawFrame() {
    // Рисуем только если игра активна (или только что закончилась, чтобы показать итог)
    if (game.status === 'IDLE' || game.status === 'WAITING_SERVER') {
        // Очищаем и выходим
        ctx.clearRect(0, 0, game.width, game.height);
        return;
    }

    // 1. Очистка
    ctx.clearRect(0, 0, game.width, game.height);

    // 2. Расчет времени и масштаба
    const elapsed = Date.now() - game.startTime;
    
    // Логика "Камеры": если летим долго, отдаляем график
    let scaleX = 1;
    let scaleY = 1;
    
    if (elapsed > CONFIG.zoomThreshold) {
        const factor = elapsed / CONFIG.zoomThreshold;
        // Нелинейное масштабирование для красоты
        scaleX = 1 / Math.pow(factor, 0.6); 
        scaleY = 1 / Math.pow(factor, 0.8);
    }

    // 3. Отрисовка линии графика
    ctx.beginPath();
    ctx.moveTo(0, game.height); // Старт из левого нижнего угла
    
    // Рисуем кривую от 0 до текущего момента
    // Делим время на шаги (например, 50 точек для плавности)
    const steps = 60;
    let currentCanvasX = 0;
    let currentCanvasY = game.height;
    let lastX = 0, lastY = 0; // Для вычисления угла

    for (let t = 0; t <= elapsed; t += elapsed / steps) {
        // X линейно зависит от времени (5 сек экрана по дефолту)
        const x = (t / 5000) * game.width * 0.85 * scaleX; 
        
        // Y растет экспоненциально: e^(t * speed)
        // Вычитаем 1, чтобы стартовать с 0
        const growth = (Math.exp(t * CONFIG.growthSpeed) - 1);
        
        // Переводим рост в пиксели (1.00x -> 100px высоты)
        const y = game.height - (growth * 150 * scaleY);

        ctx.lineTo(x, y);

        // Запоминаем координаты последней точки (где сейчас ракета)
        if (t + (elapsed/steps) > elapsed) {
            lastX = currentCanvasX;
            lastY = currentCanvasY;
            currentCanvasX = x;
            currentCanvasY = y;
        }
    }

    // Стилизация линии
    ctx.lineWidth = CONFIG.graphics.lineWidth;
    ctx.strokeStyle = CONFIG.graphics.lineColor;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    // Эффект свечения (Neon Glow)
    ctx.shadowBlur = CONFIG.graphics.lineShadowBlur;
    ctx.shadowColor = CONFIG.graphics.lineShadow;
    
    ctx.stroke();
    
    // Сброс тени для заливки (оптимизация)
    ctx.shadowBlur = 0;

    // 4. Заливка под графиком
    ctx.lineTo(currentCanvasX, game.height); // Опускаем линию вниз
    ctx.lineTo(0, game.height); // Возвращаем влево
    ctx.fillStyle = CONFIG.graphics.fillColor;
    ctx.fill();

    // 5. Обновление HTML-элемента Ракеты
    updateRocketVisuals(currentCanvasX, currentCanvasY, lastX, lastY);

    // Рекурсивный вызов следующего кадра
    if (game.status === 'FLYING' || game.status === 'CASHED_OUT') {
        game.timers.animationFrame = requestAnimationFrame(drawFrame);
    }
}

// 3.3. ПОЗИЦИОНИРОВАНИЕ РАКЕТЫ
function updateRocketVisuals(x, y, prevX, prevY) {
    const rocket = document.getElementById('rocket-element');
    if (!rocket) return;

    // Ограничиваем, чтобы ракета не улетела за границы div-контейнера
    // x и y - это координаты внутри canvas
    const safeX = Math.max(0, Math.min(x, game.width - 50));
    const safeY = Math.min(game.height, Math.max(y, 50)); 

    // Смещение через CSS Transform (GPU accelerated)
    // Вычитаем height, так как в CSS bottom: 0, а y на canvas идет сверху вниз
    rocket.style.transform = `translate(${safeX}px, ${safeY - game.height}px)`;
    
    // Расчет угла наклона (Rotation)
    // Тангенс угла = противолежащий (dy) / прилежащий (dx)
    // Но для простоты привяжем угол к текущему множителю или времени
    // Чем круче график, тем больше угол (до 90 градусов)
    
    // Вычисляем угол на основе вектора движения (более точно)
    const dx = x - prevX;
    const dy = prevY - y; // инверсия Y для математики
    let angleDeg = Math.atan2(dy, dx) * (180 / Math.PI);
    
    // Сглаживание угла (чтобы не дергалось)
    if (angleDeg < 0) angleDeg = 0;
    if (angleDeg > 85) angleDeg = 85;

    // Корректировка иконки (иконка fa-plane исходно может быть под 45 град)
    const icon = rocket.querySelector('i');
    if (icon) {
        // Иконка fa-jet-fighter-up обычно смотрит вверх (90 deg). 
        // Нам нужно повернуть её вправо (0 deg) и добавить angleDeg.
        // Подгоняем визуально:
        icon.style.transform = `rotate(${angleDeg + 45}deg)`;
    }
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

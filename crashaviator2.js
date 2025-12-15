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

// 4.1. СТАРТ РАУНДА (Запрос к серверу)
async function startRound() {
    // Нельзя начать, если игра уже идет
    if (game.status !== 'IDLE') return;
    
    // Получаем ID пользователя из Telegram
    const userId = tg.initDataUnsafe.user ? tg.initDataUnsafe.user.id : 0;
    
    if (!userId && !CONFIG.debug) { 
        tg.showPopup({title: 'Ошибка', message: 'Запустите игру через Telegram'}); 
        return; 
    }

    // Блокируем интерфейс, ждем ответа
    game.status = 'WAITING_SERVER';
    updateButtonState(); // (Функция из Section 6)

    try {
        // Отправляем ставку на Python-сервер
        const response = await fetch(`${CONFIG.SERVER_URL}/api/crash/bet`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                user_id: userId, 
                amount: game.betAmount,
                mode: appState.mode // 'real' или 'demo'
            })
        });
        
        const data = await response.json();

        // Обработка ошибок (например, нет денег)
        if (data.error) {
            if (data.error === "Insufficient funds") {
                tg.showPopup({
                    title: 'Баланс',
                    message: 'Недостаточно средств для ставки!',
                    buttons: [{type: 'ok'}]
                });
            } else {
                tg.showAlert(`Ошибка сервера: ${data.error}`);
            }
            // Сброс в исходное
            resetGame(); // (Функция из Section 5)
            return;
        }

        // --- УСПЕШНЫЙ СТАРТ ---
        game.status = 'FLYING';
        game.userHasBet = true;
        game.userCashedOut = false;
        
        // ВАЖНО: Синхронизация времени с сервером
        // Python time.time() дает секунды (float), JS Date.now() дает миллисекунды (int)
        // Мы используем серверное время старта, чтобы график был точным
        // Но так как часы клиента и сервера могут расходиться, лучше использовать performance.now() для локальной дельты
        // В простой версии: доверяем клиенту и стартуем от "сейчас", корректируя на пинг
        game.startTime = Date.now(); 
        game.multiplier = 1.00;
        
        // Сервер уже списал деньги, обновляем UI баланса немедленно
        if (data.balance !== undefined) {
            updateBalanceUI(data.balance); // (Функция из Utils)
        }

        // Запуск визуальной части
        prepareUIForFlight(); // (Функция из Section 5)
        
        // Запуск циклов
        drawFrame();     // Графика (Canvas)
        gameLoop();      // Математика (Множитель)
        startStatusPolling(userId); // Страховка (проверка статуса)

    } catch (e) {
        console.error("Bet Error:", e);
        tg.showPopup({title: 'Сбой сети', message: 'Не удалось сделать ставку. Проверьте интернет.'});
        resetGame();
    }
}

// 4.2. ЗАБРАТЬ ВЫИГРЫШ (CASHOUT)
// 2. ЗАБРАТЬ ВЫИГРЫШ (CASHOUT)
async function cashOut() {
    // Проверяем: игра должна идти (FLYING), мы должны были сделать ставку (!game.userHasBet)
    // и мы еще не забрали деньги (!game.userCashedOut)
    if (game.status !== 'FLYING' || !game.userHasBet || game.userCashedOut) return;
    
    // 1. Мгновенно блокируем кнопку и меняем текст, чтобы было видно нажатие
    const btn = document.getElementById('main-btn');
    btn.disabled = true; 
    // Пытаемся найти текстовый элемент внутри кнопки, если его нет - меняем текст кнопки целиком
    const btnTitle = btn.querySelector('.btn-title');
    if (btnTitle) {
        btnTitle.innerText = "ЗАПРОС...";
    } else {
        btn.innerText = "ЗАПРОС...";
    }

    const userId = tg.initDataUnsafe.user ? tg.initDataUnsafe.user.id : 0;

    try {
        // 2. Отправляем запрос на сервер
        const response = await fetch(`${CONFIG.SERVER_URL}/api/crash/cashout`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId })
        });
        
        const data = await response.json();

        // 3. Обрабатываем ответ
        if (data.status === 'won') {
            // УСПЕХ: Мы успели!
            game.status = 'CASHED_OUT';
            game.userCashedOut = true;
            
            // Обновляем баланс, если сервер его прислал
            if (data.balance !== undefined) updateBalanceUI(data.balance);
            
            // Запускаем анимацию победы
            finishGame(true, data.win_amount, data.multiplier);
            
        } else if (data.status === 'crashed') {
            // ОПОЗДАЛИ: Сервер сказал, что краш был раньше нажатия
            // Передаем точку краша в функцию взрыва
            crash(data.crash_point);
        }

    } catch (e) {
        console.error("Cashout Error:", e);
        // Если ошибка сети - разблокируем кнопку обратно, чтобы можно было нажать еще раз
        btn.disabled = false;
        if (btnTitle) {
            btnTitle.innerText = "ЗАБРАТЬ";
        } else {
            btn.innerText = "ЗАБРАТЬ";
        }
    }
}

// 4.3. ПРОВЕРКА СТАТУСА (POLLING)
// Каждую секунду спрашиваем сервер: "Мы еще летим?"
// Это нужно, чтобы если вкладка была свернута или сеть лагала, мы узнали о краше
function startStatusPolling(userId) {
    if (game.timers.pollInterval) clearInterval(game.timers.pollInterval);
    
    game.timers.pollInterval = setInterval(async () => {
        // Если мы уже не летим (крашнулись или вышли), опрос не нужен
        if (game.status !== 'FLYING' && game.status !== 'CASHED_OUT') {
            clearInterval(game.timers.pollInterval);
            return;
        }

        try {
            const response = await fetch(`${CONFIG.SERVER_URL}/api/crash/status`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: userId })
            });
            const data = await response.json();

            // Если сервер говорит, что игра кончилась (CRASHED)
            if (data.status === 'crashed') {
                crash(data.crash_point);
            }
            // Если flying, всё ок, продолжаем лететь

        } catch (e) { 
            console.warn("Poll missed packet", e); 
        }
    }, CONFIG.pollInterval);
        }
            

// === 5. ВИЗУАЛЬНАЯ ЛОГИКА ===

// 5.1. ЦИКЛ ОБНОВЛЕНИЯ МНОЖИТЕЛЯ
// Работает параллельно с графикой, обновляет цифры
function gameLoop() {
    // Если игра остановлена, выходим
    if (game.status !== 'FLYING' && game.status !== 'CASHED_OUT') return;

    // Рассчитываем текущее время полета
    const elapsed = Date.now() - game.startTime;
    
    // Формула роста (должна совпадать с Python)
    game.multiplier = 1 + (Math.exp(elapsed * CONFIG.growthSpeed) - 1);
    
    // Обновляем текст на экране
    const multElement = document.getElementById('current-multiplier');
    if (multElement) {
        multElement.innerText = game.multiplier.toFixed(2) + 'x';
    }

    // Запускаем следующий кадр
    requestAnimationFrame(gameLoop);
}

// 5.2. ОБРАБОТКА КРАША (ВЗРЫВ)
function crash(finalMult) {
    game.status = 'CRASHED';
    
    // Останавливаем таймеры
    clearInterval(game.timers.pollInterval);
    cancelAnimationFrame(game.timers.animationFrame); 

    // 1. Показываем финальный множитель
    const multElement = document.getElementById('current-multiplier');
    if (multElement) {
        multElement.innerText = finalMult.toFixed(2) + 'x';
        multElement.style.color = '#ff0055'; // Красный
    }
    
    // 2. Визуальные эффекты
    const crashMsg = document.getElementById('crash-msg');
    if (crashMsg) crashMsg.classList.remove('hidden');
    
    const rocket = document.getElementById('rocket-element');
    if (rocket) {
        rocket.classList.remove('flying');
        rocket.classList.add('boom');
        rocket.innerHTML = '<i class="fa-solid fa-burst"></i>';
    }
    
    tg.HapticFeedback.notificationOccurred('error');
    addToHistory(finalMult);
    
    // === 🔥 ГЛАВНОЕ ИСПРАВЛЕНИЕ: ПРИНУДИТЕЛЬНО МЕНЯЕМ КНОПКУ ===
    const btn = document.getElementById('main-btn');
    if (btn) {
        // Делаем её серой и пишем "КРАШ"
        btn.className = 'action-button btn-bet'; // Возвращаем базовый класс
        btn.disabled = true;
        btn.style.opacity = '0.5';
        
        const title = btn.querySelector('.btn-title');
        const sub = btn.querySelector('.btn-sub');
        if (title) title.innerText = "КРАШED";
        if (sub) sub.innerText = "Раунд окончен";
    }

    // 3. Таймер перезапуска (через 3 секунды снова станет зеленой)
    setTimeout(resetGame, CONFIG.timings.resetDelay);
}

// 5.3. ОБРАБОТКА ПОБЕДЫ (Игрок забрал деньги)
function finishGame(win, amount, mult) {
    // Статус уже CASHED_OUT, анимация полета продолжается, 
    // но мы даем визуальный фидбек игроку
    
    const multElement = document.getElementById('current-multiplier');
    multElement.style.color = CONFIG.graphics.textColorCashed; // Зеленый
    
    // Показываем тост с выигрышем
    showWinToast(amount);
    
    // Вибрация успеха
    tg.HapticFeedback.notificationOccurred('success');

    // Обновляем кнопку (она станет неактивной "ВЫВЕДЕНО")
    updateButtonState();
}

// 5.4. ПОДГОТОВКА ИНТЕРФЕЙСА К ПОЛЕТУ
function prepareUIForFlight() {
    // Скрываем сообщения ожидания
    document.getElementById('game-message').classList.add('hidden');
    document.getElementById('crash-msg').classList.add('hidden');
    
    // Показываем множитель
    const multElement = document.getElementById('current-multiplier');
    multElement.classList.remove('hidden');
    multElement.innerText = "1.00x";
    multElement.style.color = CONFIG.graphics.textColorFlying;
    
    // Настраиваем ракету
    const rocket = document.getElementById('rocket-element');
    rocket.classList.remove('boom');
    rocket.classList.add('flying');
    rocket.innerHTML = '<i class="fa-solid fa-jet-fighter-up"></i><div class="rocket-trail"></div>';
    
    // Вибрация старта
    tg.HapticFeedback.impactOccurred('medium');
}

// 5.5. СБРОС ИГРЫ (RESET)

function resetGame() {
    game.status = 'IDLE';
    game.userHasBet = false;
    game.userCashedOut = false;
    
    if (game.timers.pollInterval) clearInterval(game.timers.pollInterval);
    
    // Сброс ракеты
    const rocket = document.getElementById('rocket-element');
    if (rocket) {
        rocket.innerHTML = '<i class="fa-solid fa-jet-fighter-up"></i><div class="rocket-trail"></div>';
        rocket.classList.remove('boom', 'flying');
        rocket.style.transform = 'translate(10px, 0)';
    }
    
    // Сброс текстов
    const crashMsg = document.getElementById('crash-msg');
    const gameMsg = document.getElementById('game-message');
    const multEl = document.getElementById('current-multiplier');

    if(crashMsg) crashMsg.classList.add('hidden');
    if(gameMsg) {
        gameMsg.innerText = "ГОТОВ К ВЗЛЕТУ";
        gameMsg.classList.remove('hidden');
    }
    if(multEl) {
        multEl.innerText = "1.00x";
        multEl.style.color = '#fff';
    }
    
    if (ctx) ctx.clearRect(0, 0, game.width, game.height);
    
    // === 🔥 ПРИНУДИТЕЛЬНЫЙ СБРОС КНОПКИ НА ЗЕЛЕНУЮ ===
    const btn = document.getElementById('main-btn');
    if (btn) {
        btn.className = 'action-button btn-bet'; // Зеленый класс
        btn.disabled = false;
        btn.style.opacity = '1';
        
        const title = btn.querySelector('.btn-title');
        const sub = btn.querySelector('.btn-sub');
        
        if(title) title.innerText = "ПОСТАВИТЬ";
        if(sub) sub.innerText = "На следующий раунд";
    }
}

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

// === 6. UI КОНТРОЛЛЕР (ИНТЕРФЕЙС) ===

// 6.1. ОБНОВЛЕНИЕ СОСТОЯНИЯ КНОПКИ
function updateButtonState() {
    const btn = document.getElementById('main-btn');
    const title = btn.querySelector('.btn-title');
    const sub = btn.querySelector('.btn-sub');

    // Сброс базовых классов
    btn.className = 'action-button';

    if (game.status === 'IDLE') {
        btn.classList.add('btn-bet');
        btn.disabled = false;
        btn.style.opacity = '1';
        title.innerText = "ПОСТАВИТЬ";
        sub.innerText = "На следующий раунд";
        
    } else if (game.status === 'WAITING_SERVER') {
        btn.classList.add('btn-bet');
        btn.disabled = true;
        btn.style.opacity = '0.7';
        title.innerText = "ЗАГРУЗКА...";
        sub.innerText = "Связь с центром...";
        
    } else if (game.status === 'FLYING') {
        // САМОЕ ВАЖНОЕ: Если мы ставили и еще не забрали -> Кнопка активна
        if (game.userHasBet && !game.userCashedOut) {
            btn.classList.add('btn-cashout');
            btn.disabled = false;
            btn.style.opacity = '1';
            title.innerText = "ЗАБРАТЬ";
            // Тут можно выводить текущий выигрыш, но пока просто текст
            sub.innerText = "Пока не поздно!";
        } 
        // Если уже забрали -> Кнопка неактивна
        else if (game.userCashedOut) {
            btn.classList.add('btn-bet');
            btn.disabled = true;
            btn.style.opacity = '0.5';
            title.innerText = "ВЫВЕДЕНО";
            sub.innerText = "Ждите конца раунда";
        } 
        // Если мы зритель
        else {
            btn.classList.add('btn-bet');
            btn.disabled = true;
            btn.style.opacity = '0.5';
            title.innerText = "ИДЕТ ИГРА";
            sub.innerText = "Ждите новый раунд";
        }

    } else if (game.status === 'CRASHED') {
         btn.classList.add('btn-bet');
         btn.disabled = true;
         btn.style.opacity = '0.5';
         title.innerText = "КРАШ";
         sub.innerText = "Раунд окончен";
    }
                           }

// 6.2. ОБРАБОТЧИКИ СОБЫТИЙ (КНОПКИ)

// Главная кнопка
document.getElementById('main-btn').addEventListener('click', () => {
    tg.HapticFeedback.selectionChanged();
    
    if (game.status === 'IDLE') {
        startRound();
    } else if (game.status === 'FLYING') {
        cashOut();
    }
});

// Быстрые ставки
window.setBet = (val) => {
    if (game.status !== 'IDLE') return; // Нельзя менять ставку во время игры
    
    if (val === 'max') {
        game.betAmount = CONFIG.betting.max;
    } else {
        game.betAmount = val;
    }
    
    // Проверка лимитов
    if (game.betAmount > CONFIG.betting.max) game.betAmount = CONFIG.betting.max;
    if (game.betAmount < CONFIG.betting.min) game.betAmount = CONFIG.betting.min;

    document.getElementById('bet-amount').innerText = game.betAmount;
    tg.HapticFeedback.selectionChanged();
};

// Кнопки +/-
document.getElementById('btn-inc').addEventListener('click', () => {
    if (game.status !== 'IDLE') return;
    if (game.betAmount < CONFIG.betting.max) {
        game.betAmount += 100;
        document.getElementById('bet-amount').innerText = game.betAmount;
        tg.HapticFeedback.impactOccurred('light');
    }
});

document.getElementById('btn-dec').addEventListener('click', () => {
    if (game.status !== 'IDLE') return;
    if (game.betAmount > CONFIG.betting.min) {
        game.betAmount -= 100;
        document.getElementById('bet-amount').innerText = game.betAmount;
        tg.HapticFeedback.impactOccurred('light');
    }
});

// 6.3. ИСТОРИЯ (ЛЕНТА СВЕРХУ)
function addToHistory(multiplier) {
    const container = document.getElementById('history-container');
    const div = document.createElement('div');
    
    // Цветовая кодировка
    let colorClass = 'blue'; // < 2x
    if (multiplier < 1.10) colorClass = 'red';   // Мгновенный краш
    else if (multiplier >= 10.00) colorClass = 'gold'; // Джекпот
    else if (multiplier >= 2.00) colorClass = 'green'; // Норм выигрыш

    div.className = `badge ${colorClass}`;
    div.innerText = multiplier.toFixed(2) + 'x';
    
    // Добавляем в начало списка
    container.prepend(div);
    
    // Удаляем лишние (храним 20 последних)
    if (container.children.length > 20) {
        container.removeChild(container.lastChild);
    }
}

// 6.4. УВЕДОМЛЕНИЯ И БАЛАНС

// Глобальная переменная для хранения таймера (вставь её ПЕРЕД функцией)
let toastTimer = null; 

function showWinToast(amount) {
    const toast = document.getElementById('modal-win');
    const amountText = document.getElementById('win-display-amount');
    
    // 1. Устанавливаем текст выигрыша
    amountText.innerText = amount.toLocaleString();
    
    // 2. Показываем уведомление (убираем класс hidden)
    toast.classList.remove('hidden');
    
    // 3. СБРОС ПРЕДЫДУЩЕГО ТАЙМЕРА (Важный момент!)
    // Если уведомление уже висит, мы отменяем команду "спрятаться", 
    // чтобы оно не исчезло прямо сейчас, а повисело еще 2 секунды.
    if (toastTimer) {
        clearTimeout(toastTimer);
    }
    
    // 4. Запускаем таймер на скрытие
    toastTimer = setTimeout(() => {
        // Через указанное время добавляем класс hidden обратно
        toast.classList.add('hidden');
        toastTimer = null; // Очищаем переменную
    }, CONFIG.timings.toastDuration); // Берем время из конфига (2000)
}

function updateBalanceUI(serverBalance) {
    // Если сервер прислал баланс, обновляем стейт
    if (serverBalance !== undefined) {
        appState.balance[appState.mode] = serverBalance;
        saveState(); // Сохраняем в localStorage
    }

    const balEl = document.getElementById('balance-display');
    const currSymEl = document.getElementById('currency-display');
    
    // Форматирование
    const currentBal = appState.balance[appState.mode];
    balEl.innerText = Math.floor(currentBal).toLocaleString();
    
    const map = { 'RUB': '₽', 'USDT': '$', 'STARS': '★' };
    currSymEl.innerText = map[appState.currency] || '$';
}

// Модальное окно Инфо
window.openInfoModal = () => {
    document.getElementById('modal-info').classList.remove('hidden');
    tg.HapticFeedback.impactOccurred('light');
};

window.closeInfoModal = () => {
    document.getElementById('modal-info').classList.add('hidden');
};

// 6.5. ТОЧКА ВХОДА (INIT)
document.addEventListener('DOMContentLoaded', () => {
    // Инициализация Telegram SDK
    tg.ready();
    tg.expand(); // На весь экран
    
    // Настройка Canvas
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    
    // Инициализация UI
    updateBalanceUI();
    resetGame(); // Сброс в IDLE
    
    // Генерация фейковой истории для красоты при первом входе
    // (Чтобы лента не была пустой)
    if (document.getElementById('history-container').children.length === 0) {
        const fakeHistory = [1.05, 2.45, 1.10, 15.00, 1.95, 3.20];
        fakeHistory.forEach(m => addToHistory(m));
    }
});

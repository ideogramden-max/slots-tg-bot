/**
 * FASTMONEY - CRASH AVIATOR (FINAL STABLE VERSION)
 * Полная синхронизация с сервером, защита от багов UI.
 */

const tg = window.Telegram.WebApp;

// === 1. КОНФИГУРАЦИЯ ===
const CONFIG = {
    // Твоя ссылка на туннель
    SERVER_URL: "https://alpha-firms-electronics-return.trycloudflare.com",
    
    // Физика (должна совпадать с Python)
    growthSpeed: 0.0006, 

    betting: {
        min: 10,        // <--- ТЕПЕРЬ 10
        max: 500000,
        default: 10     // <--- По умолчанию 10
    },
    
    // Тайминги
    resetDelay: 3000,       // Время показа "CRASHED" перед новым раундом
    animationDuration: 16,
    pollInterval: 1000      // Как часто проверять статус на сервере
};

// === 2. СОСТОЯНИЕ (STATE) ===
let appState = JSON.parse(localStorage.getItem('fastMoneyState')) || {
    balance: { real: 0, demo: 10000 },
    currency: 'USDT',
    mode: 'demo'
};

let game = {
    status: 'IDLE',         // IDLE, BETTING, FLYING, CRASHED, CASHED
    betAmount: 10,
    startTime: 0,           // Время начала раунда (от сервера)
    multiplier: 1.00,       // Текущий икс
    userHasBet: false,      // Участвует ли игрок в раунде
    userCashedOut: false,   // Забрал ли деньги
    
    // Таймеры (для очистки)
    timers: {
        loop: null,         // Анимация кадров
        poll: null,         // Опрос сервера
        restart: null       // Таймер перезапуска
    },
    
    // Размеры холста
    width: 0,
    height: 0
};

// === 3. ГРАФИЧЕСКИЙ ДВИЖОК (CANVAS) ===
const canvas = document.getElementById('crash-graph');
const ctx = canvas.getContext('2d');

// Адаптация под размер экрана
function resizeCanvas() {
    const container = document.querySelector('.canvas-container');
    if (!container) return;
    
    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    
    // Нормализуем масштаб
    ctx.scale(dpr, dpr);
    
    game.width = rect.width;
    game.height = rect.height;
}

// Главная функция рисования (60 FPS)
function drawLoop() {
    // Если игра не идет - не рисуем (экономим батарею)
    if (game.status === 'IDLE') return;

    ctx.clearRect(0, 0, game.width, game.height);

    if (game.status === 'BETTING') return; // Пока ждем сервер - пусто

    // Расчет времени полета
    const elapsed = Date.now() - game.startTime;
    
    // Логика "Камеры" (Zoom Out)
    // Если летим долго (>4 сек), график сжимается, чтобы влезать в экран
    let scaleX = 1, scaleY = 1;
    if (elapsed > 4000) {
        const factor = elapsed / 4000;
        scaleX = 1 / Math.pow(factor, 0.6);
        scaleY = 1 / Math.pow(factor, 0.7);
    }

    // Рисуем линию
    ctx.beginPath();
    ctx.moveTo(0, game.height); // Старт (левый нижний угол)

    let currentX = 0;
    let currentY = game.height;
    
    // Рисуем график по точкам (шаг 50мс для плавности)
    for (let t = 0; t <= elapsed; t += 50) {
        // X = Линейное время (5 секунд во всю ширину экрана)
        const x = (t / 5000) * game.width * 0.85 * scaleX;
        
        // Y = Экспонента (e^t)
        // 150px высоты = 1.00x прироста
        const growth = Math.exp(t * CONFIG.growthSpeed) - 1;
        const y = game.height - (growth * 150 * scaleY);
        
        ctx.lineTo(x, y);
        
        // Запоминаем последнюю точку для ракеты
        if (t + 50 > elapsed) { currentX = x; currentY = y; }
    }

    // Стилизация линии (Неон)
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#00f3ff';
    ctx.shadowBlur = 15;
    ctx.shadowColor = '#00f3ff';
    ctx.stroke();
    ctx.shadowBlur = 0; // Сброс тени для заливки

    // Заливка под графиком
    ctx.lineTo(currentX, game.height);
    ctx.lineTo(0, game.height);
    ctx.fillStyle = 'rgba(0, 243, 255, 0.1)';
    ctx.fill();

    // Двигаем ракету (HTML элемент поверх канваса)
    updateRocketPosition(currentX, currentY);

    // Продолжаем цикл, если летим или только что забрали (но еще не краш)
    if (game.status === 'FLYING' || game.status === 'CASHED') {
        game.timers.loop = requestAnimationFrame(drawLoop);
    }
}

function updateRocketPosition(x, y) {
    const rocket = document.getElementById('rocket-object');
    // Ограничиваем координаты, чтобы не вылезала за пределы
    const safeX = Math.min(x, game.width - 50);
    const safeY = Math.max(y, 50);
    
    // CSS Transform (Аппаратное ускорение)
    rocket.style.transform = `translate(${safeX}px, ${safeY - game.height}px)`;
    
    // Поворот носа ракеты
    // Чем выше множитель, тем вертикальнее (до 80 градусов)
    const angle = Math.min(10 + (game.multiplier * 3), 80);
    rocket.querySelector('.rocket-icon').style.transform = `rotate(${angle - 45}deg)`;
}

// === 4. ИГРОВАЯ ЛОГИКА (API) ===

// 4.1. Нажатие кнопки "ПОСТАВИТЬ"
async function placeBet() {
    if (game.status !== 'IDLE') return;

    // Валидация баланса
    if (appState.balance[appState.mode] < game.betAmount) {
        showErrorToast("Недостаточно средств!");
        return;
    }

    const userId = tg.initDataUnsafe.user ? tg.initDataUnsafe.user.id : 0;
    if (!userId) { showErrorToast("Запустите через Telegram"); return; }

    // UI: Блокируем кнопку
    setButtonState('LOADING', 'ЗАГРУЗКА...', 'Связь с сервером');
    game.status = 'BETTING';

    try {
        const res = await fetch(`${CONFIG.SERVER_URL}/api/crash/bet`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: userId,
                amount: game.betAmount,
                mode: appState.mode
            })
        });
        const data = await res.json();

        if (data.error) throw new Error(data.error);

        // --- ИГРА НАЧАЛАСЬ ---
        
        // 1. Обновляем баланс (сервер уже списал)
        updateBalanceUI(data.balance);
        
        // 2. Инициализируем раунд
        game.status = 'FLYING';
        game.startTime = data.server_time * 1000; // Конверт в мс
        game.multiplier = 1.00;
        game.userHasBet = true;
        game.userCashedOut = false;

        // 3. UI
        prepareUIForFly();
        setButtonState('CASHOUT', 'ЗАБРАТЬ', 'Пока не упало!');

        // 4. Запуск процессов
        runMathLoop();      // Считаем цифры
        drawLoop();         // Рисуем графику
        startPolling(userId); // Следим за сервером

    } catch (e) {
        console.error(e);
        showErrorToast("Ошибка сети");
        forceReset(); // Сброс, чтобы кнопка отлипла
    }
}

// 4.2. Нажатие кнопки "ЗАБРАТЬ"
async function cashOut() {
    if (game.status !== 'FLYING' || game.userCashedOut) return;
    
    // Визуальный фидбек мгновенно
    setButtonState('LOADING', 'ЗАПРОС...', 'Фиксация...');
    const userId = tg.initDataUnsafe.user ? tg.initDataUnsafe.user.id : 0;

    try {
        const res = await fetch(`${CONFIG.SERVER_URL}/api/crash/cashout`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId })
        });
        const data = await res.json();

        if (data.status === 'won') {
            // --- ПОБЕДА ---
            game.status = 'CASHED'; // Спец статус: игрок вышел, но раунд идет
            game.userCashedOut = true;
            
            // Баланс
            updateBalanceUI(data.balance);
            
            // UI
            showWinToast(data.win_amount); // Показываем зеленый тост
            setButtonState('DISABLED', 'ВЫВЕДЕНО', `+${data.win_amount} $`);
            
            // Меняем цвет цифр на зеленый
            document.getElementById('multiplier-display').style.color = '#00ff88';

        } else if (data.status === 'crashed') {
            // --- ОПОЗДАЛ ---
            crashGame(data.crash_point);
        }

    } catch (e) {
        // Если ошибка сети - возвращаем кнопку, чтобы можно было нажать еще раз
        setButtonState('CASHOUT', 'ЗАБРАТЬ', 'Ошибка сети, жми!');
    }
}

// 4.3. Опрос сервера (Polling)
function startPolling(userId) {
    if (game.timers.poll) clearInterval(game.timers.poll);
    
    game.timers.poll = setInterval(async () => {
        // Если мы уже крашнулись, опрос не нужен
        if (game.status === 'CRASHED' || game.status === 'IDLE') {
            clearInterval(game.timers.poll);
            return;
        }

        try {
            const res = await fetch(`${CONFIG.SERVER_URL}/api/crash/status`, {
                method: 'POST', body: JSON.stringify({user_id: userId})
            });
            const data = await res.json();
            
            if (data.status === 'crashed') {
                crashGame(data.crash_point);
            }
        } catch (e) { /* Игнорируем ошибки сети при поллинге */ }
    }, CONFIG.pollInterval);
}

// 4.4. Математический цикл (Цифры на экране)
function runMathLoop() {
    if (game.status !== 'FLYING' && game.status !== 'CASHED') return;

    const elapsed = Date.now() - game.startTime;
    // Формула: e^(t * speed)
    game.multiplier = Math.exp(elapsed * CONFIG.growthSpeed);
    
    // Обновляем текст в центре
    const el = document.getElementById('multiplier-display');
    if (el) el.innerText = game.multiplier.toFixed(2) + 'x';

    requestAnimationFrame(runMathLoop);
}

// === 5. СОБЫТИЯ ИГРЫ ===

// Краш (Взрыв)
function crashGame(finalValue) {
    // Останавливаем все циклы
    game.status = 'CRASHED';
    clearInterval(game.timers.poll);
    
    // Финальные цифры (Красные)
    const el = document.getElementById('multiplier-display');
    el.innerText = finalValue.toFixed(2) + 'x';
    el.style.color = '#ff0055'; // Красный
    
    // Показываем надпись CRASHED
    document.getElementById('crash-message').classList.remove('hidden');
    document.getElementById('multiplier-display').classList.remove('hidden'); // На всякий случай
    document.getElementById('status-message').classList.add('hidden');

    // Взрыв ракеты
    const rocket = document.getElementById('rocket-object');
    rocket.classList.add('boom');
    rocket.innerHTML = '<i class="fa-solid fa-burst"></i>';
    
    tg.HapticFeedback.notificationOccurred('error');
    
    // Добавляем в историю
    addToHistory(finalValue);
    
    // Блокируем кнопку
    setButtonState('DISABLED', 'КРАШ', 'Раунд окончен');

    // Таймер перезапуска
    if (game.timers.restart) clearTimeout(game.timers.restart);
    game.timers.restart = setTimeout(forceReset, CONFIG.resetDelay);
}

// Полный сброс (Рестарт)
function forceReset() {
    game.status = 'IDLE';
    game.userHasBet = false;
    game.userCashedOut = false;
    
    // Очистка таймеров
    cancelAnimationFrame(game.timers.loop);
    clearInterval(game.timers.poll);

    // Сброс UI
    document.getElementById('crash-message').classList.add('hidden');
    document.getElementById('multiplier-display').classList.add('hidden');
    document.getElementById('multiplier-display').style.color = 'white'; // Возвращаем белый
    
    const statusMsg = document.getElementById('status-message');
    statusMsg.innerText = "ГОТОВ К ВЗЛЕТУ";
    statusMsg.classList.remove('hidden');

    // Сброс ракеты
    const rocket = document.getElementById('rocket-object');
    rocket.classList.remove('boom', 'flying');
    rocket.innerHTML = '<i class="fa-solid fa-jet-fighter-up rocket-icon"></i><div class="rocket-fire"></div>';
    rocket.style.transform = 'translate(0, 0)';

    // Очистка Канваса
    ctx.clearRect(0, 0, game.width, game.height);
    
    // Кнопка снова зеленая
    setButtonState('BET', 'ПОСТАВИТЬ', 'Начать раунд');
}

function prepareUIForFly() {
    document.getElementById('status-message').classList.add('hidden');
    document.getElementById('multiplier-display').classList.remove('hidden');
    document.getElementById('rocket-object').classList.add('flying');
}

// === 6. UI HELPER FUNCTIONS ===

// Универсальное управление кнопкой
function setButtonState(state, title, sub) {
    const btn = document.getElementById('main-action-btn');
    const tEl = btn.querySelector('.btn-title');
    const sEl = btn.querySelector('.btn-subtitle');
    
    // Сброс классов
    btn.className = 'big-btn';
    btn.disabled = false;

    if (state === 'BET') {
        btn.classList.add('btn-bet'); // Зеленая
        btn.onclick = placeBet;
    } else if (state === 'CASHOUT') {
        btn.classList.add('btn-cashout'); // Желтая/Оранжевая
        btn.onclick = cashOut;
    } else if (state === 'LOADING') {
        btn.classList.add('btn-loading'); // Серая
        btn.disabled = true;
    } else if (state === 'DISABLED') {
        btn.classList.add('btn-bet'); // Оставляем цвет, но затемняем
        btn.style.opacity = '0.5';
        btn.disabled = true;
    }
    
    if (title) tEl.innerText = title;
    if (sub) sEl.innerText = sub;
}

// Уведомление о победе (Тост)
function showWinToast(amount) {
    const toast = document.getElementById('win-toast');
    document.getElementById('win-val-display').innerText = amount.toLocaleString();
    
    toast.classList.remove('hidden');
    setTimeout(() => {
        toast.classList.add('hidden');
    }, 2000);
}

function showErrorToast(msg) {
    tg.showAlert(msg);
}

// История (Лента)
function addToHistory(val) {
    const track = document.getElementById('history-track');
    const badge = document.createElement('div');
    
    let color = 'blue';
    if (val < 1.1) color = 'red';
    else if (val >= 10) color = 'gold';
    else if (val >= 2) color = 'green';
    
    badge.className = `badge ${color}`;
    badge.innerText = val.toFixed(2) + 'x';
    
    track.prepend(badge);
    if (track.children.length > 15) track.lastChild.remove();
}

// Баланс
function updateBalanceUI(serverBal) {
    if (serverBal !== undefined) {
        appState.balance[appState.mode] = serverBal;
        localStorage.setItem('fastMoneyState', JSON.stringify(appState));
    }
    const balEl = document.getElementById('balance-amount');
    if (balEl) balEl.innerText = Math.floor(appState.balance[appState.mode]).toLocaleString();
}

// Ставки
function updateBet(val) {
    if (game.status !== 'IDLE') return;
    
    if (val === 'max') game.betAmount = 5000;
    else game.betAmount = val;
    
    document.getElementById('current-bet').innerText = game.betAmount;
    tg.HapticFeedback.selectionChanged();
}

// Управление ставкой +/-
document.getElementById('btn-plus').onclick = () => {
    if (game.status !== 'IDLE') return;
    game.betAmount += 100;
    updateBet(game.betAmount);
};
document.getElementById('btn-minus').onclick = () => {
    if (game.status !== 'IDLE') return;
    if (game.betAmount > 100) game.betAmount -= 100;
    updateBet(game.betAmount);
};

// Модалка Инфо
window.toggleModal = (id, show) => {
    const el = document.getElementById(id);
    if (show) el.classList.remove('hidden');
    else el.classList.add('hidden');
};

// === 7. STARTUP ===
document.addEventListener('DOMContentLoaded', () => {
    tg.ready(); tg.expand();
    
    // Инит канваса
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    
    // Инит баланса
    updateBalanceUI();
    
    // Сброс в начало
    forceReset();
});

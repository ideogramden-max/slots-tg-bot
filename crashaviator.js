/**
 * FASTMONEY - CRASH ENGINE (1WIN GRADE)
 * Strict Server Sync, Interpolated Animation, Hard Limits.
 */

const tg = window.Telegram.WebApp;

// === CONFIG ===
const CONFIG = {
    SERVER_URL: "https://alpha-firms-electronics-return.trycloudflare.com", // ТВОЯ ССЫЛКА
    GROWTH_SPEED: 0.0006, 
    MAX_MULT: 1000.00, // Жесткий лимит визуала
    POLL_INTERVAL: 1000
};

// === STATE ===
let appState = JSON.parse(localStorage.getItem('fastMoneyState')) || { 
    balance: { real: 0, demo: 10000 }, mode: 'demo' 
};

let game = {
    status: 'IDLE',   // IDLE, CONNECTING, FLYING, CASHED, CRASHED
    bet: 100,
    startTime: 0,     // Серверное время старта (ms)
    multiplier: 1.00,
    isBetting: false, // Флаг: мы в игре?
    isCashed: false,  // Флаг: мы вышли?
    width: 0, height: 0,
    timers: { frame: null, poll: null, reset: null }
};

// === DOM ELEMENTS ===
const els = {
    canvas: document.getElementById('crash-graph'),
    ctx: document.getElementById('crash-graph').getContext('2d'),
    rocket: document.getElementById('rocket-object'),
    multText: document.getElementById('multiplier-display'),
    statusText: document.getElementById('status-message'),
    crashText: document.getElementById('crash-message'),
    btn: document.getElementById('main-action-btn'),
    btnTitle: document.querySelector('.btn-title'),
    btnSub: document.querySelector('.btn-subtitle'),
    balance: document.getElementById('balance-amount'),
    toast: document.getElementById('win-toast'),
    history: document.getElementById('history-track')
};

// === INITIALIZATION ===
document.addEventListener('DOMContentLoaded', () => {
    tg.ready(); tg.expand();
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    
    updateBalanceUI();
    resetGameUI(); // Сброс в исходное
    
    // Бинды ставок
    document.getElementById('btn-plus').onclick = () => changeBet(100);
    document.getElementById('btn-minus').onclick = () => changeBet(-100);
});

// === GRAPHICS ENGINE ===

function resizeCanvas() {
    const box = document.querySelector('.canvas-container').getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    els.canvas.width = box.width * dpr;
    els.canvas.height = box.height * dpr;
    els.ctx.scale(dpr, dpr);
    game.width = box.width;
    game.height = box.height;
}

// Главный рендер-луп (60fps)
function render() {
    if (game.status === 'IDLE' || game.status === 'CONNECTING') return;

    els.ctx.clearRect(0, 0, game.width, game.height);

    // 1. Расчет времени и множителя
    const elapsed = Date.now() - game.startTime;
    
    // E^(t*k)
    let mult = Math.exp(elapsed * CONFIG.GROWTH_SPEED);
    
    // ЖЕСТКИЙ ЛИМИТ: Не рисовать больше 1000x
    if (mult > CONFIG.MAX_MULT) mult = CONFIG.MAX_MULT;
    
    game.multiplier = mult;

    // Обновляем текст (ТОЛЬКО ЕСЛИ НЕ КРАШ)
    if (game.status === 'FLYING' || game.status === 'CASHED') {
        els.multText.innerText = mult.toFixed(2) + 'x';
    }

    // 2. Координаты Графика
    // Zoom Out логика: после 4 сек график сжимается
    let scale = 1;
    if (elapsed > 4000) scale = 1 / Math.pow(elapsed / 4000, 0.6);

    els.ctx.beginPath();
    els.ctx.moveTo(0, game.height);

    let tipX = 0, tipY = game.height;

    // Рисуем хвост (оптимизировано: шаг 50мс)
    for (let t = 0; t <= elapsed; t += 50) {
        const x = (t / 5000) * game.width * 0.85 * scale; // 5 сек = 85% ширины
        const h = (Math.exp(t * CONFIG.GROWTH_SPEED) - 1) * 150 * scale; // Высота
        const y = game.height - h;
        
        els.ctx.lineTo(x, y);
        
        // Запоминаем кончик
        if (t + 50 > elapsed) { tipX = x; tipY = y; }
    }

    // Стили
    els.ctx.lineWidth = 4;
    els.ctx.strokeStyle = '#00f3ff';
    els.ctx.stroke();

    // Заливка
    els.ctx.lineTo(tipX, game.height);
    els.ctx.lineTo(0, game.height);
    els.ctx.fillStyle = 'rgba(0, 243, 255, 0.1)';
    els.ctx.fill();

    // 3. Движение Ракеты (CSS Transform для плавности)
    // Ограничиваем координаты, чтобы не вылетела за div
    const safeX = Math.min(tipX, game.width - 40);
    const safeY = Math.max(tipY, 40);
    
    // Угол наклона: от 10 до 80 градусов в зависимости от роста
    const angle = Math.min(10 + (mult * 2), 80);
    
    els.rocket.style.transform = `translate(${safeX}px, ${safeY - game.height}px)`;
    els.rocket.querySelector('i').style.transform = `rotate(${angle - 45}deg)`;

    if (game.status === 'FLYING' || game.status === 'CASHED') {
        game.timers.frame = requestAnimationFrame(render);
    }
}

// === NETWORK LOGIC (API) ===

// 1. СТАРТ (BET)
els.btn.onclick = async () => {
    if (game.status === 'IDLE') {
        // --- BET ---
        if (appState.balance[appState.mode] < game.bet) {
            alert("Недостаточно средств");
            return;
        }

        setBtn('LOADING', 'ЗАГРУЗКА...', 'Связь с центром');
        game.status = 'CONNECTING';

        try {
            const res = await fetch(`${CONFIG.SERVER_URL}/api/crash/bet`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ 
                    user_id: getUserID(), 
                    amount: game.bet, 
                    mode: appState.mode 
                })
            });
            const data = await res.json();

            if (data.error) throw new Error(data.error);

            // START GAME
            game.status = 'FLYING';
            game.startTime = data.server_time * 1000;
            game.multiplier = 1.00;
            game.isBetting = true;
            game.isCashed = false;

            updateBalanceUI(data.balance);
            
            // UI
            els.multText.classList.remove('hidden');
            els.statusText.classList.add('hidden');
            els.rocket.classList.remove('boom');
            els.rocket.classList.add('flying');
            
            setBtn('CASHOUT', 'ЗАБРАТЬ', 'Пока не упало!');

            render();
            startPolling();

        } catch (e) {
            console.error(e);
            resetGameUI(); // Откат при ошибке
            alert("Ошибка сети. Попробуйте еще раз.");
        }

    } else if (game.status === 'FLYING' && game.isBetting && !game.isCashed) {
        // --- CASHOUT ---
        // Блокируем кнопку мгновенно (Anti-double-click)
        setBtn('LOADING', 'ЗАПРОС...', 'Фиксация...');
        
        try {
            const res = await fetch(`${CONFIG.SERVER_URL}/api/crash/cashout`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ user_id: getUserID() })
            });
            const data = await res.json();

            if (data.status === 'won') {
                game.status = 'CASHED';
                game.isCashed = true;
                
                updateBalanceUI(data.balance);
                showWin(data.win_amount);
                
                setBtn('DISABLED', 'ВЫВЕДЕНО', 'Ждем финала');
                els.multText.style.color = '#00ff88'; // Зеленый текст

            } else if (data.status === 'crashed') {
                // Опоздал
                doCrash(data.crash_point);
            }
        } catch (e) {
            // Если сеть лаганула - возвращаем кнопку
            setBtn('CASHOUT', 'ЗАБРАТЬ', 'Повторите!');
        }
    }
};

// 2. POLLING (Проверка статуса)
function startPolling() {
    if (game.timers.poll) clearInterval(game.timers.poll);
    
    game.timers.poll = setInterval(async () => {
        if (game.status === 'CRASHED' || game.status === 'IDLE') {
            clearInterval(game.timers.poll);
            return;
        }

        try {
            const res = await fetch(`${CONFIG.SERVER_URL}/api/crash/status`, {
                method: 'POST', body: JSON.stringify({user_id: getUserID()})
            });
            const data = await res.json();

            if (data.status === 'crashed') {
                doCrash(data.crash_point);
            }
        } catch (e) {}
    }, CONFIG.POLL_INTERVAL);
}

// 3. CRASH EVENT
function doCrash(finalVal) {
    game.status = 'CRASHED';
    clearInterval(game.timers.poll);
    cancelAnimationFrame(game.timers.frame);
    
    // UI Краша
    els.multText.innerText = finalVal.toFixed(2) + 'x';
    els.multText.style.color = '#ff0055'; // Красный
    
    els.crashText.classList.remove('hidden');
    els.rocket.classList.add('boom');
    els.rocket.innerHTML = '<i class="fa-solid fa-burst"></i>';
    
    tg.HapticFeedback.notificationOccurred('error');
    addHistory(finalVal);

    setBtn('DISABLED', 'КРАШ', 'Раунд окончен');

    // Рестарт через 3 сек
    if (game.timers.reset) clearTimeout(game.timers.reset);
    game.timers.reset = setTimeout(resetGameUI, 3000);
}

// === UI MANAGERS ===

function resetGameUI() {
    game.status = 'IDLE';
    game.isBetting = false;
    game.isCashed = false;
    
    els.crashText.classList.add('hidden');
    els.multText.classList.add('hidden');
    els.multText.style.color = 'white';
    
    els.statusText.classList.remove('hidden');
    els.statusText.innerText = "ГОТОВ К ВЗЛЕТУ";

    els.rocket.classList.remove('boom', 'flying');
    els.rocket.innerHTML = '<i class="fa-solid fa-jet-fighter-up rocket-icon"></i><div class="rocket-fire"></div>';
    els.rocket.style.transform = `translate(0, 0)`;
    
    els.ctx.clearRect(0, 0, game.width, game.height);
    
    setBtn('BET', 'ПОСТАВИТЬ', 'Начать раунд');
}

function setBtn(state, title, sub) {
    const b = els.btn;
    b.className = 'big-btn'; // Сброс
    b.disabled = false;
    
    if (state === 'BET') b.classList.add('btn-bet');
    else if (state === 'CASHOUT') b.classList.add('btn-cashout');
    else if (state === 'LOADING') { b.classList.add('btn-loading'); b.disabled = true; }
    else if (state === 'DISABLED') { b.classList.add('btn-disabled'); b.disabled = true; }
    
    els.btnTitle.innerText = title;
    els.btnSub.innerText = sub;
}

function updateBalanceUI(bal) {
    if (bal !== undefined) {
        appState.balance[appState.mode] = bal;
        localStorage.setItem('fastMoneyState', JSON.stringify(appState));
    }
    document.getElementById('balance-amount').innerText = Math.floor(appState.balance[appState.mode]).toLocaleString();
}

// Хелперы
function changeBet(delta) {
    if (game.status !== 'IDLE') return;
    let newBet = game.bet + delta;
    if (newBet < 10) newBet = 10;
    if (newBet > 500000) newBet = 500000;
    game.bet = newBet;
    document.getElementById('current-bet').innerText = game.bet;
    tg.HapticFeedback.selectionChanged();
}

window.updateBet = (val) => {
    if (game.status !== 'IDLE') return;
    game.bet = (val === 'max') ? 5000 : val;
    document.getElementById('current-bet').innerText = game.bet;
    tg.HapticFeedback.selectionChanged();
};

function getUserID() {
    return tg.initDataUnsafe.user ? tg.initDataUnsafe.user.id : 12345;
}

function showWin(amount) {
    document.getElementById('win-val-display').innerText = amount;
    els.toast.classList.remove('hidden');
    setTimeout(() => els.toast.classList.add('hidden'), 2000);
    tg.HapticFeedback.notificationOccurred('success');
}

function addHistory(val) {
    const div = document.createElement('div');
    div.className = `badge ${val < 1.2 ? 'crash' : (val > 2 ? 'med' : 'low')}`;
    div.innerText = val.toFixed(2) + 'x';
    els.history.prepend(div);
}

// Модалки
window.toggleModal = (id, show) => {
    const el = document.getElementById(id);
    show ? el.classList.remove('hidden') : el.classList.add('hidden');
};

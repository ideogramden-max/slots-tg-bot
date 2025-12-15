/**
 * FASTMONEY - CRASH ENGINE V2 (FIXED)
 */

const tg = window.Telegram.WebApp;

const CONFIG = {
    // 👇 ВСТАВЬ СВОЮ АКТУАЛЬНУЮ ССЫЛКУ CLOUDFLARE
    SERVER_URL: "https://alpha-firms-electronics-return.trycloudflare.com", 
    growthSpeed: 0.0006, 
    pollInterval: 1000
};

let appState = JSON.parse(localStorage.getItem('fastMoneyState')) || { 
    balance: { real: 0, demo: 10000 }, currency: 'USDT', mode: 'demo' 
};

let game = {
    status: 'IDLE', // IDLE, FLYING, CRASHED
    multiplier: 1.00,
    startTime: 0,
    betAmount: 100,
    userHasBet: false,
    userCashedOut: false,
    width: 0, height: 0,
    timers: { animation: null, poll: null, toast: null }
};

// --- CANVAS ---
const canvas = document.getElementById('crash-canvas');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
    const box = document.querySelector('.graph-container').getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = box.width * dpr;
    canvas.height = box.height * dpr;
    ctx.scale(dpr, dpr);
    game.width = box.width;
    game.height = box.height;
}

function drawFrame() {
    if (game.status !== 'FLYING' && game.status !== 'CRASHED' && game.status !== 'CASHED') return;
    
    ctx.clearRect(0, 0, game.width, game.height);
    const elapsed = Date.now() - game.startTime;

    // Zoom logic
    let scale = 1;
    if (elapsed > 4000) scale = 1 / Math.pow(elapsed / 4000, 0.6);

    ctx.beginPath();
    ctx.moveTo(0, game.height);
    
    let curX = 0, curY = game.height;
    
    for (let t = 0; t <= elapsed; t += 16) {
        const x = (t / 5000) * game.width * 0.85 * scale;
        const y = game.height - ((Math.exp(t * CONFIG.growthSpeed) - 1) * 150 * scale);
        ctx.lineTo(x, y);
        curX = x; curY = y;
    }
    
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#00f3ff';
    ctx.stroke();
    
    // Ракета
    const rocket = document.getElementById('rocket-element');
    const rX = Math.min(curX, game.width - 40);
    const rY = Math.max(curY, 40);
    rocket.style.transform = `translate(${rX}px, ${rY - game.height}px)`;
    
    if (game.status === 'FLYING') {
        game.timers.animation = requestAnimationFrame(drawFrame);
    }
}

// --- LOGIC ---

// 1. СТАРТ
async function startRound() {
    if (game.status !== 'IDLE') return;
    const userId = tg.initDataUnsafe.user ? tg.initDataUnsafe.user.id : 0;
    
    // UI: Загрузка
    setButton('loading', 'ЗАГРУЗКА...', 'Связь с сервером');

    try {
        const res = await fetch(`${CONFIG.SERVER_URL}/api/crash/bet`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ user_id: userId, amount: game.betAmount, mode: appState.mode })
        });
        const data = await res.json();

        if (data.error) {
            alert(data.error);
            forceReset();
            return;
        }

        // УСПЕХ
        game.status = 'FLYING';
        game.userHasBet = true;
        game.userCashedOut = false;
        game.startTime = data.server_time * 1000;
        
        updateBalanceUI(data.balance);
        prepareVisuals();
        
        // Кнопка: ЗАБРАТЬ
        setButton('cashout', 'ЗАБРАТЬ', 'Пока не поздно!');
        
        // Запуск
        drawFrame();
        gameLoop();
        startPolling(userId);

    } catch (e) {
        console.error(e);
        forceReset();
    }
}

// 2. ЗАБРАТЬ
async function cashOut() {
    if (game.status !== 'FLYING' || game.userCashedOut) return;
    
    setButton('loading', 'ЗАПРОС...', 'Фиксация...');
    const userId = tg.initDataUnsafe.user ? tg.initDataUnsafe.user.id : 0;

    try {
        const res = await fetch(`${CONFIG.SERVER_URL}/api/crash/cashout`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ user_id: userId })
        });
        const data = await res.json();

        if (data.status === 'won') {
            game.userCashedOut = true;
            updateBalanceUI(data.balance);
            showWinToast(data.win_amount);
            setButton('disabled', 'ВЫВЕДЕНО', 'Ждем финала');
        } else {
            // Опоздал
            crash(data.crash_point);
        }

    } catch (e) {
        // Ошибка сети - возвращаем кнопку
        setButton('cashout', 'ЗАБРАТЬ', 'Повторите!');
    }
}

// 3. ЦИКЛ (Множитель)
function gameLoop() {
    if (game.status !== 'FLYING') return;
    
    const elapsed = Date.now() - game.startTime;
    game.multiplier = 1 + (Math.exp(elapsed * CONFIG.growthSpeed) - 1);
    
    document.getElementById('current-multiplier').innerText = game.multiplier.toFixed(2) + 'x';
    
    requestAnimationFrame(gameLoop);
}

// 4. ОПРОС
function startPolling(userId) {
    game.timers.poll = setInterval(async () => {
        if (game.status !== 'FLYING') { clearInterval(game.timers.poll); return; }
        
        try {
            const res = await fetch(`${CONFIG.SERVER_URL}/api/crash/status`, {
                method: 'POST', body: JSON.stringify({user_id: userId})
            });
            const data = await res.json();
            
            if (data.status === 'crashed') crash(data.crash_point);
            
        } catch(e){}
    }, CONFIG.pollInterval);
}

// 5. КРАШ
function crash(val) {
    game.status = 'CRASHED';
    clearInterval(game.timers.poll);
    cancelAnimationFrame(game.timers.animation);
    
    document.getElementById('current-multiplier').innerText = val.toFixed(2) + 'x';
    document.getElementById('current-multiplier').style.color = '#ff0055';
    document.getElementById('crash-msg').classList.remove('hidden');
    
    document.getElementById('rocket-element').classList.add('boom');
    document.getElementById('rocket-element').innerHTML = '<i class="fa-solid fa-burst"></i>';
    
    tg.HapticFeedback.notificationOccurred('error');
    
    // Кнопка: КРАШ
    setButton('disabled', 'КРАШ', 'Раунд окончен');
    
    // Добавляем в историю
    const hist = document.getElementById('history-container');
    const badge = document.createElement('div');
    badge.className = `badge ${val < 1.2 ? 'red' : 'green'}`;
    badge.innerText = val.toFixed(2) + 'x';
    hist.prepend(badge);

    setTimeout(forceReset, 3000);
}

// 6. СБРОС (UI RESET)
function forceReset() {
    game.status = 'IDLE';
    game.userHasBet = false;
    game.userCashedOut = false;
    clearInterval(game.timers.poll);
    
    // Сброс визуала
    document.getElementById('crash-msg').classList.add('hidden');
    document.getElementById('game-message').classList.remove('hidden');
    document.getElementById('current-multiplier').innerText = "1.00x";
    document.getElementById('current-multiplier').style.color = "white";
    
    const rocket = document.getElementById('rocket-element');
    rocket.classList.remove('boom', 'flying');
    rocket.innerHTML = '<i class="fa-solid fa-jet-fighter-up"></i><div class="rocket-trail"></div>';
    rocket.style.transform = 'translate(10px, 0)';
    
    ctx.clearRect(0, 0, game.width, game.height);
    
    // Кнопка: СТАВИТЬ
    setButton('bet', 'ПОСТАВИТЬ', 'Начать раунд');
}

function prepareVisuals() {
    document.getElementById('game-message').classList.add('hidden');
    document.getElementById('current-multiplier').classList.remove('hidden');
    document.getElementById('rocket-element').classList.add('flying');
}

// === UI HELPERS ===

function setButton(type, titleText, subText) {
    const btn = document.getElementById('main-btn');
    const title = btn.querySelector('.btn-title');
    const sub = btn.querySelector('.btn-sub');
    
    btn.className = 'action-button'; // Сброс
    btn.disabled = false;
    
    if (type === 'bet') {
        btn.classList.add('btn-bet');
        btn.onclick = startRound;
    } else if (type === 'cashout') {
        btn.classList.add('btn-cashout');
        btn.onclick = cashOut;
    } else if (type === 'loading') {
        btn.classList.add('btn-loading');
        btn.disabled = true;
    } else if (type === 'disabled') {
        btn.classList.add('btn-bet'); // Визуально серая или красная
        btn.style.opacity = '0.5';
        btn.disabled = true;
    }
    
    title.innerText = titleText;
    sub.innerText = subText;
}

function showWinToast(amount) {
    const toast = document.getElementById('modal-win');
    document.getElementById('win-display-amount').innerText = amount;
    
    toast.classList.remove('hidden');
    if (game.timers.toast) clearTimeout(game.timers.toast);
    
    game.timers.toast = setTimeout(() => {
        toast.classList.add('hidden');
    }, 2000);
}

function updateBalanceUI(bal) {
    if (bal !== undefined) {
        appState.balance[appState.mode] = bal;
        localStorage.setItem('fastMoneyState', JSON.stringify(appState));
    }
    document.getElementById('balance-display').innerText = Math.floor(appState.balance[appState.mode]).toLocaleString();
}

// === INIT ===
document.addEventListener('DOMContentLoaded', () => {
    tg.ready(); tg.expand();
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    updateBalanceUI();
    forceReset();
    
    // Ставки
    document.getElementById('btn-inc').onclick = () => { if(game.status === 'IDLE') { game.betAmount+=100; document.getElementById('bet-amount').innerText = game.betAmount; }};
    document.getElementById('btn-dec').onclick = () => { if(game.status === 'IDLE' && game.betAmount > 100) { game.betAmount-=100; document.getElementById('bet-amount').innerText = game.betAmount; }};
    
    // Модалки
    window.openInfoModal = () => document.getElementById('modal-info').classList.remove('hidden');
    window.closeInfoModal = () => document.getElementById('modal-info').classList.add('hidden');
});

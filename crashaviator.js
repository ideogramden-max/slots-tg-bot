const tg = window.Telegram.WebApp;

// 🔥 ВСТАВЬ ССЫЛКУ СЮДА!
const SERVER_URL = "https://alpha-firms-electronics-return.trycloudflare.com"; 

let appState = JSON.parse(localStorage.getItem('fastMoneyState')) || { balance: { real: 0, demo: 10000 }, mode: 'demo' };
let game = {
    bet: 100,
    active: false,
    startTime: 0,
    growthSpeed: 0.0006,
    timer: null
};

// Canvas
const canvas = document.getElementById('crash-canvas');
const ctx = canvas.getContext('2d');
canvas.width = document.querySelector('.graph-container').offsetWidth;
canvas.height = document.querySelector('.graph-container').offsetHeight;

// === ГЛАВНАЯ ЛОГИКА ===

// 1. НАЖАТИЕ КНОПКИ
document.getElementById('main-btn').onclick = async () => {
    const btn = document.getElementById('main-btn');
    
    // Если игра не идет -> СТАВКА
    if (!game.active) {
        // Проверка баланса
        if (appState.balance[appState.mode] < game.bet) {
            alert("Недостаточно средств");
            return;
        }
        
        // Визуал загрузки
        btn.disabled = true;
        btn.querySelector('.btn-title').innerText = "ЗАГРУЗКА...";
        
        const userId = tg.initDataUnsafe.user ? tg.initDataUnsafe.user.id : 12345; // 12345 для теста в браузере

        try {
            // Запрос на старт
            const res = await fetch(`${SERVER_URL}/api/crash/bet`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ user_id: userId, amount: game.bet, mode: appState.mode })
            });
            const data = await res.json();
            
            if (data.error) throw new Error(data.error);

            // УСПЕХ: Игра началась
            game.active = true;
            game.startTime = data.server_time * 1000;
            
            // Обновляем баланс
            updateBalance(data.balance);
            
            // Меняем кнопку на ЗАБРАТЬ
            btn.disabled = false;
            btn.className = "action-button btn-cashout"; // Желтая
            btn.querySelector('.btn-title').innerText = "ЗАБРАТЬ";
            btn.querySelector('.btn-sub').innerText = "Пока не упало";

            // Запускаем анимацию
            startAnimation();
            startPolling(userId);

        } catch (e) {
            alert("Ошибка старта: " + e.message);
            resetUI();
        }
    } 
    // Если игра идет -> ЗАБРАТЬ
    else {
        // Блокируем, чтобы не нажать дважды
        btn.disabled = true;
        btn.querySelector('.btn-title').innerText = "ЗАПРОС...";
        
        const userId = tg.initDataUnsafe.user ? tg.initDataUnsafe.user.id : 12345;

        try {
            const res = await fetch(`${SERVER_URL}/api/crash/cashout`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ user_id: userId })
            });
            const data = await res.json();

            if (data.status === 'won') {
                // ПОБЕДА
                game.active = false;
                updateBalance(data.balance);
                
                // Показываем тост
                document.getElementById('modal-win').classList.remove('hidden');
                document.getElementById('win-display-amount').innerText = data.win_amount;
                setTimeout(() => document.getElementById('modal-win').classList.add('hidden'), 2000);
                
                // Кнопка
                btn.className = "action-button btn-bet";
                btn.disabled = true; // Ждем ресета
                btn.querySelector('.btn-title').innerText = "ПОБЕДА";
                btn.querySelector('.btn-sub').innerText = `+${data.win_amount}`;
                
                setTimeout(resetUI, 3000); // Ресет через 3 сек
                
            } else {
                // ОПОЗДАЛ (Краш)
                doCrash(data.crash_point);
            }

        } catch (e) {
            console.error(e);
            // Если ошибка сети при выводе - пробуем разблокировать кнопку
            btn.disabled = false;
            btn.querySelector('.btn-title').innerText = "ЗАБРАТЬ";
        }
    }
};

// 2. АНИМАЦИЯ И ОПРОС
function startAnimation() {
    // Скрываем сообщения, показываем цифры
    document.getElementById('game-message').classList.add('hidden');
    document.getElementById('current-multiplier').classList.remove('hidden');
    document.getElementById('rocket-element').classList.add('flying');
    
    game.timer = requestAnimationFrame(loop);
}

function loop() {
    if (!game.active) return;
    
    const elapsed = Date.now() - game.startTime;
    const mult = Math.exp(elapsed * CONFIG.growthSpeed); // Упрощенная формула e^(t)
    
    document.getElementById('current-multiplier').innerText = mult.toFixed(2) + 'x';
    
    // Тут код отрисовки Canvas (сокращенно, возьми из прошлого, если надо красиво)
    // Для теста главное - цифры и кнопка.
    
    requestAnimationFrame(loop);
}

function startPolling(userId) {
    const poll = setInterval(async () => {
        if (!game.active) { clearInterval(poll); return; }
        
        try {
            const res = await fetch(`${SERVER_URL}/api/crash/status`, {
                method: 'POST', body: JSON.stringify({user_id: userId})
            });
            const data = await res.json();
            if (data.status === 'crashed') {
                clearInterval(poll);
                doCrash(data.crash_point);
            }
        } catch(e) {}
    }, 1000);
}

function doCrash(point) {
    game.active = false;
    cancelAnimationFrame(game.timer);
    
    document.getElementById('current-multiplier').innerText = point.toFixed(2) + 'x';
    document.getElementById('current-multiplier').style.color = 'red';
    document.getElementById('crash-msg').classList.remove('hidden');
    document.getElementById('rocket-element').classList.remove('flying');
    
    const btn = document.getElementById('main-btn');
    btn.className = "action-button btn-bet";
    btn.disabled = true;
    btn.querySelector('.btn-title').innerText = "КРАШ";
    
    // Добавляем в историю
    const hist = document.getElementById('history-container');
    const badge = document.createElement('div');
    badge.className = `badge ${point < 1.2 ? 'red' : 'green'}`;
    badge.innerText = point.toFixed(2) + 'x';
    hist.prepend(badge);

    setTimeout(resetUI, 3000);
}

function resetUI() {
    game.active = false;
    
    document.getElementById('crash-msg').classList.add('hidden');
    document.getElementById('game-message').classList.remove('hidden');
    document.getElementById('current-multiplier').classList.add('hidden');
    document.getElementById('current-multiplier').style.color = 'white';
    
    const btn = document.getElementById('main-btn');
    btn.className = "action-button btn-bet"; // Зеленая
    btn.disabled = false;
    btn.style.opacity = '1';
    btn.querySelector('.btn-title').innerText = "ПОСТАВИТЬ";
    btn.querySelector('.btn-sub').innerText = "Начать раунд";
}

// Ставки
document.getElementById('btn-inc').onclick = () => { game.bet += 100; updateBetUI(); };
document.getElementById('btn-dec').onclick = () => { if(game.bet>100) game.bet -= 100; updateBetUI(); };
function updateBetUI() { document.getElementById('bet-amount').innerText = game.bet; }

function updateBalanceUI(bal) {
    if (bal !== undefined) {
        appState.balance[appState.mode] = bal;
        localStorage.setItem('fastMoneyState', JSON.stringify(appState));
    }
    document.getElementById('balance-display').innerText = Math.floor(appState.balance[appState.mode]);
}

// Инит
updateBalanceUI();
updateBetUI();

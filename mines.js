/**
 * FASTMONEY - MINES (Server-Side Logic)
 */

const tg = window.Telegram.WebApp;

const CONFIG = {
    // Адрес твоего сервера
    SERVER_URL: "https://alpha-firms-electronics-return.trycloudflare.com", 
    gridSize: 25
};

let appState = JSON.parse(localStorage.getItem('fastMoneyState')) || { balance: { real: 0, demo: 10000 }, mode: 'demo' };
let game = { isPlaying: false, minesCount: 3, bet: 100 };

// === GAMEPLAY ===

async function startGame() {
    if (game.isPlaying) return;
    const userId = tg.initDataUnsafe.user ? tg.initDataUnsafe.user.id : 0;

    if (appState.balance[appState.mode] < game.bet) {
        alert("Недостаточно средств");
        return;
    }

    try {
        const response = await fetch(`${CONFIG.SERVER_URL}/api/mines/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: userId,
                bet: game.bet,
                mines: game.minesCount,
                mode: appState.mode
            })
        });
        const data = await response.json();
        
        if (data.error) throw new Error(data.error);

        // Успех
        game.isPlaying = true;
        updateBalanceUI(data.balance);
        
        // Сброс UI
        initGrid();
        document.getElementById('grid-overlay').classList.add('hidden');
        document.getElementById('settings-area').classList.add('collapsed');
        updateMainBtn('cashout', game.bet); // Сначала сумма равна ставке

    } catch (e) {
        alert("Ошибка: " + e.message);
    }
}

async function handleTileClick(index, tileEl) {
    if (!game.isPlaying || tileEl.classList.contains('revealed')) return;
    const userId = tg.initDataUnsafe.user.id;

    try {
        const response = await fetch(`${CONFIG.SERVER_URL}/api/mines/click`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId, index: index })
        });
        const data = await response.json();

        if (data.status === 'gem') {
            // АЛМАЗ
            tileEl.classList.add('revealed', 'gem');
            tileEl.innerHTML = '<i class="fa-regular fa-gem"></i>';
            document.getElementById('current-multiplier').innerText = data.multiplier.toFixed(2) + 'x';
            
            // Обновляем кнопку вывода
            const win = Math.floor(game.bet * data.multiplier);
            updateMainBtn('cashout', win);
            
            playSound('gem');
            tg.HapticFeedback.impactOccurred('light');
        } 
        else if (data.status === 'boom') {
            // ВЗРЫВ
            game.isPlaying = false;
            tileEl.classList.add('revealed', 'bomb');
            tileEl.innerHTML = '<i class="fa-solid fa-bomb"></i>';
            
            // Показываем остальные
            revealMines(data.mines, index);
            
            playSound('bomb');
            tg.HapticFeedback.notificationOccurred('error');
            
            setTimeout(() => document.getElementById('modal-loss').classList.remove('hidden'), 1000);
            resetUI();
        }

    } catch (e) {
        console.error(e);
    }
}

async function cashOut() {
    if (!game.isPlaying) return;
    const userId = tg.initDataUnsafe.user.id;

    try {
        const response = await fetch(`${CONFIG.SERVER_URL}/api/mines/cashout`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId })
        });
        const data = await response.json();

        game.isPlaying = false;
        updateBalanceUI(data.balance);
        
        document.getElementById('win-amount').innerText = data.win;
        document.getElementById('modal-win').classList.remove('hidden');
        
        playSound('win');
        tg.HapticFeedback.notificationOccurred('success');
        resetUI();

    } catch (e) {
        console.error(e);
    }
}

// === UI UTILS ===

function initGrid() {
    const grid = document.getElementById('mines-grid');
    grid.innerHTML = '';
    for (let i = 0; i < 25; i++) {
        const t = document.createElement('div');
        t.className = 'tile';
        t.onclick = () => handleTileClick(i, t);
        grid.appendChild(t);
    }
}

function revealMines(mines, triggerIdx) {
    const tiles = document.querySelectorAll('.tile');
    mines.forEach(idx => {
        if (idx !== triggerIdx) {
            tiles[idx].classList.add('revealed', 'bomb', 'faded');
            tiles[idx].innerHTML = '<i class="fa-solid fa-bomb"></i>';
        }
    });
}

function updateMainBtn(state, amount) {
    const btn = document.getElementById('main-btn');
    const sub = btn.querySelector('.btn-sub');
    
    if (state === 'cashout') {
        btn.classList.add('cashout');
        btn.querySelector('.btn-text').innerText = "ЗАБРАТЬ";
        sub.innerText = amount + " $";
        btn.onclick = cashOut;
    } else {
        btn.classList.remove('cashout');
        btn.querySelector('.btn-text').innerText = "ИГРАТЬ";
        sub.innerText = "Начать раунд";
        btn.onclick = startGame;
    }
}

function resetUI() {
    // Возвращаем кнопку и настройки с задержкой
    updateMainBtn('start');
    document.getElementById('grid-overlay').classList.remove('hidden');
    document.getElementById('settings-area').classList.remove('collapsed');
}

function updateBalanceUI(bal) {
    if (bal !== undefined) {
        appState.balance[appState.mode] = bal;
        localStorage.setItem('fastMoneyState', JSON.stringify(appState));
    }
    document.getElementById('balance-display').innerText = Math.floor(appState.balance[appState.mode]).toLocaleString();
}

function playSound(id) {
    const el = document.getElementById('snd-' + id);
    if(el) { el.currentTime=0; el.play().catch(()=>{}); }
}

// Инит
document.addEventListener('DOMContentLoaded', () => {
    tg.ready(); tg.expand();
    updateBalanceUI();
    initGrid();
    
    window.setMines = (n) => { if(!game.isPlaying) game.minesCount = n; };
    document.getElementById('btn-inc').onclick = () => { if(game.bet<50000) game.bet+=100; document.getElementById('bet-amount').innerText=game.bet; };
    document.getElementById('btn-dec').onclick = () => { if(game.bet>100) game.bet-=100; document.getElementById('bet-amount').innerText=game.bet; };
    
    window.closeWinModal = () => document.getElementById('modal-win').classList.add('hidden');
    window.closeLossModal = () => document.getElementById('modal-loss').classList.add('hidden');
});

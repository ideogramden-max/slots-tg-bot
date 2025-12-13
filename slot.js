/**
 * FASTMONEY - SLOT MACHINE (Server-Side Logic)
 */

const tg = window.Telegram.WebApp;

const CONFIG = {
    // Адрес твоего сервера
    SERVER_URL: "https://alpha-firms-electronics-return.trycloudflare.com", 
    symbolHeight: 80,
    spinDuration: 2000,
    reelDelay: 300
};

const SYMBOLS = [
    { id: 0, icon: '7️⃣' },
    { id: 1, icon: '💎' },
    { id: 2, icon: '🔔' },
    { id: 3, icon: '🍇' },
    { id: 4, icon: '🍋' },
    { id: 5, icon: '🍒' }
];

let appState = JSON.parse(localStorage.getItem('fastMoneyState')) || { balance: { real: 0, demo: 10000 }, mode: 'demo' };
let game = { bet: 100, isSpinning: false, autoSpin: false };

// === UI ===
const UI = {
    balance: document.getElementById('balance-display'),
    updateBalance(newBal) {
        if (newBal !== undefined) appState.balance[appState.mode] = newBal;
        this.balance.innerText = Math.floor(appState.balance[appState.mode]).toLocaleString();
    },
    setStatus(msg, type) {
        const el = document.getElementById('status-text');
        el.innerText = msg;
        el.className = 'status-message ' + (type || '');
    },
    lock(locked) {
        document.getElementById('spin-btn').disabled = locked;
        document.querySelector('.back-btn').style.pointerEvents = locked ? 'none' : 'auto';
    }
};

// === REEL CLASS ===
class Reel {
    constructor(id, index) {
        this.el = document.getElementById(id);
        this.index = index;
        this.init();
    }
    init() {
        let h = '';
        for(let i=0; i<3; i++) h+=`<div class="sym">${this.getRandomIcon()}</div>`;
        this.el.innerHTML = h;
    }
    getRandomIcon() { return SYMBOLS[Math.floor(Math.random()*SYMBOLS.length)].icon; }
    
    async spin(targetId) {
        const targetSym = SYMBOLS.find(s => s.id === targetId);
        
        const frag = document.createDocumentFragment();
        for(let i=0; i<15; i++) {
            const div = document.createElement('div');
            div.className = 'sym';
            div.innerText = this.getRandomIcon();
            frag.appendChild(div);
        }
        
        const tDiv = document.createElement('div');
        tDiv.className = 'sym';
        tDiv.innerText = targetSym.icon;
        frag.appendChild(tDiv);
        
        const bDiv = document.createElement('div');
        bDiv.className = 'sym';
        bDiv.innerText = this.getRandomIcon();
        frag.appendChild(bDiv);
        
        this.el.innerHTML = '';
        this.el.appendChild(frag);
        
        const finalY = -((15 * CONFIG.symbolHeight) - CONFIG.symbolHeight);
        this.el.style.transition = 'none';
        this.el.style.transform = 'translateY(0px)';
        this.el.offsetHeight; 
        
        const duration = CONFIG.spinDuration + (this.index * CONFIG.reelDelay);
        this.el.style.transition = `transform ${duration}ms cubic-bezier(0.25, 1, 0.5, 1)`;
        this.el.style.transform = `translateY(${finalY}px)`;
        
        return new Promise(r => setTimeout(r, duration));
    }
}
const reels = [new Reel('reel-1', 0), new Reel('reel-2', 1), new Reel('reel-3', 2)];

// === GAME LOGIC ===

async function startGame() {
    if (game.isSpinning) return;
    
    const userId = tg.initDataUnsafe.user ? tg.initDataUnsafe.user.id : 0;
    if (appState.balance[appState.mode] < game.bet) {
        UI.setStatus("НЕТ ДЕНЕГ", "error");
        game.autoSpin = false;
        document.getElementById('auto-toggle').checked = false;
        return;
    }

    game.isSpinning = true;
    UI.lock(true);
    UI.setStatus("УДАЧИ! 🍀");
    
    // 1. Отправка запроса на сервер
    try {
        const response = await fetch(`${CONFIG.SERVER_URL}/api/slot/spin`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: userId,
                bet: game.bet,
                mode: appState.mode
            })
        });
        
        const data = await response.json();
        if (data.error) throw new Error(data.error);

        // 2. Списываем визуально
        UI.updateBalance(appState.balance[appState.mode] - game.bet);

        // 3. Крутим барабаны
        const promises = reels.map((r, i) => r.spin(data.result[i]));
        
        const audio = document.getElementById('snd-spin');
        if(audio) { audio.currentTime=0; audio.play().catch(()=>{}); }
        tg.HapticFeedback.impactOccurred('medium');

        await Promise.all(promises);
        
        // 4. Завершение
        if (data.is_win) {
            UI.setStatus(`ВЫИГРЫШ: +${data.win}`, "win");
            tg.HapticFeedback.notificationOccurred('success');
            if (data.win >= game.bet * 10) showBigWin(data.win);
        } else {
            UI.setStatus("ПУСТО...", "normal");
        }
        
        UI.updateBalance(data.balance);
        localStorage.setItem('fastMoneyState', JSON.stringify(appState));

    } catch (e) {
        console.error(e);
        UI.setStatus("ОШИБКА СЕТИ", "error");
    }

    game.isSpinning = false;
    UI.lock(false);
    
    if (game.autoSpin) setTimeout(startGame, 1000);
}

// === UTILS ===
document.addEventListener('DOMContentLoaded', () => {
    tg.ready(); tg.expand();
    UI.updateBalance();
    
    document.getElementById('spin-btn').onclick = startGame;
    document.getElementById('btn-max').onclick = () => { game.bet = 1000; document.getElementById('bet-amount').innerText=1000; };
    document.getElementById('btn-inc').onclick = () => { if(game.bet<5000) game.bet+=100; document.getElementById('bet-amount').innerText=game.bet; };
    document.getElementById('btn-dec').onclick = () => { if(game.bet>100) game.bet-=100; document.getElementById('bet-amount').innerText=game.bet; };
    
    document.getElementById('auto-toggle').onchange = (e) => {
        game.autoSpin = e.target.checked;
        if(game.autoSpin && !game.isSpinning) startGame();
    };
});

function showBigWin(amount) {
    const m = document.getElementById('modal-win');
    document.getElementById('win-val').innerText = amount;
    m.classList.remove('hidden');
}
window.closeWinModal = () => document.getElementById('modal-win').classList.add('hidden');
window.openInfoModal = () => document.getElementById('modal-info').classList.remove('hidden');
window.closeInfoModal = () => document.getElementById('modal-info').classList.add('hidden');

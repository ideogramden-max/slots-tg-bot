/**
 * FASTMONEY 2.0 — ULTIMATE ENGINE
 * Версия: 3.0 (SPA Architecture)
 */

const tg = window.Telegram.WebApp;

// === 1. ГЛОБАЛЬНЫЕ НАСТРОЙКИ ===
const CONFIG = {
    initialBalance: 10000,
    symbolHeight: 80, 
    totalSymbols: 6, 
    spinDuration: 2000,
    reelDelay: 300,
    winProbabilities: {
        jackpot: 0.05, 
        pair: 0.30,
        loss: 0.65 
    }
};

const SYMBOLS = [
    { id: 0, icon: '7️⃣', multiplier: 50, type: 'jackpot' },
    { id: 1, icon: '💎', multiplier: 25, type: 'high' },
    { id: 2, icon: '🔔', multiplier: 10, type: 'mid' },
    { id: 3, icon: '🍇', multiplier: 5,  type: 'low' },
    { id: 4, icon: '🍋', multiplier: 3,  type: 'low' },
    { id: 5, icon: '🍒', multiplier: 2,  type: 'low' }
];

// === 2. СОСТОЯНИЕ (STATE) ===
let state = {
    balance: CONFIG.initialBalance,
    bet: 100,
    isSpinning: false,
    autoSpin: false,
    // Новое: статистика
    user: {
        id: '000000',
        name: 'Guest',
        spins: 0,
        wins: 0,
        maxWin: 0
    }
};

// === 3. ЗВУКИ ===
class SoundManager {
    constructor() {
        this.muted = false;
        this.sounds = {
            click: document.getElementById('snd-click'),
            spin: document.getElementById('snd-spin'),
            win: document.getElementById('snd-win'),
            jackpot: document.getElementById('snd-jackpot')
        };
    }

    play(name) {
        if (this.muted) return;
        try {
            if (this.sounds[name]) {
                this.sounds[name].currentTime = 0;
                this.sounds[name].play().catch(() => {});
            }
        } catch (e) { console.warn('Audio error:', e); }
    }
}
const audio = new SoundManager();

// === 4. UI КОНТРОЛЛЕР (Обновленный) ===
const UI = {
    // Элементы игры
    balanceGame: document.getElementById('balance-display'),
    balanceMenu: document.getElementById('menu-balance'), // Баланс в меню
    bet: document.getElementById('current-bet'),
    status: document.getElementById('game-status'),
    spinBtn: document.getElementById('spin-btn'),
    jackpot: document.getElementById('jackpot-counter'),
    
    // Обновление баланса ВЕЗДЕ
    updateBalance(amount) {
        // Анимация в игре
        this.animateValue(this.balanceGame, parseInt(this.balanceGame.innerText.replace(/,/g, '')), amount);
        // Анимация в меню
        this.animateValue(this.balanceMenu, parseInt(this.balanceMenu.innerText.replace(/,/g, '') || 0), amount);
    },

    animateValue(element, start, end) {
        if (!element) return;
        const duration = 1000;
        const startTime = performance.now();
        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const ease = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
            
            const currentVal = Math.floor(start + (end - start) * ease);
            element.innerText = currentVal.toLocaleString();

            if (progress < 1) requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);
    },

    setStatus(text, type = 'normal') {
        if (!this.status) return;
        this.status.innerHTML = text;
        this.status.className = 'typewriter-text';
        if (type === 'win') this.status.classList.add('glow-text');
        if (type === 'error') this.status.style.color = '#ff4444';
    },

    lock(locked) {
        if (!this.spinBtn) return;
        this.spinBtn.disabled = locked;
        document.getElementById('btn-dec-bet').disabled = locked;
        document.getElementById('btn-inc-bet').disabled = locked;
        document.getElementById('btn-max-bet').disabled = locked;
        this.spinBtn.style.opacity = locked ? '0.7' : '1';
        
        // Блокируем кнопку выхода во время спина
        const exitBtn = document.querySelector('.btn-exit-game');
        if (exitBtn) exitBtn.style.pointerEvents = locked ? 'none' : 'auto';
        if (exitBtn) exitBtn.style.opacity = locked ? '0.5' : '1';
    }
};

// === 5. НАВИГАЦИЯ (SPA SYSTEM) ===
window.showScreen = function(screenId) {
    audio.play('click');
    tg.HapticFeedback.impactOccurred('light');

    // Скрываем все экраны
    document.querySelectorAll('.screen').forEach(scr => {
        scr.classList.add('hidden');
    });

    // Показываем нужный
    const target = document.getElementById(screenId);
    if (target) {
        target.classList.remove('hidden');
        // Скролл вверх
        target.scrollTop = 0;
    }
};

// === 6. МОДАЛЬНЫЕ ОКНА (Новые + Старые) ===
window.openModal = function(modalId) {
    const el = document.getElementById(modalId);
    if (el) el.classList.remove('hidden');
    audio.play('click');
};

window.closeModal = function(modalId) {
    const el = document.getElementById(modalId);
    if (el) el.classList.add('hidden');
};

// Алиасы для кнопок меню
window.openProfileModal = () => window.openModal('modal-stats'); // Профиль теперь тут
window.openWalletModal = () => window.openModal('modal-wallet');
window.openReferralModal = () => window.openModal('modal-refs');
window.openStatsModal = () => window.openModal('modal-stats'); // Дубликат для наглядности

// Старые функции для совместимости с HTML
window.openDepositModal = window.openWalletModal;
window.openInfoModal = () => window.openModal('modal-info');
window.closeInfoModal = () => window.closeModal('modal-info');
window.closeWinModal = () => window.closeModal('modal-win');

// === 7. СИСТЕМНАЯ ЛОГИКА (Бонусы, Рефы) ===

window.claimDailyBonus = function() {
    const btn = document.querySelector('.btn-claim');
    if (btn.disabled) return;

    audio.play('jackpot'); // Звук успеха
    tg.HapticFeedback.notificationOccurred('success');
    
    state.balance += 500;
    UI.updateBalance(state.balance);
    
    btn.disabled = true;
    btn.innerText = "ЗАБРАНО ✅";
    btn.style.background = "#555";
    
    // Всплывашка Телеграм
    tg.showPopup({
        title: 'Daily Bonus',
        message: 'Вам начислено +500 ₮! Приходите завтра.',
        buttons: [{type: 'ok'}]
    });
};

window.copyRef = function() {
    const input = document.getElementById('ref-link-input');
    input.select();
    input.setSelectionRange(0, 99999); // Для мобилок
    
    navigator.clipboard.writeText(input.value).then(() => {
        tg.HapticFeedback.notificationOccurred('success');
        const btn = document.querySelector('.ref-link-box button');
        const oldText = btn.innerText;
        btn.innerText = "COPIED!";
        setTimeout(() => btn.innerText = oldText, 2000);
    });
};

function updateStatsUI() {
    document.getElementById('stat-games').innerText = state.user.spins;
    document.getElementById('stat-wins').innerText = state.user.wins;
    document.getElementById('stat-max').innerText = state.user.maxWin.toLocaleString();
}

// === 8. ЛОГИКА СЛОТОВ (REELS ENGINE) ===
// (Полностью сохранена старая логика)

class Reel {
    constructor(elementId, index) {
        this.el = document.getElementById(elementId);
        this.index = index;
        this.initStrip();
    }

    initStrip() {
        let html = '';
        for (let i = 0; i < 20; i++) {
            html += `<div class="symbol">${this.getRandomSymbol().icon}</div>`;
        }
        this.el.innerHTML = html;
    }

    getRandomSymbol() {
        return SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
    }

    async spin(targetSymbolId) {
        const targetSym = SYMBOLS.find(s => s.id === targetSymbolId);
        const fragment = document.createDocumentFragment();
        
        for(let i=0; i < 15; i++) {
            const div = document.createElement('div');
            div.className = 'symbol';
            div.innerText = this.getRandomSymbol().icon;
            fragment.appendChild(div);
        }
        
        const targetDiv = document.createElement('div');
        targetDiv.className = 'symbol';
        targetDiv.innerText = targetSym.icon;
        fragment.appendChild(targetDiv);
        
        const lastDiv = document.createElement('div');
        lastDiv.className = 'symbol';
        lastDiv.innerText = this.getRandomSymbol().icon;
        fragment.appendChild(lastDiv);

        this.el.innerHTML = ''; 
        this.el.appendChild(fragment);

        const finalPosition = -((15 * CONFIG.symbolHeight) - 80);

        this.el.style.transition = 'none';
        this.el.style.transform = 'translateY(0px)';
        this.el.style.filter = 'blur(0px)';
        this.el.offsetHeight; // Force reflow

        const duration = CONFIG.spinDuration + (this.index * CONFIG.reelDelay);
        
        this.el.style.transition = `transform ${duration}ms cubic-bezier(0.15, 0.9, 0.3, 1.1), filter ${duration/2}ms ease`;
        this.el.style.transform = `translateY(${finalPosition}px)`;
        this.el.style.filter = 'blur(2px)';

        setTimeout(() => { this.el.style.filter = 'blur(0px)'; }, duration - 300);

        return new Promise(resolve => {
            setTimeout(() => {
                tg.HapticFeedback.impactOccurred('light'); 
                resolve(targetSym);
            }, duration);
        });
    }
}

const reels = [
    new Reel('reel-1', 0),
    new Reel('reel-2', 1),
    new Reel('reel-3', 2)
];

function determineResult() {
    const r = Math.random();
    let resultType = 'loss';
    
    if (r < CONFIG.winProbabilities.jackpot) resultType = 'jackpot';
    else if (r < CONFIG.winProbabilities.jackpot + CONFIG.winProbabilities.pair) resultType = 'pair';
    
    let resIds = [];

    if (resultType === 'jackpot') {
        const sym = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)].id;
        resIds = [sym, sym, sym];
    } else if (resultType === 'pair') {
        const sym = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)].id;
        const other = (sym + 1) % SYMBOLS.length;
        const pattern = Math.random();
        if (pattern < 0.33) resIds = [sym, sym, other];
        else if (pattern < 0.66) resIds = [sym, other, sym];
        else resIds = [other, sym, sym];
    } else {
        const s1 = Math.floor(Math.random() * SYMBOLS.length);
        let s2 = Math.floor(Math.random() * SYMBOLS.length);
        while(s1 === s2) s2 = Math.floor(Math.random() * SYMBOLS.length);
        let s3 = Math.floor(Math.random() * SYMBOLS.length);
        while(s3 === s1 || s3 === s2) s3 = Math.floor(Math.random() * SYMBOLS.length);
        resIds = [s1, s2, s3];
    }

    return { type: resultType, symbols: resIds };
}

async function startGame() {
    if (state.isSpinning) return;
    if (state.balance < state.bet) {
        UI.setStatus("НЕТ СРЕДСТВ ⛔", "error");
        tg.HapticFeedback.notificationOccurred('error');
        window.openWalletModal();
        document.getElementById('auto-spin-toggle').checked = false;
        state.autoSpin = false;
        return;
    }

    state.isSpinning = true;
    UI.lock(true);
    
    state.balance -= state.bet;
    UI.updateBalance(state.balance);
    UI.setStatus("GOOD LUCK! 🍀");
    
    audio.play('spin');
    tg.HapticFeedback.impactOccurred('medium');

    const result = determineResult();
    
    document.getElementById('payline-center').classList.remove('visible');

    const promises = reels.map((reel, i) => reel.spin(result.symbols[i]));
    await Promise.all(promises);

    handleWin(result.symbols);
}

function handleWin(resultIds) {
    const s1 = SYMBOLS.find(s => s.id === resultIds[0]);
    const s2 = SYMBOLS.find(s => s.id === resultIds[1]);
    const s3 = SYMBOLS.find(s => s.id === resultIds[2]);

    let winAmount = 0;
    
    // Обновляем статистику
    state.user.spins++;

    if (s1.id === s2.id && s2.id === s3.id) {
        // JACKPOT
        winAmount = state.bet * s1.multiplier;
        showBigWin(winAmount);
        document.getElementById('payline-center').classList.add('visible');
        state.user.wins++;
    } else if (s1.id === s2.id || s2.id === s3.id || s1.id === s3.id) {
        // PAIR
        const matchSym = (s1.id === s2.id) ? s1 : (s2.id === s3.id ? s2 : s1);
        winAmount = Math.floor(state.bet * (matchSym.multiplier * 0.3));
        if (winAmount < state.bet) winAmount = state.bet; 
        
        UI.setStatus(`MINI WIN: +${winAmount} ₮`, "win");
        state.balance += winAmount;
        UI.updateBalance(state.balance);
        tg.HapticFeedback.notificationOccurred('success');
        audio.play('win');
        state.user.wins++;
    } else {
        UI.setStatus("ПОПРОБУЙ ЕЩЕ...", "normal");
    }

    if (winAmount > state.user.maxWin) state.user.maxWin = winAmount;
    updateStatsUI();

    state.isSpinning = false;
    UI.lock(false);

    if (state.autoSpin) {
        setTimeout(startGame, 1500);
    }
}

function showBigWin(amount) {
    const modal = document.getElementById('modal-win');
    const display = document.getElementById('win-display');
    
    display.innerText = amount.toLocaleString();
    modal.classList.remove('hidden');
    
    state.balance += amount;
    UI.updateBalance(state.balance);
    
    audio.play('jackpot');
    tg.HapticFeedback.notificationOccurred('success');
    
    startConfetti();
}

// === 9. ЭФФЕКТЫ (Background) ===
function initBackground() {
    const canvas = document.getElementById('bg-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let width, height, particles = [];

    function resize() {
        width = window.innerWidth;
        height = window.innerHeight;
        canvas.width = width;
        canvas.height = height;
    }
    window.addEventListener('resize', resize);
    resize();

    class Particle {
        constructor() {
            this.reset();
        }
        reset() {
            this.x = Math.random() * width;
            this.y = Math.random() * height;
            this.vx = (Math.random() - 0.5) * 0.5;
            this.vy = (Math.random() - 0.5) * 0.5;
            this.size = Math.random() * 2;
            this.alpha = Math.random() * 0.5 + 0.1;
        }
        update() {
            this.x += this.vx;
            this.y += this.vy;
            if (this.x < 0 || this.x > width || this.y < 0 || this.y > height) this.reset();
        }
        draw() {
            ctx.fillStyle = `rgba(0, 243, 255, ${this.alpha})`;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    for (let i = 0; i < 40; i++) particles.push(new Particle());
    function animate() {
        ctx.clearRect(0, 0, width, height);
        particles.forEach(p => { p.update(); p.draw(); });
        requestAnimationFrame(animate);
    }
    animate();
}

// Повтор конфетти для полной картины
function startConfetti() {
    const container = document.getElementById('confetti-canvas');
    container.innerHTML = '';
    const colors = ['#ff0055', '#00f3ff', '#ffd700', '#ffffff'];
    for (let i = 0; i < 80; i++) {
        const conf = document.createElement('div');
        conf.className = 'confetti-piece';
        conf.style.left = Math.random() * 100 + '%';
        conf.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        conf.style.animationDuration = (Math.random() * 3 + 2) + 's';
        conf.style.animationDelay = (Math.random() * 2) + 's';
        container.appendChild(conf);
    }
}

// === 10. ЗАПУСК ПРИЛОЖЕНИЯ ===
window.addEventListener('DOMContentLoaded', () => {
    // 1. Инит телеграм
    tg.ready();
    tg.expand();
    tg.enableClosingConfirmation();
    document.documentElement.style.setProperty('--tg-theme-bg', tg.themeParams.bg_color);

    // 2. Данные пользователя
    const user = tg.initDataUnsafe.user;
    if (user) {
        state.user.id = user.id;
        state.user.name = user.first_name;
        
        // Заполняем в меню
        document.getElementById('menu-username').innerText = user.first_name;
        document.getElementById('menu-userid').innerText = user.id;
        
        // Генерируем реф ссылку
        document.getElementById('ref-link-input').value = `https://t.me/fastmoneytwo_bot?start=${user.id}`;
    }

    // Инит баланса в UI
    UI.updateBalance(state.balance);
    initBackground();

    // 3. Снимаем прелоадер и показываем МЕНЮ
    const preloader = document.getElementById('preloader');
    const progress = document.getElementById('loader-progress');
    
    setTimeout(() => { progress.style.width = '70%'; }, 200);
    setTimeout(() => { progress.style.width = '100%'; }, 500);
    setTimeout(() => { 
        preloader.style.opacity = '0'; 
        setTimeout(() => {
            preloader.style.display = 'none';
            // Показываем главное меню вместо игры
            document.getElementById('main-menu').classList.remove('hidden');
        }, 500);
    }, 1000);

    // 4. Бинды кнопок игры (Слоты)
    UI.spinBtn.addEventListener('click', startGame);
    
    document.getElementById('btn-inc-bet').addEventListener('click', () => {
        audio.play('click');
        if (state.bet < 1000) state.bet += 100;
        UI.bet.innerText = state.bet;
    });
    
    document.getElementById('btn-dec-bet').addEventListener('click', () => {
        audio.play('click');
        if (state.bet > 100) state.bet -= 100;
        UI.bet.innerText = state.bet;
    });

    document.getElementById('btn-max-bet').addEventListener('click', () => {
        audio.play('click');
        state.bet = 1000;
        UI.bet.innerText = state.bet;
    });

    document.getElementById('auto-spin-toggle').addEventListener('change', (e) => {
        state.autoSpin = e.target.checked;
        if (state.autoSpin && !state.isSpinning) startGame();
    });

    // Звук переключатель (В игре)
    // У нас нет звука в меню пока что, кнопка звука в HUD слотов
    const sndBtn = document.getElementById('sound-toggle');
    if(sndBtn) sndBtn.addEventListener('click', () => {
        audio.muted = !audio.muted;
        sndBtn.innerHTML = audio.muted ? '<i class="fa-solid fa-volume-xmark"></i>' : '<i class="fa-solid fa-volume-high"></i>';
    });

    // Джекпот бегущая строка
    setInterval(() => {
        let val = parseInt(UI.jackpot.innerText.replace(/,/g, ''));
        val += Math.floor(Math.random() * 50);
        UI.jackpot.innerText = val.toLocaleString();
    }, 3000);
});

// CSS для конфетти
const style = document.createElement('style');
style.innerHTML = `
.confetti-piece {
    position: absolute; width: 10px; height: 10px; top: -10px; opacity: 0.8;
    animation: fall linear forwards;
}
@keyframes fall { to { transform: translateY(100vh) rotate(720deg); } }
`;
document.head.appendChild(style);

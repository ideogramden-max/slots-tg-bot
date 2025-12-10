/**
 * FASTMONEY 2.0 — CORE ENGINE
 * Автор: AI Architect
 * Версия: 2.0.1 (Cyberpunk Update)
 */

const tg = window.Telegram.WebApp;

// === КОНФИГУРАЦИЯ ИГРЫ ===
const CONFIG = {
    initialBalance: 10000,
    symbolHeight: 80, // Должно совпадать с CSS .symbol height
    totalSymbols: 6,  // Количество уникальных символов
    spinDuration: 2000, // Базовая длительность спина (мс)
    reelDelay: 300,   // Задержка между остановкой барабанов
    winProbabilities: {
        jackpot: 0.05, // 5% шанс джекпота (3 одинаковых)
        pair: 0.30,    // 30% шанс пары (2 одинаковых)
        loss: 0.65     // 65% проигрыш
    }
};

// === СИМВОЛЫ И ВЫПЛАТЫ ===
// id: технический id, icon: эмодзи, weight: множитель
const SYMBOLS = [
    { id: 0, icon: '7️⃣', multiplier: 50, type: 'jackpot' },
    { id: 1, icon: '💎', multiplier: 25, type: 'high' },
    { id: 2, icon: '🔔', multiplier: 10, type: 'mid' },
    { id: 3, icon: '🍇', multiplier: 5,  type: 'low' },
    { id: 4, icon: '🍋', multiplier: 3,  type: 'low' },
    { id: 5, icon: '🍒', multiplier: 2,  type: 'low' }
];

// === СОСТОЯНИЕ ИГРЫ ===
let state = {
    balance: CONFIG.initialBalance,
    bet: 100,
    isSpinning: false,
    autoSpin: false
};

// === ЗВУКОВОЙ ДВИЖОК ===
class SoundManager {
    constructor() {
        this.muted = false;
        // Здесь можно подключить реальные файлы, если они есть
        this.sounds = {
            click: document.getElementById('snd-click'),
            spin: document.getElementById('snd-spin'),
            win: document.getElementById('snd-win'),
            jackpot: document.getElementById('snd-jackpot')
        };
    }

    play(name) {
        if (this.muted) return;
        // Эмуляция звука (в реальности нужны файлы)
        // Если файлы не загружены, код не упадет
        try {
            if (this.sounds[name]) {
                this.sounds[name].currentTime = 0;
                this.sounds[name].play().catch(() => {});
            }
        } catch (e) { console.log('Audio error:', e); }
    }

    toggle() {
        this.muted = !this.muted;
        const icon = document.getElementById('sound-toggle').querySelector('i');
        icon.className = this.muted ? 'fa-solid fa-volume-xmark' : 'fa-solid fa-volume-high';
    }
}
const audio = new SoundManager();

// === UI КОНТРОЛЛЕР ===
const UI = {
    balance: document.getElementById('balance-display'),
    bet: document.getElementById('current-bet'),
    status: document.getElementById('game-status'),
    spinBtn: document.getElementById('spin-btn'),
    jackpot: document.getElementById('jackpot-counter'),
    
    updateBalance(amount) {
        // Анимация "счетчика" (Odometer effect)
        const start = parseInt(this.balance.innerText.replace(/,/g, ''));
        const end = amount;
        const duration = 1000;
        const startTime = performance.now();

        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            // EaseOutExpo функция
            const ease = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
            
            const currentVal = Math.floor(start + (end - start) * ease);
            this.balance.innerText = currentVal.toLocaleString();

            if (progress < 1) requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);
    },

    setStatus(text, type = 'normal') {
        this.status.innerHTML = text;
        this.status.className = 'typewriter-text';
        if (type === 'win') this.status.classList.add('glow-text');
        if (type === 'error') this.status.style.color = 'red';
    },

    lock(locked) {
        this.spinBtn.disabled = locked;
        document.getElementById('btn-dec-bet').disabled = locked;
        document.getElementById('btn-inc-bet').disabled = locked;
        document.getElementById('btn-max-bet').disabled = locked;
        this.spinBtn.style.opacity = locked ? '0.7' : '1';
    }
};

// === ЛОГИКА СЛОТОВ (REELS ENGINE) ===
class Reel {
    constructor(elementId, index) {
        this.el = document.getElementById(elementId);
        this.index = index;
        this.symbolCount = 20; // Сколько символов в ленте прокрутки
        this.currentOffset = 0;
        this.initStrip();
    }

    initStrip() {
        // Генерируем начальную ленту символов
        let html = '';
        for (let i = 0; i < this.symbolCount; i++) {
            const sym = this.getRandomSymbol();
            html += `<div class="symbol">${sym.icon}</div>`;
        }
        this.el.innerHTML = html;
    }

    getRandomSymbol() {
        return SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
    }

    // Главная функция вращения
    async spin(targetSymbolId) {
        const extraRounds = 2 + this.index; // Каждый следующий барабан крутится дольше
        const targetSym = SYMBOLS.find(s => s.id === targetSymbolId);
        
        // 1. Подготовка: добавляем в конец ленты нужный символ
        // Мы добавляем блок символов, где целевой будет на нужной позиции
        // Чтобы анимация была гладкой, мы "удлиняем" ленту
        
        // Очищаем старую трансформацию, но сохраняем позицию (визуальный хак)
        // Для простоты в этой версии мы просто перегенерируем низ ленты
        
        const fragment = document.createDocumentFragment();
        // Добавляем "мусорные" символы для вращения
        for(let i=0; i < 15; i++) {
            const div = document.createElement('div');
            div.className = 'symbol';
            div.innerText = this.getRandomSymbol().icon;
            fragment.appendChild(div);
        }
        // Добавляем ЦЕЛЕВОЙ символ (он будет вторым с конца, чтобы центрироваться)
        const targetDiv = document.createElement('div');
        targetDiv.className = 'symbol';
        targetDiv.innerText = targetSym.icon;
        fragment.appendChild(targetDiv);
        
        // И еще один для страховки снизу
        const lastDiv = document.createElement('div');
        lastDiv.className = 'symbol';
        lastDiv.innerText = this.getRandomSymbol().icon;
        fragment.appendChild(lastDiv);

        this.el.innerHTML = ''; // Сброс (в реальном проде нужен виртуальный скролл)
        this.el.appendChild(fragment);

        // 2. Анимация (CSS Transition)
        // Высота символа 80px.
        // Мы хотим, чтобы целевой символ оказался посередине окна (высота окна 240px).
        // Центр окна = 120px. Центр символа = 40px. 
        // Позиция top = 120 - 40 = 80px.
        // Но так как у нас `transform: translateY`, мы двигаем ленту ВВЕРХ.
        // Целевой символ это (total - 2).
        
        const totalHeight = (15 + 1) * CONFIG.symbolHeight; // Высота до целевого
        // Смещение, чтобы целевой символ встал по центру видимой области (высота области 240, символ 80)
        // reel-window (240px). 
        // Видимая зона: 0-80 (верх), 80-160 (центр), 160-240 (низ).
        // Нам нужно, чтобы целевой символ попал в 80-160.
        // Значит transform должен сдвинуть ленту так, чтобы верх целевого символа был на Y=80 (относительно контейнера).
        
        // Сейчас целевой символ находится на Y = 15 * 80 = 1200px.
        // Нам нужно сдвинуть ленту на -1200 + 80 = -1120px.
        
        const finalPosition = -((15 * CONFIG.symbolHeight) - 80);

        // Сброс позиции в 0 (визуально незаметно, если символы те же)
        this.el.style.transition = 'none';
        this.el.style.transform = 'translateY(0px)';
        this.el.style.filter = 'blur(0px)';

        // Force reflow
        this.el.offsetHeight;

        // Запуск анимации
        const duration = CONFIG.spinDuration + (this.index * CONFIG.reelDelay);
        
        this.el.style.transition = `transform ${duration}ms cubic-bezier(0.15, 0.9, 0.3, 1.1), filter ${duration/2}ms ease`;
        this.el.style.transform = `translateY(${finalPosition}px)`;
        this.el.style.filter = 'blur(2px)'; // Блюр при движении

        // Убираем блюр в конце
        setTimeout(() => {
            this.el.style.filter = 'blur(0px)';
        }, duration - 300);

        // Ждем окончания
        return new Promise(resolve => {
            setTimeout(() => {
                // Вибрация при остановке барабана (Haptic)
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

// === ОСНОВНАЯ ЛОГИКА ИГРЫ ===

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
        // Пара может быть [A, A, B] или [A, B, A] или [B, A, A]
        const pattern = Math.random();
        if (pattern < 0.33) resIds = [sym, sym, other];
        else if (pattern < 0.66) resIds = [sym, other, sym];
        else resIds = [other, sym, sym];
    } else {
        // Гарантированный проигрыш (все разные)
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
        UI.setStatus("INSUFFICIENT FUNDS ⛔", "error");
        tg.HapticFeedback.notificationOccurred('error');
        openDepositModal(); // Предложить пополнить
        // Останавливаем авто-спин
        document.getElementById('auto-spin-toggle').checked = false;
        state.autoSpin = false;
        return;
    }

    state.isSpinning = true;
    UI.lock(true);
    
    // Списание ставки
    state.balance -= state.bet;
    UI.updateBalance(state.balance);
    UI.setStatus("GOOD LUCK! 🍀");
    
    audio.play('spin');
    tg.HapticFeedback.impactOccurred('medium');

    // Определяем результат ЗАРАНЕЕ (серверная логика)
    const result = determineResult();
    
    // Скрываем линию выигрыша
    document.getElementById('payline-center').classList.remove('visible');

    // Запускаем барабаны
    const promises = reels.map((reel, i) => reel.spin(result.symbols[i]));
    
    // Ждем, пока все остановятся
    await Promise.all(promises);

    // Обработка результата
    handleWin(result.symbols);
}

function handleWin(resultIds) {
    const s1 = SYMBOLS.find(s => s.id === resultIds[0]);
    const s2 = SYMBOLS.find(s => s.id === resultIds[1]);
    const s3 = SYMBOLS.find(s => s.id === resultIds[2]);

    let winAmount = 0;
    let isWin = false;

    // Логика подсчета (Center Line)
    if (s1.id === s2.id && s2.id === s3.id) {
        // JACKPOT (3 совпадения)
        winAmount = state.bet * s1.multiplier;
        isWin = true;
        showBigWin(winAmount);
        document.getElementById('payline-center').classList.add('visible');
    } else if (s1.id === s2.id || s2.id === s3.id || s1.id === s3.id) {
        // Пара (Mini win) - ищем совпадающий символ
        const matchSym = (s1.id === s2.id) ? s1 : (s2.id === s3.id ? s2 : s1);
        winAmount = Math.floor(state.bet * (matchSym.multiplier * 0.3)); // 30% от полной выплаты
        // Чтобы не было минуса, если множитель маленький
        if (winAmount < state.bet) winAmount = state.bet; 
        
        UI.setStatus(`MINI WIN: +${winAmount} ₮`, "win");
        state.balance += winAmount;
        UI.updateBalance(state.balance);
        tg.HapticFeedback.notificationOccurred('success');
        audio.play('win');
    } else {
        // Проигрыш
        UI.setStatus("TRY AGAIN...", "normal");
    }

    state.isSpinning = false;
    UI.lock(false);

    // Логика авто-спина
    if (state.autoSpin) {
        setTimeout(startGame, 1500);
    }
}

// === ЭФФЕКТЫ (Particles & Confetti) ===

function initBackground() {
    const canvas = document.getElementById('bg-canvas');
    const ctx = canvas.getContext('2d');
    let width, height;
    let particles = [];

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
            if (this.x < 0) this.x = width;
            if (this.x > width) this.x = 0;
            if (this.y < 0) this.y = height;
            if (this.y > height) this.y = 0;
        }
        draw() {
            ctx.fillStyle = `rgba(0, 243, 255, ${this.alpha})`;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    for (let i = 0; i < 50; i++) particles.push(new Particle());

    function animate() {
        ctx.clearRect(0, 0, width, height);
        particles.forEach(p => { p.update(); p.draw(); });
        requestAnimationFrame(animate);
    }
    animate();
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
    
    // Запуск конфетти
    startConfetti();
}

function startConfetti() {
    // Простая симуляция конфетти через CSS/JS создание элементов
    const container = document.getElementById('confetti-canvas');
    container.innerHTML = '';
    
    const colors = ['#ff0055', '#00f3ff', '#ffd700', '#ffffff'];
    
    for (let i = 0; i < 100; i++) {
        const conf = document.createElement('div');
        conf.className = 'confetti-piece';
        conf.style.left = Math.random() * 100 + '%';
        conf.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        conf.style.animationDuration = (Math.random() * 3 + 2) + 's';
        conf.style.animationDelay = (Math.random() * 2) + 's';
        container.appendChild(conf);
    }
}

// === ИНИЦИАЛИЗАЦИЯ И СОБЫТИЯ ===

window.addEventListener('DOMContentLoaded', () => {
    // 1. Настройка Telegram
    tg.ready();
    tg.expand();
    tg.enableClosingConfirmation(); // Спрашивать перед закрытием
    
    // Установка цветовой схемы под тему Телеграм
    document.documentElement.style.setProperty('--tg-theme-bg', tg.themeParams.bg_color);

    // Получение данных юзера
    const user = tg.initDataUnsafe.user;
    if (user) {
        document.getElementById('username').innerText = user.first_name;
        // Можно загрузить аватарку если есть, но API часто не дает ссылку
    }

    // 2. Инит фона
    initBackground();

    // 3. Убираем Preloader
    const preloader = document.getElementById('preloader');
    const progress = document.getElementById('loader-progress');
    
    // Фейковая загрузка
    setTimeout(() => { progress.style.width = '50%'; }, 200);
    setTimeout(() => { progress.style.width = '100%'; }, 500);
    setTimeout(() => { 
        preloader.style.opacity = '0'; 
        setTimeout(() => preloader.style.display = 'none', 500);
        document.getElementById('game-app').classList.add('visible');
        document.getElementById('game-app').classList.remove('hidden');
    }, 1000);

    // 4. Обработчики кнопок
    UI.spinBtn.addEventListener('click', startGame);

    // Ставки
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

    // Авто-игра
    document.getElementById('auto-spin-toggle').addEventListener('change', (e) => {
        state.autoSpin = e.target.checked;
        if (state.autoSpin && !state.isSpinning) startGame();
    });

    // Звук
    document.getElementById('sound-toggle').addEventListener('click', () => audio.toggle());

    // Обновляем джекпот (просто анимация чисел)
    setInterval(() => {
        let val = parseInt(UI.jackpot.innerText.replace(/,/g, ''));
        val += Math.floor(Math.random() * 50);
        UI.jackpot.innerText = val.toLocaleString();
    }, 3000);
});


// === УПРАВЛЕНИЕ МОДАЛКАМИ ===
window.openInfoModal = () => document.getElementById('modal-info').classList.remove('hidden');
window.closeInfoModal = () => document.getElementById('modal-info').classList.add('hidden');
window.closeWinModal = () => document.getElementById('modal-win').classList.add('hidden');

window.openDepositModal = () => {
    // В реальном приложении - инвойс
    tg.showPopup({
        title: 'Top Up Balance',
        message: 'This is a demo. We just added 5000 credits for you!',
        buttons: [{type: 'ok'}]
    }, () => {
        state.balance += 5000;
        UI.updateBalance(state.balance);
    });
};

// Добавляем стиль конфетти динамически
const style = document.createElement('style');
style.innerHTML = `
.confetti-piece {
    position: absolute;
    width: 10px; height: 10px;
    top: -10px;
    opacity: 0.8;
    animation: fall linear forwards;
}
@keyframes fall {
    to { transform: translateY(100vh) rotate(720deg); }
}
`;
document.head.appendChild(style);

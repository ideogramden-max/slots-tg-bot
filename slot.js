/**
 * FASTMONEY - SLOTS ENGINE
 * Профессиональная логика слота с интеграцией в экосистему
 */

const tg = window.Telegram.WebApp;

// === 1. КОНФИГУРАЦИЯ ИГРЫ ===
const CONFIG = {
    symbolHeight: 80,  // Высота одного символа (должна совпадать с CSS)
    spinDuration: 2000, // Время вращения (мс)
    reelDelay: 300,    // Задержка между остановкой барабанов
    winProbabilities: {
        jackpot: 0.05, // 5% шанс джекпота (3 одинаковых)
        pair: 0.35,    // 35% шанс пары (2 одинаковых)
        loss: 0.60     // 60% проигрыш
    }
};

// Символы и их коэффициенты
const SYMBOLS = [
    { id: 0, icon: '7️⃣', multiplier: 50, type: 'jackpot' },
    { id: 1, icon: '💎', multiplier: 25, type: 'high' },
    { id: 2, icon: '🔔', multiplier: 10, type: 'mid' },
    { id: 3, icon: '🍇', multiplier: 5,  type: 'low' },
    { id: 4, icon: '🍋', multiplier: 3,  type: 'low' },
    { id: 5, icon: '🍒', multiplier: 2,  type: 'low' }
];

// === 2. СОСТОЯНИЕ (ГЛОБАЛЬНОЕ + ЛОКАЛЬНОЕ) ===

// Загружаем глобальное состояние (баланс, валюта)
let appState = JSON.parse(localStorage.getItem('fastMoneyState')) || {
    balance: { RUB: { real: 0, demo: 10000 }, USDT: { real: 0, demo: 1000 } },
    currency: 'USDT',
    mode: 'demo'
};

// Локальное состояние слота
let gameState = {
    bet: 100,
    isSpinning: false,
    autoSpin: false
};

// === 3. ЗВУКОВОЙ МЕНЕДЖЕР ===
const audio = {
    play(id) {
        // Пытаемся найти аудио тег и воспроизвести
        const el = document.getElementById('snd-' + id);
        if (el) {
            el.currentTime = 0;
            el.play().catch(() => {}); // Игнорируем ошибки автоплея
        }
    }
};

// === 4. UI КОНТРОЛЛЕР ===
const UI = {
    balance: document.getElementById('balance-display'),
    currency: document.getElementById('currency-display'),
    bet: document.getElementById('bet-amount'),
    status: document.getElementById('status-text'),
    spinBtn: document.getElementById('spin-btn'),
    jackpot: document.getElementById('jackpot-counter'),

    // Обновление баланса на экране
    updateBalance() {
        const curr = appState.currency;
        const mode = appState.mode;
        const amount = appState.balance[curr][mode];
        
        // Символы
        const symMap = { 'RUB': '₽', 'USDT': '$', 'STARS': '★' };
        this.currency.innerText = symMap[curr] || curr;
        
        // Анимация числа
        this.animateNumber(this.balance, amount);
    },

    setStatus(text, type = 'normal') {
        this.status.innerHTML = text;
        this.status.className = 'status-message'; // сброс классов
        if (type === 'win') this.status.classList.add('win');
        if (type === 'error') this.status.classList.add('error');
    },

    lockControls(locked) {
        this.spinBtn.disabled = locked;
        document.getElementById('btn-dec').disabled = locked;
        document.getElementById('btn-inc').disabled = locked;
        document.getElementById('btn-max').disabled = locked;
        
        // Блокируем кнопку выхода, чтобы не ушли во время спина
        const backBtn = document.querySelector('.back-btn');
        if(backBtn) backBtn.style.pointerEvents = locked ? 'none' : 'auto';
        if(backBtn) backBtn.style.opacity = locked ? '0.5' : '1';
    },

    animateNumber(el, value) {
        const start = parseInt(el.innerText.replace(/[^0-9]/g, '') || 0);
        if (start === value) return;
        
        const duration = 500;
        const startTime = performance.now();
        
        const step = (currentTime) => {
            const progress = Math.min((currentTime - startTime) / duration, 1);
            const current = Math.floor(start + (value - start) * progress);
            el.innerText = current.toLocaleString();
            if (progress < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    }
};

// === 5. ДВИЖОК БАРАБАНОВ (REEL ENGINE) ===
class Reel {
    constructor(elementId, index) {
        this.el = document.getElementById(elementId);
        this.index = index;
        // Генерируем начальную статику
        this.renderStatic();
    }

    getRandomSymbol() {
        return SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
    }

    renderStatic() {
        // Просто 3 случайных символа при загрузке
        let html = '';
        for(let i=0; i<3; i++) html += `<div class="sym">${this.getRandomSymbol().icon}</div>`;
        this.el.innerHTML = html;
    }

    // Главная функция вращения
    async spin(targetSymbolId) {
        const targetSym = SYMBOLS.find(s => s.id === targetSymbolId);
        
        // 1. Генерируем длинную ленту для анимации
        // Нам нужно, чтобы целевой символ оказался в центре видимой области
        // Видимая область 240px. Центр = 120px. Высота символа 80px.
        // Структура ленты: [Куча мусора] -> [Целевой] -> [Символ]
        
        const symbolsCount = 20; // Длина ленты
        const fragment = document.createDocumentFragment();
        
        for (let i = 0; i < symbolsCount; i++) {
            const div = document.createElement('div');
            div.className = 'sym';
            div.innerText = this.getRandomSymbol().icon;
            fragment.appendChild(div);
        }

        // Вставляем целевой символ (предпоследним, чтобы он встал в центр)
        // Математика:
        // Контейнер 3 символа высотой. Центр - это 2-й символ.
        // Мы крутим ленту вверх. 
        // Добавим целевой символ так, чтобы он остановился посередине.
        
        const targetDiv = document.createElement('div');
        targetDiv.className = 'sym';
        targetDiv.innerText = targetSym.icon;
        
        // Собираем финальную структуру
        // [18 рандомных] + [Целевой] + [1 рандомный (низ)]
        // При смещении вверх, [Целевой] должен стать по центру.
        
        this.el.innerHTML = '';
        // Генерируем 18 рандомных
        for(let i=0; i<18; i++) {
             const div = document.createElement('div');
             div.className = 'sym';
             div.innerText = this.getRandomSymbol().icon;
             this.el.appendChild(div);
        }
        this.el.appendChild(targetDiv); // 19-й (Целевой)
        
        const bottomDiv = document.createElement('div'); // 20-й (Низ)
        bottomDiv.className = 'sym';
        bottomDiv.innerText = this.getRandomSymbol().icon;
        this.el.appendChild(bottomDiv);

        // 2. Расчет позиции
        // Мы хотим, чтобы 19-й символ (индекс 18) был посередине окна.
        // Верх окна: 0px.
        // Позиция 19-го символа: 18 * 80 = 1440px.
        // Центр окна (offset): 80px (так как высота окна 240, 3 символа, центр это второй слот, отступ сверху 80px).
        // Итоговый translateY = -(1440 - 80) = -1360px.
        
        const finalY = -((18 * CONFIG.symbolHeight) - CONFIG.symbolHeight);

        // 3. Сброс перед стартом
        this.el.style.transition = 'none';
        this.el.style.transform = 'translateY(0px)';
        this.el.offsetHeight; // Force reflow

        // 4. Запуск анимации
        const duration = CONFIG.spinDuration + (this.index * CONFIG.reelDelay);
        
        // CSS Transition с cubic-bezier для эффекта "пружины" в конце
        this.el.style.transition = `transform ${duration}ms cubic-bezier(0.25, 1, 0.5, 1)`;
        
        // Добавляем блюр для скорости
        this.el.style.filter = 'blur(2px)';
        
        // Поехали!
        this.el.style.transform = `translateY(${finalY}px)`;

        // Убираем блюр перед остановкой
        setTimeout(() => {
            this.el.style.filter = 'blur(0px)';
        }, duration - 400);

        // Ждем окончания
        return new Promise(resolve => {
            setTimeout(() => {
                tg.HapticFeedback.impactOccurred('light'); // Стук колеса
                resolve();
            }, duration);
        });
    }
}

// Инициализация барабанов
const reels = [
    new Reel('reel-1', 0),
    new Reel('reel-2', 1),
    new Reel('reel-3', 2)
];

// === 6. ЛОГИКА ИГРЫ ===

// Определение результата (Server-side logic simulation)
function getSpinResult() {
    const r = Math.random();
    let type = 'loss';
    
    if (r < CONFIG.winProbabilities.jackpot) type = 'jackpot';
    else if (r < (CONFIG.winProbabilities.jackpot + CONFIG.winProbabilities.pair)) type = 'pair';
    
    let ids = [];

    if (type === 'jackpot') {
        // Три одинаковых
        const id = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)].id;
        ids = [id, id, id];
    } else if (type === 'pair') {
        // Два одинаковых
        const id = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)].id;
        const other = (id + 1) % SYMBOLS.length;
        // Варианты пары: AAB, ABA, BAA
        const p = Math.random();
        if (p < 0.33) ids = [id, id, other];
        else if (p < 0.66) ids = [id, other, id];
        else ids = [other, id, id];
    } else {
        // Проигрыш (все разные)
        const s1 = Math.floor(Math.random() * SYMBOLS.length);
        let s2 = Math.floor(Math.random() * SYMBOLS.length);
        while(s2 === s1) s2 = Math.floor(Math.random() * SYMBOLS.length);
        let s3 = Math.floor(Math.random() * SYMBOLS.length);
        while(s3 === s1 || s3 === s2) s3 = Math.floor(Math.random() * SYMBOLS.length);
        ids = [s1, s2, s3];
    }
    
    return { type, ids };
}

// Старт игры
async function startGame() {
    if (gameState.isSpinning) return;

    // Проверка баланса
    const curr = appState.currency;
    const mode = appState.mode;
    if (appState.balance[curr][mode] < gameState.bet) {
        UI.setStatus("НЕДОСТАТОЧНО СРЕДСТВ", "error");
        tg.HapticFeedback.notificationOccurred('error');
        gameState.autoSpin = false;
        document.getElementById('auto-toggle').checked = false;
        return;
    }

    // Списание ставки
    gameState.isSpinning = true;
    appState.balance[curr][mode] -= gameState.bet;
    saveAppState();
    UI.updateBalance();
    
    UI.lockControls(true);
    UI.setStatus("ВРАЩЕНИЕ... 🤞");
    
    // Скрываем линию выигрыша
    document.querySelector('.payline').classList.remove('visible');

    // Звук и вибрация
    audio.play('spin');
    tg.HapticFeedback.impactOccurred('medium');

    // Получаем результат
    const result = getSpinResult();

    // Запускаем барабаны
    const promises = reels.map((reel, i) => reel.spin(result.ids[i]));
    
    // Ждем окончания всех
    await Promise.all(promises);

    // Обработка результата
    handleWin(result.ids);
}

// Обработка победы
function handleWin(ids) {
    const s1 = SYMBOLS.find(s => s.id === ids[0]);
    const s2 = SYMBOLS.find(s => s.id === ids[1]);
    const s3 = SYMBOLS.find(s => s.id === ids[2]);

    let winAmount = 0;
    let isWin = false;

    // Проверка Джекпота (3 одинаковых)
    if (s1.id === s2.id && s2.id === s3.id) {
        winAmount = gameState.bet * s1.multiplier;
        isWin = true;
        showBigWin(winAmount);
        document.querySelector('.payline').classList.add('visible'); // Показать линию
    } 
    // Проверка Пары (2 одинаковых)
    else if (s1.id === s2.id || s2.id === s3.id || s1.id === s3.id) {
        // Находим, какой символ совпал
        const match = (s1.id === s2.id) ? s1 : (s2.id === s3.id ? s2 : s1);
        winAmount = Math.floor(gameState.bet * (match.multiplier * 0.5)); // 50% от множителя за пару
        if(winAmount < gameState.bet) winAmount = gameState.bet; // Минимум возврат ставки

        UI.setStatus(`ВЫИГРЫШ: +${winAmount}`, "win");
        appState.balance[appState.currency][appState.mode] += winAmount;
        saveAppState();
        UI.updateBalance();
        
        tg.HapticFeedback.notificationOccurred('success');
        audio.play('win'); // Можно добавить мелкий звук выигрыша
    } 
    else {
        UI.setStatus("ПОПРОБУЙ СНОВА", "normal");
    }

    gameState.isSpinning = false;
    UI.lockControls(false);

    // Авто игра
    if (gameState.autoSpin) {
        setTimeout(startGame, 1000);
    }
}

// Показ окна BIG WIN
function showBigWin(amount) {
    const modal = document.getElementById('modal-win');
    document.getElementById('win-val').innerText = amount.toLocaleString();
    
    // Символ валюты
    const symMap = { 'RUB': '₽', 'USDT': '$', 'STARS': '★' };
    document.getElementById('win-curr').innerText = symMap[appState.currency];

    modal.classList.remove('hidden');
    
    // Начисляем деньги
    appState.balance[appState.currency][appState.mode] += amount;
    saveAppState();
    UI.updateBalance();

    tg.HapticFeedback.notificationOccurred('success');
    startConfetti(); // Запуск конфетти
}

// === 7. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ===

function saveAppState() {
    localStorage.setItem('fastMoneyState', JSON.stringify(appState));
}

// Конфетти эффект
function startConfetti() {
    const container = document.getElementById('confetti-canvas');
    container.innerHTML = '';
    const colors = ['#f00', '#0f0', '#00f', '#ff0', '#0ff'];
    
    for(let i=0; i<50; i++) {
        const div = document.createElement('div');
        div.style.position = 'absolute';
        div.style.width = '10px'; height='10px';
        div.style.background = colors[Math.floor(Math.random()*colors.length)];
        div.style.left = Math.random()*100 + '%';
        div.style.top = '-10px';
        div.style.animation = `fall ${Math.random()*2+2}s linear`;
        container.appendChild(div);
    }
    // Простой CSS для падения добавлен динамически или должен быть в CSS
    const style = document.createElement('style');
    style.innerHTML = `@keyframes fall { to { transform: translateY(100vh) rotate(720deg); } }`;
    document.head.appendChild(style);
}

// Управление модалками
window.openInfoModal = () => document.getElementById('modal-info').classList.remove('hidden');
window.closeInfoModal = () => document.getElementById('modal-info').classList.add('hidden');
window.closeWinModal = () => document.getElementById('modal-win').classList.add('hidden');

// === 8. ИНИЦИАЛИЗАЦИЯ ПРИ ЗАГРУЗКЕ ===
document.addEventListener('DOMContentLoaded', () => {
    tg.ready();
    tg.expand();
    
    UI.updateBalance();

    // Бинды кнопок ставок
    document.getElementById('btn-inc').addEventListener('click', () => {
        if(gameState.bet < 5000) gameState.bet += 100;
        UI.bet.innerText = gameState.bet;
        tg.HapticFeedback.selectionChanged();
    });
    
    document.getElementById('btn-dec').addEventListener('click', () => {
        if(gameState.bet > 100) gameState.bet -= 100;
        UI.bet.innerText = gameState.bet;
        tg.HapticFeedback.selectionChanged();
    });

    document.getElementById('btn-max').addEventListener('click', () => {
        gameState.bet = 1000; // Макс ставка
        UI.bet.innerText = gameState.bet;
        tg.HapticFeedback.impactOccurred('light');
    });

    // Кнопка спин
    document.getElementById('spin-btn').addEventListener('click', startGame);

    // Авто спин
    document.getElementById('auto-toggle').addEventListener('change', (e) => {
        gameState.autoSpin = e.target.checked;
        if(gameState.autoSpin && !gameState.isSpinning) startGame();
    });
    
    // Анимация Джекпот счетчика (фейковая активность)
    setInterval(() => {
        let val = parseInt(UI.jackpot.innerText.replace(/,/g, ''));
        val += Math.floor(Math.random() * 50);
        UI.jackpot.innerText = val.toLocaleString();
    }, 3000);
});

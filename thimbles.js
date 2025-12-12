/**
 * FASTMONEY - THIMBLES ENGINE
 * Shell Game Logic, CSS Transform Animations & State Management
 */

const tg = window.Telegram.WebApp;

// === 1. КОНФИГУРАЦИЯ ===
const CONFIG = {
    shuffleCount: 5,        // Сколько раз менять местами
    shuffleSpeed: 400,      // Скорость одного перемещения (мс)
    containerWidth: 320,    // Ширина контейнера (для расчета пикселей)
    slotGap: 109,           // Расстояние между центрами стаканов (~34% от 320)
    
    // Коэффициенты
    payouts: {
        1: 2.88,
        2: 1.44
    }
};

// === 2. СОСТОЯНИЕ (STATE) ===

// Глобальное
let appState = JSON.parse(localStorage.getItem('fastMoneyState')) || {
    balance: { RUB: { real: 0, demo: 10000 }, USDT: { real: 0, demo: 1000 } },
    currency: 'USDT',
    mode: 'demo'
};

// Локальное
let game = {
    isPlaying: false,
    bet: 100,
    ballCount: 1, // 1 или 2
    
    // Логическое положение стаканов [0, 1, 2]
    // cupPositions[i] = где сейчас находится стакан с ID=i (0-Left, 1-Center, 2-Right)
    cupPositions: [0, 1, 2],
    
    // Где лежат шарики (привязаны к ID стакана)
    // hasBall[cupId] = true/false
    hasBall: [false, false, false] 
};

// Аудио
const audio = {
    play(id) {
        const el = document.getElementById('snd-' + id);
        if (el) {
            el.currentTime = 0;
            el.play().catch(() => {});
        }
    }
};

// === 3. ИНИЦИАЛИЗАЦИЯ ===
document.addEventListener('DOMContentLoaded', () => {
    tg.ready();
    tg.expand();
    
    updateBalanceUI();
    setupControls();
    
    // Инициализация позиций
    resetVisuals();
});

// === 4. ИГРОВОЙ ПРОЦЕСС ===

async function startGame() {
    if (game.isPlaying) return;

    // Валидация
    const curr = appState.currency;
    const mode = appState.mode;
    if (appState.balance[curr][mode] < game.bet) {
        alert("Недостаточно средств!");
        return;
    }

    // Списание
    appState.balance[curr][mode] -= game.bet;
    saveState();
    updateBalanceUI();

    game.isPlaying = true;
    
    // UI
    document.getElementById('options-panel').classList.add('hidden');
    document.getElementById('shuffling-msg').classList.remove('hidden');
    document.getElementById('status-text').innerText = "СЛЕДИТЕ ЗА ШАРОМ...";
    document.querySelectorAll('.cup-wrapper').forEach(el => el.style.cursor = 'default');

    // 1. Определение где шары (Привязываем шары к конкретным стаканам)
    assignBallsToCups();

    // 2. Поднимаем стаканы (показать шары)
    await showAllBalls();
    await delay(800);

    // 3. Опускаем
    hideAllBalls();
    await delay(500);

    // 4. Перемешивание
    audio.play('whoosh');
    await shuffleCups();

    // 5. Готово к выбору
    game.isPlaying = 'guessing'; // Фаза выбора
    document.getElementById('shuffling-msg').classList.add('hidden');
    document.getElementById('options-panel').classList.remove('hidden'); // Возвращаем панель (но блокируем инпуты если надо, или просто ждем клика)
    // Лучше скрыть опции, чтобы не меняли ставку, но показать подсказку
    document.getElementById('options-panel').classList.add('hidden'); 
    document.getElementById('status-text').innerText = "ВЫБЕРИТЕ СТАКАН";
    document.querySelectorAll('.cup-wrapper').forEach(el => el.style.cursor = 'pointer');
    
    tg.HapticFeedback.notificationOccurred('success'); // Сигнал готовности
}

function assignBallsToCups() {
    // Сброс
    game.hasBall = [false, false, false];
    
    // Генерируем случайные индексы стаканов (0..2)
    let targets = [];
    while(targets.length < game.ballCount) {
        let r = Math.floor(Math.random() * 3);
        if(!targets.includes(r)) targets.push(r);
    }
    
    targets.forEach(cupId => {
        game.hasBall[cupId] = true;
    });
}

// === 5. АНИМАЦИИ ===

function resetVisuals() {
    game.cupPositions = [0, 1, 2];
    for(let i=0; i<3; i++) {
        const cup = document.getElementById(`cup-${i}`);
        cup.style.transform = `translateX(0px)`;
        cup.classList.remove('lifted');
    }
    // Скрываем шары
    document.querySelectorAll('.ball').forEach(b => b.classList.add('hidden'));
}

async function showAllBalls() {
    audio.play('lift');
    
    // Позиционируем шары под стаканами перед поднятием
    // Мы должны поставить div шара в слот, где сейчас стоит стакан
    for(let cupId=0; cupId<3; cupId++) {
        if(game.hasBall[cupId]) {
            const currentSlot = game.cupPositions[cupId]; // 0, 1, 2
            positionBall(cupId, currentSlot); // Используем слот (visual pos)
            document.getElementById(`ball-${cupId}`).classList.remove('hidden');
        }
    }

    // Поднимаем стаканы
    document.querySelectorAll('.cup-wrapper').forEach(el => el.classList.add('lifted'));
}

function hideAllBalls() {
    audio.play('lift');
    document.querySelectorAll('.cup-wrapper').forEach(el => el.classList.remove('lifted'));
    // Шары исчезают чуть позже, когда стакан накроет их (визуальный хак не нужен, они под z-index)
    // Но для порядка можно скрыть через задержку
    setTimeout(() => {
        document.querySelectorAll('.ball').forEach(b => b.classList.add('hidden'));
    }, 300);
}

// Телепортация шара в нужный слот (Left, Center, Right)
function positionBall(ballId, slotIndex) {
    const ball = document.getElementById(`ball-${ballId}`);
    // Слот 0: left 16%, Слот 1: 50%, Слот 2: 84%
    const positions = ['16%', '50%', '84%'];
    ball.style.left = positions[slotIndex];
}

async function shuffleCups() {
    // Цикл перемешиваний
    for (let i = 0; i < CONFIG.shuffleCount; i++) {
        
        // Выбираем два случайных слота (не стакана, а позиции на столе)
        let slotA = Math.floor(Math.random() * 3);
        let slotB = Math.floor(Math.random() * 3);
        while (slotA === slotB) slotB = Math.floor(Math.random() * 3);

        // Находим, какие стаканы сейчас в этих слотах
        let cupA_ID = game.cupPositions.indexOf(slotA); // ID стакана в слоте А
        let cupB_ID = game.cupPositions.indexOf(slotB); // ID стакана в слоте B

        // Меняем их логические позиции
        game.cupPositions[cupA_ID] = slotB;
        game.cupPositions[cupB_ID] = slotA;

        // Применяем CSS Transform
        applyTransform(cupA_ID, slotB);
        applyTransform(cupB_ID, slotA);

        audio.play('whoosh');
        
        // Ждем завершения анимации
        await delay(CONFIG.shuffleSpeed);
    }
}

function applyTransform(cupId, targetSlot) {
    const cup = document.getElementById(`cup-${cupId}`);
    // Изначально cup-0 стоит в слоте 0.
    // Если targetSlot = 1, сдвиг = (1 - 0) * gap
    // Если targetSlot = 2, сдвиг = (2 - 0) * gap
    // Для cup-1 (start slot 1): target 0 -> (0 - 1) * gap = -gap
    
    // Формула: (ЦелевойСлот - НачальныйСлотЭтогоСтакана) * GAP
    // Начальные слоты равны ID стакана (0, 1, 2)
    
    const offset = (targetSlot - cupId) * CONFIG.slotGap;
    cup.style.transform = `translateX(${offset}px)`;
}

// === 6. ОБРАБОТКА ВЫБОРА ===

async function selectCup(cupId) {
    if (game.isPlaying !== 'guessing') return;
    
    game.isPlaying = false; // Блокируем клики
    
    const isWin = game.hasBall[cupId];
    
    // 1. Позиционируем шар под этот стакан (если он там есть)
    if (isWin) {
        positionBall(cupId, game.cupPositions[cupId]);
        document.getElementById(`ball-${cupId}`).classList.remove('hidden');
    }

    // 2. Поднимаем выбранный стакан
    const cupEl = document.getElementById(`cup-${cupId}`);
    cupEl.classList.add('lifted');
    audio.play('lift');

    await delay(500);

    // 3. Результат
    if (isWin) {
        handleWin();
    } else {
        handleLoss();
    }

    // 4. Показываем остальные шары (раскрытие карт)
    setTimeout(() => {
        revealAllHidden();
    }, 500);
}

function revealAllHidden() {
    for(let i=0; i<3; i++) {
        if (game.hasBall[i]) {
            positionBall(i, game.cupPositions[i]);
            document.getElementById(`ball-${i}`).classList.remove('hidden');
            document.getElementById(`cup-${i}`).classList.add('lifted');
        }
    }
}

function handleWin() {
    const mult = CONFIG.payouts[game.ballCount];
    const winAmount = Math.floor(game.bet * mult);
    
    const curr = appState.currency;
    const mode = appState.mode;
    appState.balance[curr][mode] += winAmount;
    saveState();
    updateBalanceUI();

    document.getElementById('status-text').innerText = "ПОБЕДА!";
    document.getElementById('status-text').style.color = "#00ff88";
    
    audio.play('win');
    tg.HapticFeedback.notificationOccurred('success');
    
    showWinModal(winAmount);
}

function handleLoss() {
    document.getElementById('status-text').innerText = "ПУСТО...";
    document.getElementById('status-text').style.color = "#ff4444";
    
    audio.play('lose');
    tg.HapticFeedback.notificationOccurred('error');
    
    setTimeout(() => document.getElementById('modal-loss').classList.remove('hidden'), 1000);
}

// === 7. UI И УПРАВЛЕНИЕ ===

function setupControls() {
    // Кол-во шаров
    window.setBallCount = (cnt) => {
        if (game.isPlaying) return;
        game.ballCount = cnt;
        
        document.querySelectorAll('.b-opt').forEach(b => b.classList.remove('active'));
        // Находим кнопку (по тексту или индексу, проще перебором или хардкодом)
        // Хакинг: индекс 0 это 1 шар, индекс 1 это 2 шара
        document.querySelectorAll('.b-opt')[cnt - 1].classList.add('active');
        
        tg.HapticFeedback.selectionChanged();
    };

    // Ставки
    window.setBet = (val) => {
        if (game.isPlaying) return;
        if (val === 'max') game.bet = 5000;
        else game.bet = val;
        document.getElementById('bet-amount').innerText = game.bet;
        tg.HapticFeedback.selectionChanged();
    };
    document.getElementById('btn-inc').onclick = () => { if(game.bet<10000) game.bet+=100; document.getElementById('bet-amount').innerText=game.bet; };
    document.getElementById('btn-dec').onclick = () => { if(game.bet>100) game.bet-=100; document.getElementById('bet-amount').innerText=game.bet; };
}

// Модалки
function showWinModal(amount) {
    document.getElementById('win-amount').innerText = amount.toLocaleString();
    document.getElementById('win-curr').innerText = getCurrSym();
    setTimeout(() => document.getElementById('modal-win').classList.remove('hidden'), 500);
}

window.closeWinModal = () => {
    document.getElementById('modal-win').classList.add('hidden');
    resetGameUI();
};
window.closeLossModal = () => {
    document.getElementById('modal-loss').classList.add('hidden');
    resetGameUI();
};

function resetGameUI() {
    game.isPlaying = false;
    resetVisuals();
    document.getElementById('options-panel').classList.remove('hidden');
    document.getElementById('status-text').innerText = "СДЕЛАЙТЕ СТАВКУ";
    document.getElementById('status-text').style.color = "#88a";
}

window.openInfoModal = () => document.getElementById('modal-info').classList.remove('hidden');
window.closeInfoModal = () => document.getElementById('modal-info').classList.add('hidden');

// Утилиты
const delay = ms => new Promise(r => setTimeout(r, ms));

function updateBalanceUI() {
    const curr = appState.currency;
    const mode = appState.mode;
    document.getElementById('balance-display').innerText = appState.balance[curr][mode].toLocaleString();
    document.getElementById('currency-display').innerText = getCurrSym();
}
function getCurrSym() { return { 'RUB': '₽', 'USDT': '$', 'STARS': '★' }[appState.currency] || ''; }
function saveState() { localStorage.setItem('fastMoneyState', JSON.stringify(appState)); }

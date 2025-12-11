/**
 * FASTMONEY - MINES ENGINE
 * Logic, Probability Math & Grid Management
 */

const tg = window.Telegram.WebApp;

// === 1. ГЛОБАЛЬНЫЕ НАСТРОЙКИ ===
const CONFIG = {
    gridSize: 25, // 5x5
    houseEdge: 0.97 // 3% преимущество казино (стандарт)
};

// === 2. СОСТОЯНИЕ (STATE) ===

// Глобальное (Баланс)
let appState = JSON.parse(localStorage.getItem('fastMoneyState')) || {
    balance: { RUB: { real: 0, demo: 10000 }, USDT: { real: 0, demo: 1000 } },
    currency: 'USDT',
    mode: 'demo'
};

// Локальное состояние игры
let game = {
    isPlaying: false,
    minesCount: 3,
    bet: 100,
    gemsFound: 0,
    currentMultiplier: 1.00,
    nextMultiplier: 1.00,
    mineLocations: [], // Массив индексов мин
    isCustomMines: false
};

// Аудио движок
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
    
    // Инит UI
    updateBalanceUI();
    initGrid();
    calculateNextMultiplier(); // Расчет первого шага
    
    // Бинды кнопок
    setupControls();
});

// === 4. УПРАВЛЕНИЕ СЕТКОЙ (GRID) ===

function initGrid() {
    const grid = document.getElementById('mines-grid');
    grid.innerHTML = '';
    
    for (let i = 0; i < CONFIG.gridSize; i++) {
        const tile = document.createElement('div');
        tile.className = 'tile';
        tile.dataset.index = i;
        tile.innerHTML = ''; // Пусто
        
        // Клик по плитке
        tile.addEventListener('click', () => handleTileClick(i, tile));
        
        grid.appendChild(tile);
    }
}

// Обработка клика по ячейке
function handleTileClick(index, tileEl) {
    // Проверки
    if (!game.isPlaying) return;
    if (tileEl.classList.contains('revealed')) return;
    
    tg.HapticFeedback.selectionChanged();

    // 1. Попали на МИНУ
    if (game.mineLocations.includes(index)) {
        gameOver(index, tileEl);
    } 
    // 2. Попали на КРИСТАЛЛ
    else {
        revealGem(tileEl);
    }
}

// Открытие кристалла
function revealGem(tileEl) {
    // Визуал
    tileEl.classList.add('revealed', 'gem');
    tileEl.innerHTML = '<i class="fa-regular fa-gem"></i>';
    
    // Звук
    audio.play('gem');
    tg.HapticFeedback.impactOccurred('light');
    
    // Логика
    game.gemsFound++;
    
    // Обновляем множители (текущий становится тем, что был "следующим")
    game.currentMultiplier = game.nextMultiplier;
    
    // Рассчитываем новый "следующий"
    calculateNextMultiplier();
    
    // Обновляем UI
    updateGameUI();
    
    // Проверка на полную победу (найдены все кристаллы)
    const totalGems = CONFIG.gridSize - game.minesCount;
    if (game.gemsFound === totalGems) {
        cashOut(true); // Автовывод
    }
}

// Взрыв (Game Over)
function gameOver(triggerIndex, tileEl) {
    game.isPlaying = false;
    
    // Визуал взрыва
    tileEl.classList.add('revealed', 'bomb');
    tileEl.innerHTML = '<i class="fa-solid fa-bomb"></i>';
    
    audio.play('bomb');
    tg.HapticFeedback.notificationOccurred('error');
    
    // Показываем остальные мины
    const tiles = document.querySelectorAll('.tile');
    game.mineLocations.forEach(loc => {
        if (loc !== triggerIndex) {
            const t = tiles[loc];
            t.classList.add('revealed', 'bomb', 'faded'); // faded - полупрозрачный
            t.innerHTML = '<i class="fa-solid fa-bomb"></i>';
        }
    });

    // Бледим остальные нераскрытые (делаем неактивными)
    tiles.forEach((t, i) => {
        if (!t.classList.contains('revealed')) {
            t.classList.add('disabled');
            t.style.opacity = '0.3';
        }
    });

    // Модалка поражения
    setTimeout(() => {
        document.getElementById('modal-loss').classList.remove('hidden');
    }, 500);

    // Сброс кнопки
    resetButtonState();
}

// === 5. ЛОГИКА ИГРЫ (START / STOP) ===

function startGame() {
    // Валидация баланса
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

    // Генерация мин
    game.mineLocations = generateMines(game.minesCount);
    
    // Сброс переменных
    game.isPlaying = true;
    game.gemsFound = 0;
    game.currentMultiplier = 1.00;
    calculateNextMultiplier(); // Считаем множитель первого шага

    // UI Сброс
    initGrid(); // Пересоздаем чистую сетку
    document.getElementById('grid-overlay').classList.add('hidden');
    document.getElementById('game-stats-bar').classList.remove('hidden');
    document.getElementById('settings-area').classList.add('collapsed'); // Прячем настройки
    
    // Кнопка меняется на "ЗАБРАТЬ"
    const btn = document.getElementById('main-btn');
    btn.classList.add('cashout');
    btn.querySelector('.btn-text').innerText = "ЗАБРАТЬ";
    updateCashoutButton(); // Показать сумму

    tg.HapticFeedback.impactOccurred('medium');
}

function cashOut(isAuto = false) {
    if (!game.isPlaying) return;
    
    game.isPlaying = false;
    
    // Расчет выигрыша
    const winAmount = Math.floor(game.bet * game.currentMultiplier);
    
    // Зачисление
    const curr = appState.currency;
    const mode = appState.mode;
    appState.balance[curr][mode] += winAmount;
    saveState();
    updateBalanceUI();
    
    // Звук и эффект
    audio.play('win');
    tg.HapticFeedback.notificationOccurred('success');
    
    // Модалка победы
    showWinModal(winAmount);
    
    // Открываем все оставшиеся кристаллы (визуально)
    revealAllSafeTiles();
    
    // Сброс кнопки
    resetButtonState();
}

// Показать все безопасные (после победы или проигрыша)
function revealAllSafeTiles() {
    const tiles = document.querySelectorAll('.tile');
    tiles.forEach((t, i) => {
        if (!game.mineLocations.includes(i) && !t.classList.contains('revealed')) {
            t.classList.add('revealed', 'gem', 'faded');
            t.innerHTML = '<i class="fa-regular fa-gem"></i>';
        }
    });
}

// === 6. МАТЕМАТИКА ===

function generateMines(count) {
    const locations = new Set();
    while (locations.size < count) {
        locations.add(Math.floor(Math.random() * CONFIG.gridSize));
    }
    return Array.from(locations);
}

// Расчет множителя для СЛЕДУЮЩЕГО шага
function calculateNextMultiplier() {
    // Формула вероятности:
    // P(win) = (SafeTiles - Found) / (TotalTiles - Found)
    // Multiplier = (1 / P(win)) * HouseEdge
    // Мы считаем кумулятивный множитель.
    
    const totalTiles = CONFIG.gridSize;
    const safeTiles = totalTiles - game.minesCount;
    const remainingSafe = safeTiles - game.gemsFound;
    const remainingTotal = totalTiles - game.gemsFound;

    // Вероятность угадать следующий кристалл
    const probability = remainingSafe / remainingTotal;
    
    // Множитель за этот конкретный шаг
    const stepMult = (1 / probability) * CONFIG.houseEdge;
    
    // Накапливаем множитель (текущий * шаг)
    // В начале игры current = 1.00
    // next = 1.00 * stepMult
    game.nextMultiplier = game.currentMultiplier * stepMult;
}

// === 7. UI UPDATE ===

function updateGameUI() {
    // Обновляем плашки сверху
    document.getElementById('current-multiplier').innerText = game.currentMultiplier.toFixed(2) + 'x';
    
    // Сколько дадут за следующий ход
    const nextProfit = Math.floor(game.bet * game.nextMultiplier) - Math.floor(game.bet * game.currentMultiplier);
    document.getElementById('next-profit').innerText = '+' + nextProfit;
    
    updateCashoutButton();
}

function updateCashoutButton() {
    const btn = document.getElementById('main-btn');
    const sub = document.getElementById('btn-sub-text');
    
    const currentWin = Math.floor(game.bet * game.currentMultiplier);
    
    if (game.gemsFound === 0) {
        // Если еще не открыли ничего, забрать можно только ставку (или нельзя, зависит от правил)
        // Обычно в минах нельзя забрать, пока не сделал 1 ход.
        // Сделаем так: пока 0 ходов, кнопка неактивна для кэшаута, или возвращает ставку.
        // В нашей логике, start -> isPlaying.
        btn.querySelector('.btn-text').innerText = "ЗАБРАТЬ";
        sub.innerText = currentWin + " " + getCurrSym();
    } else {
        btn.querySelector('.btn-text').innerText = "ЗАБРАТЬ";
        sub.innerText = currentWin + " " + getCurrSym();
    }
}

function resetButtonState() {
    const btn = document.getElementById('main-btn');
    btn.classList.remove('cashout');
    btn.querySelector('.btn-text').innerText = "ИГРАТЬ";
    
    const curr = appState.currency;
    const mode = appState.mode;
    // Показываем баланс или призыв
    subText = "Начать игру";
    document.getElementById('btn-sub-text').innerText = subText;
    
    // Возвращаем настройки
    document.getElementById('settings-area').classList.remove('collapsed');
    // Скрываем инфо-бар игры
    document.getElementById('game-stats-bar').classList.add('hidden');
    // Оверлей
    document.getElementById('grid-overlay').classList.remove('hidden');
}

function updateBalanceUI() {
    const curr = appState.currency;
    const mode = appState.mode;
    const amount = appState.balance[curr][mode];
    document.getElementById('balance-display').innerText = amount.toLocaleString();
    document.getElementById('currency-display').innerText = getCurrSym();
}

function getCurrSym() {
    return { 'RUB': '₽', 'USDT': '$', 'STARS': '★' }[appState.currency] || '';
}

// === 8. УПРАВЛЕНИЕ НАСТРОЙКАМИ ===

function setupControls() {
    // Главная кнопка
    document.getElementById('main-btn').addEventListener('click', () => {
        if (game.isPlaying) {
            if (game.gemsFound > 0) cashOut();
        } else {
            startGame();
        }
    });
    
    // Выбор мин
    window.setMines = (count) => {
        if (game.isPlaying) return;
        game.minesCount = count;
        game.isCustomMines = false;
        
        // UI
        document.querySelectorAll('.m-opt').forEach(b => b.classList.remove('active'));
        document.querySelector('.m-opt-custom').classList.remove('active');
        document.getElementById('mines-slider-box').classList.add('hidden');
        
        // Ищем кнопку с таким числом и активируем
        // Простой способ: перебираем или используем event
        const btns = document.querySelectorAll('.m-opt');
        btns.forEach(btn => {
            if (parseInt(btn.innerText) === count) btn.classList.add('active');
        });

        tg.HapticFeedback.selectionChanged();
    };
    
    // Кастомные мины
    window.toggleCustomMines = () => {
        if (game.isPlaying) return;
        const box = document.getElementById('mines-slider-box');
        const btn = document.getElementById('custom-mines-btn');
        
        document.querySelectorAll('.m-opt').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        box.classList.toggle('hidden');
        game.isCustomMines = true;
    };
    
    // Слайдер
    const slider = document.getElementById('mines-range');
    slider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        game.minesCount = val;
        document.getElementById('mines-count-display').innerText = val;
    });

    // Ставки
    window.setBet = (val) => {
        if (game.isPlaying) return;
        if (val === 'max') game.bet = 10000;
        else game.bet = val;
        document.getElementById('bet-amount').innerText = game.bet;
        tg.HapticFeedback.selectionChanged();
    };

    document.getElementById('btn-inc').addEventListener('click', () => {
        if (game.bet < 50000) game.bet += 100;
        document.getElementById('bet-amount').innerText = game.bet;
    });
    document.getElementById('btn-dec').addEventListener('click', () => {
        if (game.bet > 100) game.bet -= 100;
        document.getElementById('bet-amount').innerText = game.bet;
    });
}

// Модалки
function showWinModal(amount) {
    const modal = document.getElementById('modal-win');
    document.getElementById('win-amount').innerText = amount.toLocaleString();
    document.getElementById('win-currency').innerText = getCurrSym();
    modal.classList.remove('hidden');
}

window.closeWinModal = () => document.getElementById('modal-win').classList.add('hidden');
window.closeLossModal = () => document.getElementById('modal-loss').classList.add('hidden');
window.openInfoModal = () => document.getElementById('modal-info').classList.remove('hidden');
window.closeInfoModal = () => document.getElementById('modal-info').classList.add('hidden');

function saveState() {
    localStorage.setItem('fastMoneyState', JSON.stringify(appState));
}

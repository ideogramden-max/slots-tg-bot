/**
 * FASTMONEY - WARSHIPS ENGINE (Battleship Blitz)
 * Auto-placement, AI Logic & Turn Management
 */

const tg = window.Telegram.WebApp;

// === 1. КОНФИГУРАЦИЯ ===
const CONFIG = {
    gridSize: 6, // 6x6
    totalCells: 36,
    multiplier: 1.95,
    // Флот: один 3-палубный, два 2-палубных, два 1-палубных
    fleetSchema: [3, 2, 2, 1, 1], 
    botDelay: 1000 // Задержка хода бота
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
    isPlayerTurn: true,
    
    // Данные сеток (0: пусто, 1: корабль, 2: мимо, 3: попал, 4: потоплен)
    playerGrid: [],
    enemyGrid: [], // Здесь мы знаем корабли, но не показываем их
    
    // Списки кораблей (для проверки потопления)
    playerShips: [], 
    enemyShips: [],
    
    // Счетчики живых кораблей
    playerAlive: 5,
    enemyAlive: 5,

    // Память бота для добивания
    botTargetStack: [] 
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
    
    // Рисуем пустые сетки для красоты
    renderEmptyGrid('enemy-grid');
    renderEmptyGrid('player-grid');
});

function renderEmptyGrid(elementId) {
    const container = document.getElementById(elementId);
    container.innerHTML = '';
    for(let i=0; i<CONFIG.totalCells; i++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        container.appendChild(cell);
    }
}

// === 4. ПОДГОТОВКА К БОЮ ===

function startGame() {
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

    // Сброс данных
    game.isPlaying = true;
    game.isPlayerTurn = true; // Игрок ходит первым
    game.playerAlive = 5;
    game.enemyAlive = 5;
    game.botTargetStack = [];

    // Генерация флотов
    const pData = generateFleet();
    game.playerGrid = pData.grid;
    game.playerShips = pData.ships;

    const eData = generateFleet();
    game.enemyGrid = eData.grid;
    game.enemyShips = eData.ships;

    // Рендер полей
    renderPlayerGrid(); // Показываем свои корабли
    renderEnemyGrid();  // Показываем туман войны (пусто)

    // UI
    document.getElementById('bet-panel').classList.add('hidden');
    document.getElementById('active-panel').classList.remove('hidden');
    document.getElementById('radar-lock').classList.add('hidden');
    document.getElementById('status-msg').innerText = "ВАШ ХОД! АТАКУЙТЕ.";
    document.getElementById('status-msg').style.color = "#00ffff";
    document.getElementById('turn-indicator').classList.add('active'); // Зеленая лампа
    
    updateCounters();
    
    audio.play('radar'); // Звук старта
    tg.HapticFeedback.impactOccurred('medium');
}

// Алгоритм расстановки кораблей
function generateFleet() {
    let grid = new Array(CONFIG.totalCells).fill(0);
    let ships = [];

    // Перебираем размеры кораблей
    for (let size of CONFIG.fleetSchema) {
        let placed = false;
        while (!placed) {
            // Случайная позиция и ориентация
            const horizontal = Math.random() > 0.5;
            const row = Math.floor(Math.random() * CONFIG.gridSize);
            const col = Math.floor(Math.random() * CONFIG.gridSize);
            
            if (canPlaceShip(grid, row, col, size, horizontal)) {
                const shipCoords = [];
                for (let k = 0; k < size; k++) {
                    const idx = horizontal ? (row * 6 + col + k) : ((row + k) * 6 + col);
                    grid[idx] = 1; // 1 = Корабль
                    shipCoords.push(idx);
                }
                ships.push({ coords: shipCoords, hits: 0, size: size, sunk: false });
                placed = true;
            }
        }
    }
    return { grid, ships };
}

function canPlaceShip(grid, row, col, size, horizontal) {
    for (let k = 0; k < size; k++) {
        const r = horizontal ? row : row + k;
        const c = horizontal ? col + k : col;

        // Выход за границы
        if (r >= CONFIG.gridSize || c >= CONFIG.gridSize) return false;

        // Проверка занятости и соседей (правило 1 клетки вокруг)
        const idx = r * 6 + c;
        if (grid[idx] !== 0) return false;

        // Проверяем соседей (все 8 клеток вокруг)
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                const nr = r + dr;
                const nc = c + dc;
                if (nr >= 0 && nr < 6 && nc >= 0 && nc < 6) {
                    if (grid[nr * 6 + nc] === 1) return false;
                }
            }
        }
    }
    return true;
}

// === 5. РЕНДЕР ИГРЫ ===

function renderPlayerGrid() {
    const container = document.getElementById('player-grid');
    container.innerHTML = '';
    
    game.playerGrid.forEach((val, idx) => {
        const cell = document.createElement('div');
        cell.className = 'cell';
        if (val === 1) cell.classList.add('ship'); // Показываем свои корабли
        if (val === 2) cell.classList.add('miss');
        if (val === 3) cell.classList.add('hit');
        if (val === 4) cell.classList.add('hit', 'sunk');
        container.appendChild(cell);
    });
}

function renderEnemyGrid() {
    const container = document.getElementById('enemy-grid');
    container.innerHTML = '';
    
    game.enemyGrid.forEach((val, idx) => {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.dataset.index = idx;
        
        // Для врага 1 (корабль) не показываем класс ship, пока не попали
        if (val === 2) cell.classList.add('miss', 'revealed');
        if (val === 3) cell.classList.add('hit', 'revealed');
        if (val === 4) cell.classList.add('hit', 'sunk', 'revealed');
        
        // Клик только по нераскрытым
        if (val === 0 || val === 1) {
            cell.onclick = () => handlePlayerShot(idx);
        } else {
            cell.style.cursor = 'default';
        }
        
        container.appendChild(cell);
    });
}

// === 6. ЛОГИКА ХОДОВ ===

function handlePlayerShot(index) {
    if (!game.isPlaying || !game.isPlayerTurn) return;

    tg.HapticFeedback.selectionChanged();

    // Проверяем попадание
    const content = game.enemyGrid[index]; // 0 или 1
    
    if (content === 1) {
        // ПОПАДАНИЕ
        game.enemyGrid[index] = 3; // Hit
        checkShipStatus(game.enemyShips, game.enemyGrid, index, 'enemy');
        renderEnemyGrid();
        
        audio.play('hit');
        tg.HapticFeedback.impactOccurred('medium');
        
        // Проверка победы
        if (game.enemyAlive === 0) {
            endGame(true);
        } else {
            // Доп ход
            document.getElementById('status-msg').innerText = "ПОПАДАНИЕ! СТРЕЛЯЙТЕ СНОВА.";
        }
    } else {
        // ПРОМАХ
        game.enemyGrid[index] = 2; // Miss
        renderEnemyGrid();
        
        audio.play('miss');
        tg.HapticFeedback.impactOccurred('light');
        
        // Переход хода
        game.isPlayerTurn = false;
        document.getElementById('status-msg').innerText = "ПРОМАХ. ХОД БОТА...";
        document.getElementById('status-msg').style.color = "#ff4444";
        document.getElementById('turn-indicator').classList.remove('active');
        
        setTimeout(botTurn, CONFIG.botDelay);
    }
}

function botTurn() {
    if (!game.isPlaying) return;

    // ИИ: Если есть раненые корабли в стеке, бьем рядом. Если нет - рандом.
    let targetIndex;
    
    // Простейшая логика добивания
    // (Для казино не нужен AlphaGo, достаточно рандома)
    
    // Ищем доступные клетки
    let available = [];
    game.playerGrid.forEach((v, i) => {
        if (v === 0 || v === 1) available.push(i);
    });

    if (available.length === 0) return; // Конец игры должен был сработать раньше

    targetIndex = available[Math.floor(Math.random() * available.length)];

    // Обработка выстрела
    const content = game.playerGrid[targetIndex];

    if (content === 1) {
        // БОТ ПОПАЛ
        game.playerGrid[targetIndex] = 3;
        checkShipStatus(game.playerShips, game.playerGrid, targetIndex, 'player');
        renderPlayerGrid();
        
        audio.play('hit');
        
        if (game.playerAlive === 0) {
            endGame(false);
        } else {
            // Бот ходит снова
            setTimeout(botTurn, CONFIG.botDelay);
        }
    } else {
        // БОТ ПРОМАЗАЛ
        game.playerGrid[targetIndex] = 2;
        renderPlayerGrid();
        
        audio.play('miss');
        
        // Ход игрока
        game.isPlayerTurn = true;
        document.getElementById('status-msg').innerText = "БОТ ПРОМАЗАЛ. ВАШ ХОД!";
        document.getElementById('status-msg').style.color = "#00ffff";
        document.getElementById('turn-indicator').classList.add('active');
    }
}

// Проверка: убил или ранил?
function checkShipStatus(ships, grid, hitIndex, type) {
    // Ищем корабль, которому принадлежит клетка
    let ship = ships.find(s => s.coords.includes(hitIndex));
    if (!ship) return;

    ship.hits++;

    // Если количество попаданий == размеру -> ПОТОПЛЕН
    if (ship.hits === ship.size) {
        ship.sunk = true;
        ship.coords.forEach(idx => {
            grid[idx] = 4; // Mark as Sunk
        });
        
        // Обводим ореолом убитый корабль (mark neighbors as miss visual trick optional)
        // Обновляем счетчик
        if (type === 'enemy') game.enemyAlive--;
        else game.playerAlive--;
        
        updateCounters();
        
        const msg = (type === 'enemy') ? "КОРАБЛЬ ПРОТИВНИКА ПОТОПЛЕН!" : "НАШ КОРАБЛЬ ПОТОПЛЕН!";
        document.getElementById('status-msg').innerText = msg;
        
        tg.HapticFeedback.notificationOccurred(type === 'enemy' ? 'success' : 'warning');
    }
}

// === 7. ЗАВЕРШЕНИЕ ИГРЫ ===

function endGame(isWin) {
    game.isPlaying = false;
    document.getElementById('active-panel').classList.add('hidden');
    
    if (isWin) {
        const winAmount = Math.floor(game.bet * CONFIG.multiplier);
        const curr = appState.currency;
        const mode = appState.mode;
        appState.balance[curr][mode] += winAmount;
        saveState();
        updateBalanceUI();
        
        showWinModal(winAmount);
        audio.play('win');
        tg.HapticFeedback.notificationOccurred('success');
    } else {
        document.getElementById('modal-loss').classList.remove('hidden');
        audio.play('lose');
        tg.HapticFeedback.notificationOccurred('error');
    }
}

function surrenderGame() {
    if (!game.isPlaying) return;
    endGame(false); // Засчитываем поражение
}

function resetGame() {
    document.getElementById('bet-panel').classList.remove('hidden');
    document.getElementById('active-panel').classList.add('hidden');
    document.getElementById('radar-lock').classList.remove('hidden');
    document.getElementById('status-msg').innerText = "СДЕЛАЙТЕ СТАВКУ";
    document.getElementById('status-msg').style.color = "#00ffff";
    document.getElementById('turn-indicator').classList.remove('active');
    
    renderEmptyGrid('enemy-grid');
    renderEmptyGrid('player-grid');
    
    document.getElementById('player-ships-count').innerText = "Ships: 5";
    document.getElementById('enemy-ships-count').innerText = "Ships: 5";
}

// === 8. UI И УПРАВЛЕНИЕ ===

function updateCounters() {
    document.getElementById('player-ships-count').innerText = `Ships: ${game.playerAlive}`;
    document.getElementById('enemy-ships-count').innerText = `Ships: ${game.enemyAlive}`;
}

function setupControls() {
    // Ставки
    window.setBet = (val) => {
        if (game.isPlaying) return;
        if (val === 'max') game.bet = 5000;
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

function updateBalanceUI() {
    const curr = appState.currency;
    const mode = appState.mode;
    document.getElementById('balance-display').innerText = appState.balance[curr][mode].toLocaleString();
    document.getElementById('currency-display').innerText = getCurrSym();
}
function getCurrSym() { return { 'RUB': '₽', 'USDT': '$', 'STARS': '★' }[appState.currency] || ''; }
function saveState() { localStorage.setItem('fastMoneyState', JSON.stringify(appState)); }

// Модалки
function showWinModal(amount) {
    document.getElementById('win-amount').innerText = amount.toLocaleString();
    document.getElementById('win-currency').innerText = getCurrSym();
    document.getElementById('modal-win').classList.remove('hidden');
}

window.closeWinModal = () => { document.getElementById('modal-win').classList.add('hidden'); resetGame(); };
window.closeLossModal = () => { document.getElementById('modal-loss').classList.add('hidden'); resetGame(); };
window.openInfoModal = () => document.getElementById('modal-info').classList.remove('hidden');
window.closeInfoModal = () => document.getElementById('modal-info').classList.add('hidden');

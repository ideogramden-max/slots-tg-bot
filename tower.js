/**
 * FASTMONEY - TOWER ENGINE
 * Logic for climbing mechanics & probability
 */

const tg = window.Telegram.WebApp;

// === 1. КОНФИГУРАЦИЯ СЛОЖНОСТИ ===
const LEVELS = {
    easy: {
        cols: 3, // 3 ячейки в ряд
        mines: 1, // 1 мина (2 безопасных)
        floors: 9,
        multipliers: [1.45, 2.18, 3.27, 4.91, 7.36, 11.04, 16.56, 24.84, 37.26]
    },
    medium: {
        cols: 2, // 2 ячейки
        mines: 1, // 1 мина (1 безопасная - 50/50)
        floors: 9,
        multipliers: [1.94, 3.88, 7.76, 15.52, 31.04, 62.08, 124.1, 248.3, 496.6]
    },
    hard: {
        cols: 3,
        mines: 2, // 2 мины (1 безопасная - 33%)
        floors: 9,
        multipliers: [2.91, 8.73, 26.19, 78.57, 235.7, 707.1, 2121, 6363, 19090]
    },
    crazy: {
        cols: 4,
        mines: 3, // 3 мины (1 безопасная - 25%)
        floors: 6, // Меньше этажей, т.к. очень сложно
        multipliers: [3.88, 15.52, 62.08, 248.3, 993.2, 3973]
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
    difficulty: 'easy',
    bet: 100,
    currentRow: 0, // Текущий этаж (0 - первый снизу)
    gridLogic: [], // Массив этажей: [ [0, 1, 0], ... ] где 1 = мина
    isCashoutAvailable: false
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
    
    // Бинды
    setupControls();
    
    // Рисуем пустую башню для красоты при старте
    renderTowerVisualOnly(); 
});

// === 4. ЛОГИКА ИГРЫ ===

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

    // Генерация логики уровня
    game.gridLogic = generateTowerLogic();
    game.currentRow = 0;
    game.isPlaying = true;
    game.isCashoutAvailable = false;

    // UI переключение
    document.getElementById('tower-overlay').classList.add('hidden');
    document.getElementById('settings-panel').classList.add('hidden');
    
    // Обновляем кнопку (пока неактивна для вывода, нужен 1 шаг)
    updateMainBtn('playing');

    // Рендер игрового поля
    renderTowerActive();
    
    tg.HapticFeedback.impactOccurred('medium');
    
    // Скролл в самый низ
    const container = document.getElementById('tower-scroll');
    container.scrollTop = container.scrollHeight;
}

function generateTowerLogic() {
    const conf = LEVELS[game.difficulty];
    let tower = [];
    
    for (let i = 0; i < conf.floors; i++) {
        // Создаем массив нулей (безопасно)
        let row = new Array(conf.cols).fill(0);
        
        // Расставляем мины
        let minesPlaced = 0;
        while (minesPlaced < conf.mines) {
            const pos = Math.floor(Math.random() * conf.cols);
            if (row[pos] === 0) {
                row[pos] = 1; // 1 = мина
                minesPlaced++;
            }
        }
        tower.push(row);
    }
    return tower;
}

// === 5. РЕНДЕР БАШНИ ===

function renderTowerVisualOnly() {
    const grid = document.getElementById('tower-grid');
    grid.innerHTML = '';
    const conf = LEVELS[game.difficulty];

    for (let i = conf.floors - 1; i >= 0; i--) {
        const rowEl = document.createElement('div');
        rowEl.className = 'tower-row';
        
        // Множитель
        const multEl = document.createElement('div');
        multEl.className = 'row-mult';
        multEl.innerText = conf.multipliers[i].toFixed(2) + 'x';
        rowEl.appendChild(multEl);

        // Плитки
        for (let j = 0; j < conf.cols; j++) {
            const tile = document.createElement('div');
            tile.className = 't-tile';
            rowEl.appendChild(tile);
        }
        grid.appendChild(rowEl);
    }
}

function renderTowerActive() {
    const grid = document.getElementById('tower-grid');
    grid.innerHTML = '';
    const conf = LEVELS[game.difficulty];

    // Генерируем HTML (сверху вниз по DOM, но визуально это будет перевернуто CSS column-reverse)
    // Важно: в массиве game.gridLogic индекс 0 - это НИЖНИЙ этаж.
    // В CSS flex-direction: column-reverse означает, что первый элемент в DOM будет внизу.
    // Значит, аппендим мы от 0 до max.
    
    for (let i = 0; i < conf.floors; i++) {
        const rowEl = document.createElement('div');
        rowEl.className = 'tower-row';
        if (i === 0) rowEl.classList.add('active'); // Активируем первый этаж
        
        rowEl.dataset.rowIndex = i;

        // Множитель
        const multEl = document.createElement('div');
        multEl.className = 'row-mult';
        multEl.innerText = conf.multipliers[i].toFixed(2) + 'x';
        rowEl.appendChild(multEl);

        // Плитки
        for (let j = 0; j < conf.cols; j++) {
            const tile = document.createElement('div');
            tile.className = 't-tile';
            tile.dataset.colIndex = j;
            
            // Клик
            tile.onclick = () => handleTileClick(i, j, tile);
            
            rowEl.appendChild(tile);
        }
        grid.appendChild(rowEl);
    }
}

// === 6. ОБРАБОТКА ХОДА ===

function handleTileClick(rowIndex, colIndex, tileEl) {
    if (!game.isPlaying) return;
    if (rowIndex !== game.currentRow) return; // Можно жать только на активный ряд
    if (tileEl.classList.contains('success') || tileEl.classList.contains('fail')) return;

    tg.HapticFeedback.selectionChanged();

    // Проверяем логику: 1 - мина, 0 - чисто
    const isBomb = game.gridLogic[rowIndex][colIndex] === 1;

    if (isBomb) {
        gameOver(tileEl, rowIndex, colIndex);
    } else {
        successStep(tileEl, rowIndex);
    }
}

function successStep(tileEl, rowIndex) {
    // Визуал
    tileEl.classList.add('success');
    tileEl.innerHTML = '<i class="fa-regular fa-gem"></i>';
    audio.play('step');
    
    const rows = document.querySelectorAll('.tower-row');
    const currentRowEl = rows[rowIndex];
    
    // Помечаем ряд как пройденный
    currentRowEl.classList.remove('active');
    currentRowEl.classList.add('passed');

    // Логика
    game.currentRow++;
    const conf = LEVELS[game.difficulty];

    // Проверка на победу (последний этаж)
    if (game.currentRow >= conf.floors) {
        game.isCashoutAvailable = true;
        cashOut(true); // Автовывод при финише
        return;
    }

    // Активируем следующий ряд
    const nextRowEl = rows[game.currentRow];
    nextRowEl.classList.add('active');
    
    // Скролл к активному ряду
    nextRowEl.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Обновляем кнопку
    game.isCashoutAvailable = true;
    updateMainBtn('cashout');
}

function gameOver(tileEl, rowIndex, colIndex) {
    game.isPlaying = false;
    
    // Визуал взрыва
    tileEl.classList.add('fail');
    tileEl.innerHTML = '<i class="fa-solid fa-skull"></i>';
    audio.play('fall');
    tg.HapticFeedback.notificationOccurred('error');

    // Показываем все мины на этом этаже и выше (можно просто показать путь)
    revealMap();

    document.getElementById('modal-loss').classList.remove('hidden');
    resetGameUI();
}

function cashOut(isVictory = false) {
    if (!game.isPlaying || !game.isCashoutAvailable) return;
    
    game.isPlaying = false;
    const conf = LEVELS[game.difficulty];
    
    // Множитель предыдущего (пройденного) этажа
    // Если прошли всю башню, берем последний. Если ушли раньше, берем (currentRow - 1)
    let multIndex = game.currentRow - 1;
    if (multIndex < 0) multIndex = 0; // На всякий случай

    const mult = conf.multipliers[multIndex];
    const winAmount = Math.floor(game.bet * mult);

    // Начисление
    const curr = appState.currency;
    const mode = appState.mode;
    appState.balance[curr][mode] += winAmount;
    saveState();
    updateBalanceUI();

    // Визуал
    if (isVictory) {
        audio.play('win');
        tg.HapticFeedback.notificationOccurred('success');
        showWinModal(winAmount);
    } else {
        audio.play('win');
        tg.HapticFeedback.notificationOccurred('success');
        showWinModal(winAmount);
    }

    resetGameUI();
}

function revealMap() {
    // Пробегаем по всей башне и показываем, где были мины, а где гемы
    const rows = document.querySelectorAll('.tower-row');
    
    game.gridLogic.forEach((logicRow, rIndex) => {
        const domRow = rows[rIndex];
        const tiles = domRow.querySelectorAll('.t-tile');
        
        logicRow.forEach((val, cIndex) => {
            // Если там мина и это не та, на которую нажали
            if (val === 1 && !tiles[cIndex].classList.contains('fail')) {
                tiles[cIndex].innerHTML = '<i class="fa-solid fa-skull" style="opacity:0.3"></i>';
            }
            // Если там безопасно и не открыто
            if (val === 0 && !tiles[cIndex].classList.contains('success')) {
                tiles[cIndex].style.opacity = '0.3';
                tiles[cIndex].innerHTML = '<i class="fa-regular fa-gem"></i>';
            }
        });
    });
}

// === 7. УПРАВЛЕНИЕ И UI ===

function updateMainBtn(state) {
    const btn = document.getElementById('main-btn');
    const sub = document.getElementById('btn-sub');
    const txt = btn.querySelector('.btn-text');

    btn.className = 'main-tower-btn'; // сброс

    if (state === 'start') {
        txt.innerText = "ИГРАТЬ";
        sub.innerText = "Начать восхождение";
    } else if (state === 'playing') {
        // Блокируем пока не прошли 1 этаж
        btn.style.opacity = '0.5';
        txt.innerText = "В ИГРЕ...";
        sub.innerText = "Сделайте ход";
    } else if (state === 'cashout') {
        btn.style.opacity = '1';
        btn.classList.add('cashout');
        txt.innerText = "ЗАБРАТЬ";
        
        // Считаем сколько сейчас денег
        const conf = LEVELS[game.difficulty];
        const mult = conf.multipliers[game.currentRow - 1];
        const win = Math.floor(game.bet * mult);
        
        sub.innerText = `${win} ${getCurrSym()}`;
    }
}

function resetGameUI() {
    // Возвращаем интерфейс в исходное положение (но чуть позже, чтобы юзер увидел результат)
    // Кнопка рестарта в модалках сделает визуальный сброс
}

// Кнопка в модалках "ЕЩЕ РАЗ" и "ЗАБРАТЬ"
window.closeWinModal = () => {
    document.getElementById('modal-win').classList.add('hidden');
    fullReset();
};
window.closeLossModal = () => {
    document.getElementById('modal-loss').classList.add('hidden');
    fullReset();
};

function fullReset() {
    document.getElementById('tower-overlay').classList.remove('hidden');
    document.getElementById('settings-panel').classList.remove('hidden');
    updateMainBtn('start');
    renderTowerVisualOnly(); // Рисуем чистую башню
    
    // Скролл вниз
    const container = document.getElementById('tower-scroll');
    container.scrollTop = container.scrollHeight;
}


// Управление настройками
function setupControls() {
    // Главная кнопка
    document.getElementById('main-btn').addEventListener('click', () => {
        if (!game.isPlaying) {
            startGame();
        } else if (game.isCashoutAvailable) {
            cashOut(false);
        }
    });

    // Сложность
    window.setDifficulty = (diff) => {
        if (game.isPlaying) return;
        game.difficulty = diff;
        
        // UI
        document.querySelectorAll('.d-opt').forEach(b => b.classList.remove('active'));
        document.querySelector(`.d-opt[data-diff="${diff}"]`).classList.add('active');
        
        // Перерисовываем превью башни (меняется кол-во ячеек)
        renderTowerVisualOnly();
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
    document.getElementById('btn-inc').addEventListener('click', () => {
        if (game.bet < 50000) game.bet += 100;
        document.getElementById('bet-amount').innerText = game.bet;
    });
    document.getElementById('btn-dec').addEventListener('click', () => {
        if (game.bet > 100) game.bet -= 100;
        document.getElementById('bet-amount').innerText = game.bet;
    });
}

// Утилиты
function updateBalanceUI() {
    const curr = appState.currency;
    const mode = appState.mode;
    document.getElementById('balance-display').innerText = appState.balance[curr][mode].toLocaleString();
    document.getElementById('currency-display').innerText = getCurrSym();
}
function getCurrSym() { return { 'RUB': '₽', 'USDT': '$', 'STARS': '★' }[appState.currency] || ''; }
function saveState() { localStorage.setItem('fastMoneyState', JSON.stringify(appState)); }

// Модалки Инфо
window.openInfoModal = () => document.getElementById('modal-info').classList.remove('hidden');
window.closeInfoModal = () => document.getElementById('modal-info').classList.add('hidden');
function showWinModal(amount) {
    document.getElementById('win-amount').innerText = amount.toLocaleString();
    document.getElementById('win-curr').innerText = getCurrSym();
    document.getElementById('modal-win').classList.remove('hidden');
}

/**
 * FASTMONEY - TIC TAC TOE ENGINE
 * Logic, AI & Win Checking
 */

const tg = window.Telegram.WebApp;

// === 1. КОНФИГУРАЦИЯ ===
const CONFIG = {
    winMultiplier: 1.95, // x1.95 (почти x2)
    drawMultiplier: 1.00 // Возврат
};

const WIN_COMBOS = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], // Горизонтали
    [0, 3, 6], [1, 4, 7], [2, 5, 8], // Вертикали
    [0, 4, 8], [2, 4, 6]             // Диагонали
];

// === 2. СОСТОЯНИЕ ===
let appState = JSON.parse(localStorage.getItem('fastMoneyState')) || {
    balance: { RUB: { real: 0, demo: 10000 }, USDT: { real: 0, demo: 1000 } },
    currency: 'USDT',
    mode: 'demo'
};

let game = {
    isPlaying: false,
    bet: 100,
    playerSide: 'x', // 'x' or 'o'
    botSide: 'o',
    turn: 'x', // чей ход сейчас
    board: Array(9).fill(null), // null, 'x', 'o'
    score: { player: 0, bot: 0, draw: 0 }
};

// Аудио
const audio = {
    play(id) {
        const el = document.getElementById('snd-' + id);
        if (el) { el.currentTime = 0; el.play().catch(()=>{}); }
    }
};

// === 3. ИНИЦИАЛИЗАЦИЯ ===
document.addEventListener('DOMContentLoaded', () => {
    tg.ready(); tg.expand();
    updateBalanceUI();
    setupControls();
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

    // Сброс
    game.isPlaying = true;
    game.board.fill(null);
    game.turn = 'x'; // Всегда X первый
    game.botSide = (game.playerSide === 'x') ? 'o' : 'x';

    // UI
    document.querySelectorAll('.cell').forEach(c => {
        c.className = 'cell';
        c.innerHTML = '';
        c.classList.remove('taken');
    });
    document.getElementById('win-line').style.display = 'none';
    document.getElementById('setup-panel').classList.add('hidden');
    document.getElementById('active-msg').classList.remove('hidden');
    document.getElementById('board').classList.remove('disabled');

    updateStatus();

    // Если игрок О, то бот (Х) ходит первым
    if (game.playerSide === 'o') {
        setTimeout(botMove, 800);
    }
}

function handleCellClick(index) {
    if (!game.isPlaying || game.board[index] !== null) return;
    if (game.turn !== game.playerSide) return; // Не твой ход

    makeMove(index, game.playerSide);
}

function makeMove(index, side) {
    // Логика
    game.board[index] = side;
    
    // UI
    const cell = document.querySelector(`.cell[data-index="${index}"]`);
    cell.classList.add(side, 'taken');
    cell.innerHTML = side === 'x' ? '<i class="fa-solid fa-xmark"></i>' : '<i class="fa-solid fa-o"></i>';
    
    // Звук
    audio.play(side === 'x' ? 'mark-x' : 'mark-o');
    tg.HapticFeedback.impactOccurred('light');

    // Проверка победы
    if (checkWin(side)) {
        endGame('win', side);
        return;
    }

    // Проверка ничьей
    if (!game.board.includes(null)) {
        endGame('draw');
        return;
    }

    // Смена хода
    game.turn = (side === 'x') ? 'o' : 'x';
    updateStatus();

    // Если сейчас ход бота
    if (game.turn === game.botSide) {
        document.getElementById('board').classList.add('disabled'); // Блок
        setTimeout(botMove, 800); // Задержка для реализма
    } else {
        document.getElementById('board').classList.remove('disabled');
    }
}

function botMove() {
    if (!game.isPlaying) return;

    // Простейший ИИ:
    // 1. Попытаться выиграть
    // 2. Блокировать игрока
    // 3. Занять центр
    // 4. Случайный ход

    let move = findBestMove(game.botSide); // Win
    if (move === -1) move = findBestMove(game.playerSide); // Block
    if (move === -1) {
        if (game.board[4] === null) move = 4; // Center
        else {
            // Random available
            const available = game.board.map((v, i) => v === null ? i : null).filter(v => v !== null);
            move = available[Math.floor(Math.random() * available.length)];
        }
    }

    makeMove(move, game.botSide);
}

function findBestMove(forSide) {
    // Ищем линию, где уже 2 символа и 1 пустой
    for (let combo of WIN_COMBOS) {
        const [a, b, c] = combo;
        const vals = [game.board[a], game.board[b], game.board[c]];
        const count = vals.filter(v => v === forSide).length;
        const empty = vals.filter(v => v === null).length;

        if (count === 2 && empty === 1) {
            if (game.board[a] === null) return a;
            if (game.board[b] === null) return b;
            if (game.board[c] === null) return c;
        }
    }
    return -1;
}

function checkWin(side) {
    for (let combo of WIN_COMBOS) {
        const [a, b, c] = combo;
        if (game.board[a] === side && game.board[b] === side && game.board[c] === side) {
            drawWinLine(combo);
            return true;
        }
    }
    return false;
}

function drawWinLine(combo) {
    const line = document.getElementById('win-line');
    // Простейшая логика позиционирования линии
    // В реальном проекте тут математика transform rotate/translate
    // Для демо просто покажем линию (или подсветим ячейки)
    
    // Подсветка ячеек
    combo.forEach(idx => {
        document.querySelector(`.cell[data-index="${idx}"]`).style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
    });
}

// === 5. ЗАВЕРШЕНИЕ ===

function endGame(result, winnerSide) {
    game.isPlaying = false;
    document.getElementById('board').classList.add('disabled');

    const curr = appState.currency;
    const mode = appState.mode;

    if (result === 'draw') {
        // Ничья - возврат
        appState.balance[curr][mode] += Math.floor(game.bet * CONFIG.drawMultiplier);
        
        game.score.draw++;
        audio.play('draw');
        document.getElementById('turn-display').innerText = "НИЧЬЯ!";
        setTimeout(() => showModal('modal-draw'), 1000);
        
    } else {
        // Кто-то выиграл
        if (winnerSide === game.playerSide) {
            // ПОБЕДА ИГРОКА
            const winAmount = Math.floor(game.bet * CONFIG.winMultiplier);
            appState.balance[curr][mode] += winAmount;
            
            game.score.player++;
            audio.play('win');
            tg.HapticFeedback.notificationOccurred('success');
            
            document.getElementById('win-amount').innerText = winAmount;
            document.getElementById('win-curr').innerText = getCurrSym();
            setTimeout(() => showModal('modal-win'), 1000);
            
        } else {
            // ПОБЕДА БОТА
            game.score.bot++;
            audio.play('lose');
            tg.HapticFeedback.notificationOccurred('error');
            setTimeout(() => showModal('modal-loss'), 1000);
        }
    }

    saveState();
    updateBalanceUI();
    updateScoreBoard();
}

function updateStatus() {
    const disp = document.getElementById('turn-display');
    if (game.turn === game.playerSide) {
        disp.innerText = "ВАШ ХОД";
        disp.style.color = "#00ffff";
    } else {
        disp.innerText = "ХОД БОТА...";
        disp.style.color = "#ff00ff";
    }
}

function updateScoreBoard() {
    document.getElementById('score-player').innerText = game.score.player;
    document.getElementById('sco

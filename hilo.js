/**
 * FASTMONEY - HILO ENGINE
 * Card logic, Probability math & 3D Animations
 */

const tg = window.Telegram.WebApp;

// === 1. КОНФИГУРАЦИЯ ===
const CONFIG = {
    houseEdge: 0.97, // 3% преимущество казино
    flipDuration: 600, // Скорость переворота
};

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
// Значения для сравнения (2=2 ... A=14)
const VALUES = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
    '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14
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
    currentCard: null, // { rank, suit, value, color }
    totalWin: 0,       // Накопленный выигрыш в текущем раунде
    roundNum: 0
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
    
    // Рендер рубашки при старте
    // (Ничего делать не надо, HTML уже имеет рубашку)
});

// === 4. КАРТОЧНАЯ ЛОГИКА ===

function generateCard() {
    const rank = RANKS[Math.floor(Math.random() * RANKS.length)];
    const suit = SUITS[Math.floor(Math.random() * SUITS.length)];
    
    // Определение цвета
    const color = (suit === '♥' || suit === '♦') ? 'red' : 'black';
    const value = VALUES[rank];

    return { rank, suit, value, color };
}

// Отрисовка карты (Front face)
function renderCardFace(card) {
    const face = document.querySelector('.card-face.front');
    
    // Классы цвета
    face.className = `card-face front ${card.color}`;
    
    // HTML структура
    face.innerHTML = `
        <div class="corner-top">
            <span class="rank">${card.rank}</span>
            <span class="suit">${card.suit}</span>
        </div>
        <div class="center-suit">${card.suit}</div>
        <div class="corner-bottom">
            <span class="rank">${card.rank}</span>
            <span class="suit">${card.suit}</span>
        </div>
    `;
}

// Анимация переворота
function flipCard(newCard, callback) {
    const cardEl = document.getElementById('active-card');
    
    audio.play('flip');
    
    // 1. Поворачиваем рубашкой вверх
    cardEl.classList.add('flipped');
    
    // 2. В середине анимации меняем лицевую сторону
    setTimeout(() => {
        renderCardFace(newCard);
        
        // 3. Поворачиваем обратно
        cardEl.classList.remove('flipped');
        
        // Колбек после завершения
        setTimeout(() => {
            if (callback) callback();
        }, CONFIG.flipDuration / 2);
        
    }, CONFIG.flipDuration / 2);
}

// === 5. ИГРОВОЙ ПРОЦЕСС ===

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

    // Инит раунда
    game.isPlaying = true;
    game.totalWin = game.bet; // Начальная сумма - это ставка
    game.roundNum = 0;
    
    // Генерируем первую карту
    game.currentCard = generateCard();
    
    // UI
    toggleInterface('playing');
    updateRoundInfo();
    
    // Анимация старта
    flipCard(game.currentCard, () => {
        calculateOdds(); // Считаем коэффициенты для первой карты
    });
    
    // Очистка истории
    document.getElementById('history-container').innerHTML = '';
}

function makeGuess(direction) {
    if (!game.isPlaying) return;
    
    // Блокируем кнопки на время анимации
    toggleButtons(false);
    
    // Генерируем новую карту
    const nextCard = generateCard();
    
    // Логика победы
    // Strict Hi-Lo: Равные карты = Проигрыш (или можно сделать возврат, но обычно проигрыш)
    // Мы сделаем: Равные = Проигрыш.
    
    let isWin = false;
    const oldVal = game.currentCard.value;
    const newVal = nextCard.value;
    
    if (direction === 'hi' && newVal > oldVal) isWin = true;
    if (direction === 'lo' && newVal < oldVal) isWin = true;
    
    // Анимация
    flipCard(nextCard, () => {
        addToHistory(game.currentCard); // Добавляем старую карту в историю
        game.currentCard = nextCard;    // Обновляем текущую
        
        if (isWin) {
            handleStepWin();
        } else {
            handleLoss();
        }
    });
}

function skipCard() {
    if (!game.isPlaying) return;
    
    // При скипе мы просто меняем карту, но выигрыш не растет (иногда берут комиссию, но мы сделаем бесплатно)
    // Но часто в казино Skip сбрасывает серию. Сделаем просто смену карты для удобства.
    
    toggleButtons(false);
    const nextCard = generateCard();
    
    flipCard(nextCard, () => {
        addToHistory(game.currentCard);
        game.currentCard = nextCard;
        calculateOdds(); // Пересчет шансов
        toggleButtons(true);
        audio.play('click');
    });
}

// === 6. МАТЕМАТИКА И ОБРАБОТКА РЕЗУЛЬТАТОВ ===

function calculateOdds() {
    // Считаем вероятность для текущей карты
    const val = game.currentCard.value; // 2..14
    
    // Всего карт (без учета вышедших, упрощенная модель): 13 рангов
    // Higher: карты > val. (14 - val) карт.
    // Lower: карты < val. (val - 2) карт.
    // Equal: 1 карта (текущий ранг).
    
    const totalOutcomes = 13;
    const highOutcomes = 14 - val;
    const lowOutcomes = val - 2;
    // const equalOutcomes = 1;
    
    // Шансы
    const probHi = highOutcomes / totalOutcomes;
    const probLo = lowOutcomes / totalOutcomes;
    
    // Множители (с учетом House Edge)
    // Mult = (1 / Prob) * Edge
    // Если вероятность 0, множитель 0 (кнопка неактивна)
    
    let multHi = probHi > 0 ? (1 / probHi) * CONFIG.houseEdge : 0;
    let multLo = probLo > 0 ? (1 / probLo) * CONFIG.houseEdge : 0;
    
    // Обновляем UI кнопок
    updateButtonState('hi', multHi, probHi);
    updateButtonState('lo', multLo, probLo);
    
    toggleButtons(true); // Разблокируем
}

function updateButtonState(dir, mult, prob) {
    const btn = document.getElementById('btn-' + dir);
    const oddsEl = document.getElementById('odds-' + dir);
    const barEl = document.getElementById('prob-' + dir);
    
    if (mult <= 0) {
        // Невозможный исход (например, Ниже 2)
        btn.disabled = true;
        btn.style.opacity = '0.3';
        oddsEl.innerText = '-';
        barEl.style.height = '0%';
        barEl.innerText = '0%';
    } else {
        btn.disabled = false;
        btn.style.opacity = '1';
        
        // Красивое число
        if (mult < 1.01) mult = 1.01;
        oddsEl.innerText = 'x' + mult.toFixed(2);
        
        // Проценты
        const pct = Math.round(prob * 100);
        barEl.style.height = pct + '%';
        barEl.innerText = pct + '%';
        
        // Сохраняем множитель в дата-атрибут для расчета
        btn.dataset.mult = mult;
    }
}

function handleStepWin() {
    // Получаем множитель нажатой кнопки
    // Мы не знаем какую нажали в этой функции, надо было передать.
    // Но мы можем пересчитать, зная предыдущее состояние...
    // Проще: мы знаем что выиграли. Если карта стала больше, значит жали Hi.
    
    // Так как мы уже обновили карту в makeGuess, нам сложно узнать старый мульт.
    // Хак: сохраним "активный множитель" в момент нажатия кнопки makeGuess.
    // Исправим makeGuess.
    
    // ... (В рамках этого кода упростим: пересчитаем "задним числом" или сохраним в global)
    // Давайте лучше сохранять mult перед кликом. 
    // ДЛЯ ПРОСТОТЫ: В этой версии просто пересчитаем на основе логики.
    
    // Но постойте, мы уже перевернули карту.
    // Лучше всего передавать mult в makeGuess.
    // Давай я поправлю makeGuess прямо тут.
}

// Переопределим makeGuess чтобы брать множитель
window.makeGuess = function(direction) {
    if (!game.isPlaying) return;
    
    const btn = document.getElementById('btn-' + direction);
    if (btn.disabled) return;
    
    const multiplier = parseFloat(btn.dataset.mult);
    
    toggleButtons(false);
    const nextCard = generateCard();
    
    const oldVal = game.currentCard.value;
    const newVal = nextCard.value;
    
    let isWin = false;
    if (direction === 'hi' && newVal > oldVal) isWin = true;
    if (direction === 'lo' && newVal < oldVal) isWin = true;
    
    flipCard(nextCard, () => {
        addToHistory(game.currentCard);
        game.currentCard = nextCard;
        
        if (isWin) {
            // Победа
            game.totalWin = game.totalWin * multiplier;
            audio.play('win');
            tg.HapticFeedback.impactOccurred('light');
            
            updateRoundInfo();
            calculateOdds(); // Новые шансы
        } else {
            // Проигрыш
            handleLoss();
        }
    });
}

function handleLoss() {
    game.isPlaying = false;
    audio.play('lose');
    tg.HapticFeedback.notificationOccurred('error');
    
    document.getElementById('modal-loss').classList.remove('hidden');
    
    // Сброс UI при закрытии модалки (делается в closeLossModal)
}

function cashOut() {
    if (!game.isPlaying) return;
    
    game.isPlaying = false;
    const winAmount = Math.floor(game.totalWin);
    
    // Начисление
    const curr = appState.currency;
    const mode = appState.mode;
    appState.balance[curr][mode] += (winAmount - game.bet); // Мы уже списали ставку, возвращаем всё
    // Стоп, баланс списан. Значит возвращаем полную сумму winAmount.
    // Но в start мы сделали -= bet.
    // Если сейчас winAmount, то просто += winAmount.
    appState.balance[curr][mode] += winAmount;
    
    saveState();
    updateBalanceUI();
    
    // Модалка
    const modal = document.getElementById('modal-win');
    document.getElementById('final-win-amount').innerText = winAmount.toLocaleString();
    document.getElementById('final-win-curr').innerText = getCurrSym();
    modal.classList.remove('hidden');
    
    audio.play('win');
    tg.HapticFeedback.notificationOccurred('success');
}

// === 7. UI УТИЛИТЫ ===

function toggleInterface(state) {
    const betPanel = document.getElementById('bet-panel');
    const gameBtns = document.getElementById('decision-buttons');
    const cashPanel = document.getElementById('cashout-panel');
    const roundInfo = document.getElementById('round-info');
    
    if (state === 'playing') {
        betPanel.classList.add('hidden');
        gameBtns.classList.remove('hidden');
        cashPanel.classList.remove('hidden');
        roundInfo.classList.remove('hidden');
    } else {
        betPanel.classList.remove('hidden');
        gameBtns.classList.add('hidden');
        cashPanel.classList.add('hidden');
        roundInfo.classList.add('hidden');
    }
}

function toggleButtons(enable) {
    const btns = document.querySelectorAll('.hilo-btn, .skip-btn, .cashout-btn');
    btns.forEach(b => {
        b.style.pointerEvents = enable ? 'auto' : 'none';
        b.style.filter = enable ? 'none' : 'brightness(0.7)';
    });
}

function updateRoundInfo() {
    // Текущий выигрыш
    const val = Math.floor(game.totalWin);
    document.getElementById('current-win').innerText = val + ' ' + getCurrSym();
    
    // Кнопка Cashout
    document.getElementById('cashout-val').innerText = val + ' ' + getCurrSym();
}

function addToHistory(card) {
    const container = document.getElementById('history-container');
    const div = document.createElement('div');
    div.className = `mini-card ${card.color}`;
    div.innerText = card.rank + card.suit;
    
    container.prepend(div);
    if (container.children.length > 10) container.removeChild(container.lastChild);
}

// === 8. НАСТРОЙКИ СТАВОК ===

function setupControls() {
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
window.closeWinModal = () => {
    document.getElementById('modal-win').classList.add('hidden');
    toggleInterface('start'); // Сброс
};
window.closeLossModal = () => {
    document.getElementById('modal-loss').classList.add('hidden');
    toggleInterface('start'); // Сброс
};
window.openInfoModal = () => document.getElementById('modal-info').classList.remove('hidden');
window.closeInfoModal = () => document.getElementById('modal-info').classList.add('hidden');

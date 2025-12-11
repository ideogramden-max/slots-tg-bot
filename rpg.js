/**
 * FASTMONEY - RPG BATTLE ENGINE
 * Combat logic, RNG & Animations
 */

const tg = window.Telegram.WebApp;

// === 1. КОНФИГУРАЦИЯ БОЯ ===
const ATTACKS = {
    light: { chance: 65, mult: 1.48, name: "Fast Strike" },
    heavy: { chance: 30, mult: 2.90, name: "Heavy Smash" },
    ult:   { chance: 9,  mult: 9.80, name: "Divine Crit" }
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
    isAttacking: false,
    bet: 100,
    selectedAttack: 'light' // light, heavy, ult
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
});

// === 4. ЛОГИКА БИТВЫ ===

function fight() {
    if (game.isAttacking) return;

    // Проверка баланса
    const curr = appState.currency;
    const mode = appState.mode;
    if (appState.balance[curr][mode] < game.bet) {
        alert("Недостаточно маны (средств)!");
        return;
    }

    game.isAttacking = true;
    
    // Списание
    appState.balance[curr][mode] -= game.bet;
    saveState();
    updateBalanceUI();

    // Блокировка UI
    document.getElementById('attack-btn').style.opacity = '0.5';
    document.querySelector('.attack-selector').style.pointerEvents = 'none';

    // 1. Анимация замаха игрока
    const sword = document.getElementById('player-sword');
    sword.classList.remove('hidden');
    sword.classList.add('attack'); // Запускает CSS анимацию
    
    audio.play('sword');
    tg.HapticFeedback.impactOccurred('medium');

    // 2. Расчет результата (пока идет анимация удара)
    const attackConfig = ATTACKS[game.selectedAttack];
    const roll = Math.random() * 100;
    const isWin = roll < attackConfig.chance;

    // 3. Момент удара (через 300мс после замаха)
    setTimeout(() => {
        // Убираем меч
        sword.classList.remove('attack');
        sword.classList.add('hidden');

        if (isWin) {
            handleHit(attackConfig);
        } else {
            handleBlock(attackConfig);
        }

    }, 300);
}

function handleHit(config) {
    const enemy = document.getElementById('enemy');
    
    // Звук и Визуал
    audio.play('hit');
    tg.HapticFeedback.notificationOccurred('success');
    
    // Босс трясется
    enemy.classList.add('hit');
    setTimeout(() => enemy.classList.remove('hit'), 300);

    // HP падает в 0
    document.getElementById('enemy-hp').style.width = '0%';
    document.getElementById('enemy-hp').style.background = '#555';

    // Цифры урона
    const damage = Math.floor(game.bet * config.mult);
    showDamageText(damage, 'crit');

    // Победа (через небольшую паузу)
    setTimeout(() => {
        const curr = appState.currency;
        const mode = appState.mode;
        appState.balance[curr][mode] += damage;
        saveState();
        updateBalanceUI();

        showWinModal(damage);
        audio.play('win');
    }, 800);
}

function handleBlock() {
    const enemy = document.getElementById('enemy');
    
    // Звук блока
    audio.play('block');
    tg.HapticFeedback.notificationOccurred('error');

    // Цифры "MISS" или "BLOCK"
    showDamageText("BLOCK", 'miss');

    // HP остается полным (или чуть дергается)
    document.getElementById('enemy-hp').style.width = '100%';

    // Поражение
    setTimeout(() => {
        document.getElementById('modal-loss').classList.remove('hidden');
    }, 800);
}

// Создание вылетающего текста
function showDamageText(text, type) {
    const container = document.getElementById('damage-container');
    const el = document.createElement('div');
    el.className = `dmg-text ${type}`;
    el.innerText = text;
    
    // Случайное смещение для реализма
    const randomX = (Math.random() - 0.5) * 40;
    el.style.left = `calc(50% + ${randomX}px)`;
    el.style.top = '40%'; // Старт из центра врага

    container.appendChild(el);

    // Удаляем из DOM после анимации
    setTimeout(() => {
        el.remove();
    }, 1000);
}

// === 5. СБРОС И UI ===

function resetGame() {
    game.isAttacking = false;
    
    // Восстанавливаем босса
    document.getElementById('enemy-hp').style.width = '100%';
    document.getElementById('enemy-hp').style.background = 'linear-gradient(90deg, #ff0000, #ff4444)';
    
    // Разблокируем UI
    document.getElementById('attack-btn').style.opacity = '1';
    document.querySelector('.attack-selector').style.pointerEvents = 'auto';
}

function updateAttackUI() {
    // Снимаем активный класс со всех
    document.querySelectorAll('.atk-btn').forEach(btn => btn.classList.remove('active'));
    
    // Ставим на выбранный
    const selector = `.atk-btn[data-type="${game.selectedAttack}"]`;
    document.querySelector(selector).classList.add('active');
}

// === 6. УПРАВЛЕНИЕ ===

function setupControls() {
    // Выбор атаки
    window.setAttack = (type) => {
        if (game.isAttacking) return;
        game.selectedAttack = type;
        updateAttackUI();
        tg.HapticFeedback.selectionChanged();
    };

    // Кнопка Атака
    document.getElementById('attack-btn').addEventListener('click', fight);

    // Ставки
    window.setBet = (val) => {
        if (game.isAttacking) return;
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

// === 7. УТИЛИТЫ ===

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

window.closeWinModal = () => {
    document.getElementById('modal-win').classList.add('hidden');
    resetGame();
};
window.closeLossModal = () => {
    document.getElementById('modal-loss').classList.add('hidden');
    resetGame();
};
window.openInfoModal = () => document.getElementById('modal-info').classList.remove('hidden');
window.closeInfoModal = () => document.getElementById('modal-info').classList.add('hidden');

/**
 * FASTMONEY - PROFILE CONTROLLER
 * User data, Leveling system, History & Settings
 */

const tg = window.Telegram.WebApp;

// === 1. КОНФИГУРАЦИЯ ===
const XP_PER_LEVEL = 5000; // Сколько оборота нужно для уровня

// === 2. СОСТОЯНИЕ ===
let appState = JSON.parse(localStorage.getItem('fastMoneyState')) || {
    user: { name: "Guest", id: "000000", avatar: null, xp: 0 },
    stats: { games: 0, wins: 0, wagered: 0 },
    history: [], // [{ game: 'Slots', amount: 100, win: true, date: timestamp }]
    settings: { sound: true, haptic: true }
};

// === 3. ИНИЦИАЛИЗАЦИЯ ===
document.addEventListener('DOMContentLoaded', () => {
    tg.ready();
    tg.expand();
    
    // Синхронизация данных из Telegram (если первый вход)
    syncTelegramData();
    
    // Рендер страницы
    renderUserInfo();
    renderLevel();
    renderStats();
    renderHistory();
    loadSettings();
});

// === 4. РЕНДЕР ИНФОРМАЦИИ ===

function syncTelegramData() {
    const user = tg.initDataUnsafe.user;
    if (user) {
        // Обновляем имя, если оно изменилось
        appState.user.name = user.first_name + (user.last_name ? " " + user.last_name : "");
        appState.user.id = user.id;
        
        // Если аватарки нет в базе, но есть в ТГ (и мы еще не меняли сами)
        if (!appState.user.avatar && user.photo_url) {
            appState.user.avatar = user.photo_url;
        }
        
        saveState();
    }
}

function renderUserInfo() {
    document.getElementById('username').innerText = appState.user.name;
    document.getElementById('userid').innerText = appState.user.id;
    
    if (appState.user.avatar) {
        document.getElementById('user-avatar').src = appState.user.avatar;
    }
}

function renderLevel() {
    // XP считается от оборота (wagered) или отдельного поля xp
    const xp = appState.stats.wagered || 0;
    
    // Формула уровня: 1 уровень за каждые 5000$ оборота
    const currentLevel = Math.floor(xp / XP_PER_LEVEL) + 1;
    const nextLevelXp = currentLevel * XP_PER_LEVEL;
    const prevLevelXp = (currentLevel - 1) * XP_PER_LEVEL;
    
    const progress = xp - prevLevelXp;
    const needed = nextLevelXp - prevLevelXp;
    const percent = Math.min((progress / needed) * 100, 100);

    // Названия рангов
    const ranks = ["Новичок", "Игрок", "Любитель", "Профи", "Мастер", "Элита", "Легенда", "Кит"];
    const rankName = ranks[Math.min(currentLevel - 1, ranks.length - 1)];

    // DOM
    document.getElementById('level-name').innerText = rankName;
    document.getElementById('level-num').innerText = currentLevel;
    document.getElementById('current-xp').innerText = Math.floor(progress);
    document.getElementById('next-xp').innerText = XP_PER_LEVEL; // Всегда показывает шаг уровня
    document.getElementById('xp-bar').style.width = percent + '%';
}

function renderStats() {
    document.getElementById('stat-games').innerText = appState.stats.games;
    document.getElementById('stat-wins').innerText = appState.stats.wins;
    document.getElementById('stat-wagered').innerText = formatMoney(appState.stats.wagered);
}

function renderHistory() {
    const list = document.getElementById('history-list');
    
    if (!appState.history || appState.history.length === 0) {
        return; // Оставляем "История пуста"
    }
    
    list.innerHTML = '';
    
    // Берем последние 20 записей и переворачиваем (новые сверху)
    const recent = appState.history.slice(-20).reverse();
    
    recent.forEach(item => {
        // item: { game: 'Slots', amount: 500, type: 'win'/'loss', time: ... }
        
        const el = document.createElement('div');
        const isWin = item.type === 'win';
        el.className = `hist-item ${isWin ? 'win' : 'loss'}`;
        
        // Иконка игры
        const icon = getGameIcon(item.game);
        
        // Время
        const date = new Date(item.time);
        const timeStr = date.getHours().toString().padStart(2, '0') + ':' + date.getMinutes().toString().padStart(2, '0');
        
        const sign = isWin ? '+' : '-';
        const amountStr = `${sign}${formatMoney(item.amount)} $`;

        el.innerHTML = `
            <div class="h-icon"><i class="${icon}"></i></div>
            <div class="h-info">
                <span class="h-name">${item.game}</span>
                <span class="h-date">${timeStr}</span>
            </div>
            <div class="h-amount">${amountStr}</div>
        `;
        
        list.appendChild(el);
    });
}

// === 5. УПРАВЛЕНИЕ АВАТАРОМ ===

window.openAvatarModal = () => {
    document.getElementById('modal-avatar').classList.remove('hidden');
    tg.HapticFeedback.impactOccurred('light');
};

window.setAvatar = (src) => {
    appState.user.avatar = src;
    saveState();
    
    // Обновляем UI
    document.getElementById('user-avatar').src = src;
    
    closeModal('modal-avatar');
    tg.HapticFeedback.notificationOccurred('success');
};

// === 6. НАСТРОЙКИ ===

window.openSettings = () => {
    document.getElementById('modal-settings').classList.remove('hidden');
    tg.HapticFeedback.impactOccurred('light');
};

function loadSettings() {
    if (!appState.settings) appState.settings = { sound: true, haptic: true };
    
    document.getElementById('toggle-sound').checked = appState.settings.sound;
    document.getElementById('toggle-haptic').checked = appState.settings.haptic;
    
    // Листенеры
    document.getElementById('toggle-sound').onchange = (e) => {
        appState.settings.sound = e.target.checked;
        saveState();
    };
    document.getElementById('toggle-haptic').onchange = (e) => {
        appState.settings.haptic = e.target.checked;
        saveState();
    };
}

window.clearData = () => {
    if (confirm("Сбросить весь прогресс и баланс?")) {
        localStorage.removeItem('fastMoneyState');
        tg.HapticFeedback.notificationOccurred('warning');
        window.location.reload();
    }
};

// === 7. УТИЛИТЫ ===

window.closeModal = (id) => {
    document.getElementById(id).classList.add('hidden');
};

function saveState() {
    localStorage.setItem('fastMoneyState', JSON.stringify(appState));
}

function formatMoney(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
    return num.toLocaleString();
}

function getGameIcon(gameName) {
    const map = {
        'Slots': 'fa-solid fa-gem',
        'Mines': 'fa-solid fa-bomb',
        'Crash': 'fa-solid fa-plane-departure',
        'Tower': 'fa-solid fa-dungeon',
        'Dice': 'fa-solid fa-dice',
        'KNB': 'fa-solid fa-hand-scissors',
        'Roulette': 'fa-solid fa-crosshairs',
        'RPG': 'fa-solid fa-dragon',
        'Penalty': 'fa-solid fa-futbol',
        'Warships': 'fa-solid fa-ship',
        'Thimbles': 'fa-solid fa-eye',
        'HiLo': 'fa-solid fa-arrow-up-right-dots'
    };
    return map[gameName] || 'fa-solid fa-gamepad';
}

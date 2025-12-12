/**
 * FASTMONEY - MAFIA ENGINE (Blitz Mode)
 * Role RNG, AI Logic, Voting System
 */

const tg = window.Telegram.WebApp;

// === 1. КОНФИГУРАЦИЯ РОЛЕЙ ===
const ROLES = {
    civilian: { name: "Мирный", mult: 1.5, icon: "fa-user", team: "town", priority: 0 },
    mafia:    { name: "Мафия", mult: 2.0, icon: "fa-user-secret", team: "mafia", priority: 1 },
    don:      { name: "Дон", mult: 2.0, icon: "fa-user-tie", team: "mafia", priority: 1 },
    commissar:{ name: "Комиссар", mult: 1.8, icon: "fa-id-badge", team: "town", priority: 2 },
    doctor:   { name: "Доктор", mult: 1.5, icon: "fa-user-doctor", team: "town", priority: 3 },
    maniac:   { name: "Маньяк", mult: 10.0, icon: "fa-mask", team: "neutral", priority: 4 },
    suicide:  { name: "Самоубийца", mult: 5.0, icon: "fa-skull", team: "neutral", priority: 0 },
    kamikaze: { name: "Камикадзе", mult: 15.0, icon: "fa-bomb", team: "town", priority: 0 },
    homeless: { name: "Бомж", mult: 8.0, icon: "fa-trash", team: "town", priority: 0 },
    lucky:    { name: "Счастливчик", mult: 4.0, icon: "fa-clover", team: "town", priority: 0 }
};

// === 2. СОСТОЯНИЕ ===
let appState = JSON.parse(localStorage.getItem('fastMoneyState')) || {
    balance: { RUB: { real: 0, demo: 10000 }, USDT: { real: 0, demo: 1000 } },
    currency: 'USDT',
    mode: 'demo'
};

let game = {
    phase: 'start', // start, night, day
    dayCount: 1,
    bet: 100,
    myRole: null,
    myIndex: 0, // Игрок всегда индекс 0
    players: [], // Массив объектов игроков
    selectedTarget: null, // Кого выбрал игрок
    logs: [],
    winner: null
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
    
    // Фейковая рассадка для красоты
    initTable(true);
});

// === 4. СТАРТ ИГРЫ ===
function startGame() {
    const curr = appState.currency;
    const mode = appState.mode;
    if (appState.balance[curr][mode] < game.bet) { alert("Недостаточно средств!"); return; }

    // Списание
    appState.balance[curr][mode] -= game.bet;
    saveState();
    updateBalanceUI();

    // Генерация роли
    const roleKeys = Object.keys(ROLES);
    const randomRoleKey = roleKeys[Math.floor(Math.random() * roleKeys.length)];
    game.myRole = ROLES[randomRoleKey];
    game.myRole.key = randomRoleKey; // Сохраняем ключ

    // Показ карточки
    showRoleReveal(game.myRole);
}

function showRoleReveal(role) {
    const modal = document.getElementById('modal-role');
    const card = document.getElementById('reveal-card');
    
    document.getElementById('reveal-title').innerText = role.name;
    document.getElementById('reveal-icon').innerHTML = `<i class="fa-solid ${role.icon}"></i>`;
    document.getElementById('reveal-mult').innerText = 'x' + role.mult.toFixed(1);
    
    // Описания
    const desc = {
        civilian: "Найдите и повесьте мафию.",
        mafia: "Убивайте мирных жителей.",
        don: "Вы глава. Убивайте ночью.",
        commissar: "Проверяйте подозрительных.",
        doctor: "Лечите себя или других.",
        maniac: "Убейте всех. Останьтесь последним.",
        suicide: "Заставьте город повесить вас.",
        kamikaze: "Если вас повесят, заберите мафию.",
        homeless: "Если станете свидетелем - бонус.",
        lucky: "Просто выживите."
    };
    document.getElementById('reveal-desc').innerText = desc[role.key] || "Выживите.";

    modal.classList.remove('hidden');
    audio.play('flip');
    
    setTimeout(() => card.classList.add('flipped'), 100);
}

function acceptRole() {
    document.getElementById('modal-role').classList.add('hidden');
    document.getElementById('reveal-card').classList.remove('flipped');
    
    initGameLogic();
}

// === 5. ЛОГИКА МАТЧА ===
function initGameLogic() {
    game.dayCount = 1;
    game.winner = null;
    game.logs = [];
    
    // 1. Создаем игроков (8 слотов)
    // Юзер - 0. Остальные 1-7 - боты.
    game.players = [];
    
    // Добавляем Юзера
    game.players.push({
        id: 0, name: "ВЫ", role: game.myRole.key, 
        isDead: false, team: game.myRole.team, isUser: true,
        avatar: "https://cdn-icons-png.flaticon.com/512/4825/4825038.png"
    });

    // Пул ролей для ботов (упрощенный баланс)
    // Обязательно: 1-2 мафии, 1 ком, 1 док. Остальные рандом.
    let botRolesPool = ['mafia', 'doctor', 'commissar', 'civilian', 'civilian', 'civilian', 'maniac'];
    // Если игрок занял важную роль, меняем пул
    if (game.myRole.key === 'mafia' || game.myRole.key === 'don') {
        botRolesPool[0] = 'civilian'; // Меньше мафии у ботов
    }
    
    // Перемешиваем и раздаем
    botRolesPool.sort(() => Math.random() - 0.5);
    
    for (let i = 1; i <= 7; i++) {
        const roleKey = botRolesPool[i-1] || 'civilian';
        game.players.push({
            id: i, name: `Игрок ${i}`, role: roleKey,
            isDead: false, team: ROLES[roleKey].team, isUser: false,
            avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${Math.random()}`
        });
    }

    // UI
    initTable(false); // Рисуем реальных игроков
    document.getElementById('bet-panel').classList.add('hidden');
    document.getElementById('action-panel').classList.remove('hidden');
    document.getElementById('my-role-panel').classList.remove('hidden');
    
    // Обновляем мини-карточку
    document.getElementById('my-role-name').innerText = game.myRole.name;
    document.getElementById('my-role-icon').innerHTML = `<i class="fa-solid ${game.myRole.icon}"></i>`;
    document.getElementById('my-role-mult').innerText = 'x' + game.myRole.mult;

    // СТАРТ НОЧИ 1
    log("Город засыпает...", true);
    startNight();
}

function initTable(isFake) {
    const grid = document.getElementById('players-grid');
    grid.innerHTML = '';
    
    const count = isFake ? 8 : game.players.length;
    
    for (let i = 0; i < count; i++) {
        const p = isFake ? { id: i, name: `Игрок ${i}`, isDead: false } : game.players[i];
        
        const seat = document.createElement('div');
        seat.className = `player-seat seat-${i}`;
        if (p.isUser) seat.classList.add('user');
        
        seat.onclick = () => selectPlayer(i);
        seat.id = `seat-${i}`;

        const img = isFake ? "https://cdn-icons-png.flaticon.com/512/63/63699.png" : p.avatar;

        seat.innerHTML = `
            <div class="avatar"><img src="${img}"></div>
            <span class="p-name">${p.name}</span>
        `;
        grid.appendChild(seat);
    }
}

// === 6. ЦИКЛ ДЕНЬ/НОЧЬ ===

function startNight() {
    game.phase = 'night';
    document.getElementById('phase-indicator').className = 'phase-indicator night';
    document.getElementById('phase-indicator').innerHTML = `<i class="fa-solid fa-moon"></i> НОЧЬ ${game.dayCount}`;
    document.body.style.filter = "brightness(0.6)"; // Затемняем
    audio.play('night');

    // Сброс выбора
    game.selectedTarget = null;
    updateTableSelection();

    // Проверяем, может ли игрок действовать
    const role = game.myRole.key;
    const canAct = !game.players[0].isDead && 
                   ['mafia', 'don', 'commissar', 'doctor', 'maniac'].includes(role);

    const btn = document.getElementById('action-btn');
    const txt = document.getElementById('action-text');
    
    if (game.players[0].isDead) {
        txt.innerText = "Вы мертвы. Наблюдайте.";
        btn.innerText = "...";
        btn.disabled = true;
        setTimeout(processNight, 3000); // Быстрая ночь для мертвого
    } else if (canAct) {
        txt.innerText = "Выберите цель:";
        btn.innerText = "ПРИМЕНИТЬ";
        btn.disabled = true; // Ждем выбора
    } else {
        txt.innerText = "Мирные спят...";
        btn.innerText = "СПАТЬ";
        btn.disabled = false;
    }
}

function selectPlayer(id) {
    if (game.phase === 'night' && game.players[0].isDead) return;
    if (game.phase === 'night' && ['civilian', 'suicide', 'kamikaze', 'lucky'].includes(game.myRole.key)) return;
    
    // Нельзя выбрать себя для атаки (обычно), но Доктор может лечить себя
    if (game.phase === 'night' && game.myRole.key !== 'doctor' && id === 0) return;
    if (game.players[id].isDead) return;

    game.selectedTarget = id;
    updateTableSelection();
    
    // Активируем кнопку
    const btn = document.getElementById('action-btn');
    btn.disabled = false;
    btn.classList.add('ready');
}

function updateTableSelection() {
    document.querySelectorAll('.player-seat').forEach(el => el.classList.remove('selected', 'target'));
    if (game.selectedTarget !== null) {
        const seat = document.getElementById(`seat-${game.selectedTarget}`);
        const cls = game.phase === 'night' && game.myRole.key === 'doctor' ? 'selected' : 'target';
        seat.classList.add(cls);
    }
}

function confirmAction() {
    const btn = document.getElementById('action-btn');
    btn.disabled = true;
    btn.classList.remove('ready');
    
    if (game.phase === 'night') {
        processNight();
    } else {
        processVote(); // Дневное голосование
    }
}

// ЛОГИКА НОЧИ (AI)
function processNight() {
    log("Ночные шорохи...", true);
    
    // Собираем ходы
    let kills = []; // Кто кого убивает
    let heals = []; // Кто кого лечит
    let checks = []; // Кто кого проверяет

    // 1. Ход Игрока
    if (!game.players[0].isDead && game.selectedTarget !== null) {
        const role = game.myRole.key;
        if (['mafia', 'don', 'maniac'].includes(role)) kills.push(game.selectedTarget);
        if (role === 'doctor') heals.push(game.selectedTarget);
        if (role === 'commissar') checks.push(game.selectedTarget);
    }

    // 2. Ходы Ботов
    game.players.forEach(p => {
        if (p.isUser || p.isDead) return;
        
        // Мафия бот
        if (p.role === 'mafia' || p.role === 'don') {
            // Ищем жертву (не мафию)
            const targets = game.players.filter(t => !t.isDead && t.team !== 'mafia');
            if (targets.length > 0) {
                const target = targets[Math.floor(Math.random() * targets.length)];
                kills.push(target.id);
            }
        }
        // Доктор бот
        if (p.role === 'doctor') {
            const targets = game.players.filter(t => !t.isDead);
            const target = targets[Math.floor(Math.random() * targets.length)];
            heals.push(target.id);
        }
        // Маньяк бот
        if (p.role === 'maniac') {
            const targets = game.players.filter(t => !t.isDead && t.id !== p.id);
            if (targets.length > 0) kills.push(targets[Math.floor(Math.random() * targets.length)].id);
        }
    });

    // 3. Резолв (Обработка)
    setTimeout(() => {
        let deadThisNight = [];

        // Уникальные киллы (мафия бьет слаженно, считаем один выстрел за команду для простоты, или каждый сам)
        // Упростим: каждый выстрел смертелен, если не вылечили.
        let uniqueKills = [...new Set(kills)];

        uniqueKills.forEach(targetId => {
            if (heals.includes(targetId)) {
                // Спасение
                // log(`Доктор спас игрока ${targetId}.`);
            } else {
                deadThisNight.push(targetId);
                game.players[targetId].isDead = true;
                // Визуал смерти
                document.getElementById(`seat-${targetId}`).classList.add('dead');
            }
        });

        // Результат проверки комиссара (для игрока)
        if (checks.length > 0) {
            const target = game.players[checks[0]];
            const isMafia = target.team === 'mafia';
            alert(`КОМИССАР: Игрок ${target.name} — ${isMafia ? "МАФИЯ!" : "Чист."}`);
        }

        // Переход в День
        startDay(deadThisNight);

    }, 2000);
}

// === 7. ДЕНЬ ===
function startDay(deadList) {
    game.phase = 'day';
    document.body.style.filter = "none";
    document.getElementById('phase-indicator').className = 'phase-indicator day';
    document.getElementById('phase-indicator').innerHTML = `<i class="fa-solid fa-sun"></i> ДЕНЬ ${game.dayCount}`;
    
    // Отчет
    if (deadList.length === 0) {
        log("Доброе утро! Сегодня никто не умер.");
    } else {
        const names = deadList.map(id => game.players[id].name).join(", ");
        log(`Утро не доброе. Убиты: ${names}.`);
        audio.play('shot');
    }

    // Проверка условий победы до голосования
    if (checkGameOver()) return;

    // Голосование
    if (game.players[0].isDead) {
        document.getElementById('action-text').innerText = "Вы мертвы. Идет суд...";
        document.getElementById('action-btn').disabled = true;
        setTimeout(simulateVoting, 3000);
    } else {
        document.getElementById('action-text').innerText = "ГОЛОСОВАНИЕ: Кто мафия?";
        document.getElementById('action-btn').innerText = "ГОЛОСОВАТЬ";
        document.getElementById('action-btn').disabled = true;
        game.selectedTarget = null;
        updateTableSelection();
    }
}

function processVote() {
    // Игрок проголосовал
    simulateVoting(game.selectedTarget);
}

function simulateVoting(playerVote = null) {
    log("Начинается суд Линча...", true);
    
    let votes = {}; // id -> count
    
    // Голоса ботов
    game.players.forEach(p => {
        if (p.isDead) return;
        
        let target;
        if (p.isUser) {
            target = playerVote;
        } else {
            // Логика бота: голосует против случайного живого, не себя
            // Мафия старается валить мирных
            const alive = game.players.filter(t => !t.isDead && t.id !== p.id);
            target = alive[Math.floor(Math.random() * alive.length)].id;
        }
        
        if (target !== null) {
            votes[target] = (votes[target] || 0) + 1;
        }
    });

    // Подсчет
    let maxVotes = 0;
    let victim = null;
    
    for (const [id, count] of Object.entries(votes)) {
        if (count > maxVotes) {
            maxVotes = count;
            victim = id;
        } else if (count === maxVotes) {
            victim = null; // Ничья
        }
    }

    setTimeout(() => {
        audio.play('vote');
        if (victim !== null) {
            const p = game.players[victim];
            p.isDead = true;
            document.getElementById(`seat-${victim}`).classList.add('dead');
            log(`Город решил повесить: ${p.name}.`);
            
            // Проверка Камикадзе/Самоубийцы
            checkSpecialDeaths(p);
        } else {
            log("Ничья. Никого не повесили.");
        }

        if (!checkGameOver()) {
            game.dayCount++;
            setTimeout(startNight, 3000);
        }
    }, 2000);
}

// === 8. ПРОВЕРКА ПОБЕДЫ ===
function checkGameOver() {
    const mafiaAlive = game.players.filter(p => !p.isDead && p.team === 'mafia').length;
    const townAlive = game.players.filter(p => !p.isDead && p.team === 'town').length;
    const maniacAlive = game.players.filter(p => !p.isDead && p.role === 'maniac').length;
    const totalAlive = game.players.filter(p => !p.isDead).length;

    let winTeam = null;

    if (mafiaAlive === 0 && maniacAlive === 0) winTeam = 'town';
    else if (mafiaAlive >= townAlive + maniacAlive) winTeam = 'mafia'; // Мафия доминирует
    else if (maniacAlive > 0 && totalAlive <= 2) winTeam = 'neutral'; // Маньяк 1 на 1 или вин

    if (winTeam) {
        endGame(winTeam);
        return true;
    }
    return false;
}

function endGame(winningTeam) {
    const myP = game.players[0];
    let isWin = false;
    
    // Условия победы игрока
    if (myP.team === winningTeam && !myP.isDead) isWin = true; // Живой победитель
    
    // Спец условия
    // Если я самоубийца и мертв (повешен) - я выиграл раньше (обработано в checkSpecialDeaths)
    // Если я мертв, но команда выиграла - обычно это пол-победы, но в казино проигрыш (надо выжить)
    // НО: Камикадзе и Самоубийца выигрывают смертью. Остальные должны выжить.
    
    if (['civilian', 'doctor', 'commissar', 'mafia', 'don', 'maniac', 'lucky'].includes(myP.role)) {
        if (!isWin) {
            // Если я мертв, но команда выиграла — дадим утешительный приз? Нет, хардкор.
            // Хотя в мафии победа команды считается. Пусть будет победа, если команда выиграла.
            if (myP.team === winningTeam) isWin = true; 
        }
    }

    // Расчет награды
    let amount = 0;
    if (isWin) {
        amount = Math.floor(game.bet * ROLES[myP.role].mult);
        // Доп бонус за сложность выживания
        if (!myP.isDead) amount = Math.floor(amount * 1.2);
    }

    showEndModal(isWin, amount);
}

function checkSpecialDeaths(victim) {
    // Если повесили игрока
    if (victim.isUser) {
        if (victim.role === 'suicide') {
            // Победа Самоубийцы
            showEndModal(true, game.bet * ROLES['suicide'].mult);
            return;
        }
        if (victim.role === 'kamikaze') {
            // Камикадзе забирает случайную мафию
            const mafias = game.players.filter(p => !p.isDead && p.team === 'mafia');
            if (mafias.length > 0) {
                const target = mafias[0];
                target.isDead = true;
                document.getElementById(`seat-${target.id}`).classList.add('dead');
                log(`Камикадзе забрал с собой ${target.name}!`);
                showEndModal(true, game.bet * ROLES['kamikaze'].mult);
            } else {
                log("Камикадзе погиб зря.");
            }
        }
    }
}

// === UI УТИЛИТЫ ===
function log(msg, clear = false) {
    const box = document.getElementById('game-log');
    if (clear) box.innerHTML = '';
    const div = document.createElement('div');
    div.className = 'log-entry';
    div.innerText = msg;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
}

function showEndModal(isWin, amount) {
    const modal = document.getElementById('modal-end');
    const title = document.getElementById('end-title');
    const msg = document.getElementById('end-msg');
    
    if (isWin) {
        title.innerText = "ПОБЕДА";
        title.style.color = "#c0a062";
        msg.innerText = `Ваша роль (${game.myRole.name}) выполнила задачу.`;
        document.getElementById('win-amount').innerText = amount;
        
        // Начисление
        const curr = appState.currency;
        const mode = appState.mode;
        appState.balance[curr][mode] += amount;
        saveState();
        
        audio.play('win');
    } else {
        title.innerText = "ПОРАЖЕНИЕ";
        title.style.color = "#ff3333";
        msg.innerText = "Город пал, или вы погибли зря.";
        document.getElementById('win-amount').innerText = "0";
    }
    
    updateBalanceUI();
    modal.classList.remove('hidden');
}

window.closeEndModal = () => {
    location.reload(); // Перезагрузка для новой партии
};

// Стандартные функции баланса
function updateBalanceUI() {
    const curr = appState.currency;
    const mode = appState.mode;
    document.getElementById('balance-display').innerText = appState.balance[curr][mode].toLocaleString();
    document.getElementById('currency-display').innerText = (curr === 'RUB' ? '₽' : (curr === 'USDT' ? '$' : '★'));
}
function saveState() { localStorage.setItem('fastMoneyState', JSON.stringify(appState)); }
function setupControls() {
    document.getElementById('btn-inc').onclick = () => { if(game.bet<10000) game.bet+=100; document.getElementById('bet-amount').innerText=game.bet; };
    document.getElementById('btn-dec').onclick = () => { if(game.bet>100) game.bet-=100; document.getElementById('bet-amount').innerText=game.bet; };
}
window.openInfoModal = () => document.getElementById('modal-info').classList.remove('hidden');
window.closeInfoModal = () => document.getElementById('modal-info').classList.add('hidden');

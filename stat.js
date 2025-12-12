/**
 * FASTMONEY - STATISTICS CONTROLLER
 * Global Leaderboard & Personal Analytics
 */

const tg = window.Telegram.WebApp;

// === 1. СОСТОЯНИЕ ===
let appState = JSON.parse(localStorage.getItem('fastMoneyState')) || {
    history: [], // [{ game, amount, type: 'win'/'loss' }]
    stats: { games: 0, wins: 0, wagered: 0 }
};

// === 2. ИНИЦИАЛИЗАЦИЯ ===
document.addEventListener('DOMContentLoaded', () => {
    tg.ready();
    tg.expand();
    
    // Анимация чисел в хедере
    animateNumber('online-count', 12000, 14500);
    
    // Инит
    renderLeaderboard();
    renderPersonalStats();
});

// === 3. ПЕРЕКЛЮЧЕНИЕ ТАБОВ ===
window.switchTab = (tab) => {
    const globalView = document.getElementById('view-global');
    const personalView = document.getElementById('view-personal');
    const btnG = document.getElementById('tab-global');
    const btnP = document.getElementById('tab-personal');

    if (tab === 'global') {
        globalView.classList.remove('hidden');
        personalView.classList.add('hidden');
        btnG.classList.add('active');
        btnP.classList.remove('active');
    } else {
        globalView.classList.add('hidden');
        personalView.classList.remove('hidden');
        btnG.classList.remove('active');
        btnP.classList.add('active');
        // Анимация чарта при открытии
        renderChart();
    }
    
    tg.HapticFeedback.selectionChanged();
};

// === 4. ГЛОБАЛЬНЫЙ ЛИДЕРБОРД (ФЕЙК) ===
function renderLeaderboard() {
    const list = document.getElementById('leaderboard-list');
    list.innerHTML = '';

    // Генератор случайных игроков
    const players = [
        { name: "AlexCrypto", profit: 254000, avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Alex" },
        { name: "LuckyStrike", profit: 189500, avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Lucky" },
        { name: "Whale_99", profit: 142000, avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Whale" },
        { name: "WinnerVibe", profit: 98000, avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Vibe" },
        { name: "FastCash", profit: 76500, avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Fast" },
        { name: "TraderJoe", profit: 54000, avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Joe" },
        { name: "MoonBoy", profit: 42100, avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Moon" },
        { name: "ElonM", profit: 33000, avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Elon" },
        { name: "Satoshi_N", profit: 21000, avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Sat" },
        { name: "DogeLover", profit: 15000, avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Doge" }
    ];

    players.forEach((p, index) => {
        const row = document.createElement('div');
        row.className = `lb-row rank-${index + 1}`;
        row.style.animationDelay = `${index * 50}ms`; // Каскадная анимация

        // Форматирование денег
        const profitStr = formatMoney(p.profit);

        row.innerHTML = `
            <div class="lb-user">
                <span style="color:#666; font-size:0.8rem; width:20px;">#${index + 1}</span>
                <img src="${p.avatar}" class="lb-avatar">
                <span class="lb-name">${p.name}</span>
            </div>
            <span class="lb-val">$${profitStr}</span>
        `;
        list.appendChild(row);
    });
}

// === 5. ЛИЧНАЯ СТАТИСТИКА ===
function renderPersonalStats() {
    // 1. Анализ истории
    const history = appState.history || [];
    const totalGames = history.length;
    const wins = history.filter(h => h.type === 'win').length;
    const losses = totalGames - wins;
    
    // 2. Винрейт
    const winrate = totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0;
    
    document.getElementById('cnt-wins').innerText = wins;
    document.getElementById('cnt-losses').innerText = losses;
    document.getElementById('winrate-text').innerText = winrate + '%';
    
    // Сохраняем для анимации чарта
    document.getElementById('winrate-chart').dataset.percent = winrate;

    // 3. Любимая игра
    if (totalGames > 0) {
        const gameCounts = {};
        history.forEach(h => {
            gameCounts[h.game] = (gameCounts[h.game] || 0) + 1;
        });
        
        // Находим макс
        let favGame = Object.keys(gameCounts).reduce((a, b) => gameCounts[a] > gameCounts[b] ? a : b);
        
        document.getElementById('fav-name').innerText = favGame;
        document.getElementById('fav-count').innerText = `${gameCounts[favGame]} раундов`;
        
        // Иконка
        document.getElementById('fav-icon').innerHTML = `<i class="${getGameIcon(favGame)}"></i>`;
    }

    // 4. Финансы
    const wagered = appState.stats.wagered || 0;
    document.getElementById('total-wagered').innerText = formatMoney(wagered) + ' $';

    // Чистый профит (нужно считать по истории, если сохраняли суммы)
    // Упрощенно: считаем по истории
    let net = 0;
    history.forEach(h => {
        if (h.type === 'win') {
            // В истории мы храним только выигрыш, но не ставку. 
            // Это упрощение. Допустим, профит = выигрыш - ставка.
            // Но мы не знаем ставку в истории (в простой версии).
            // Ок, просто покажем 0 или придумаем.
            // В хорошей версии надо хранить { bet: 100, payout: 200 }
            // Сейчас просто заглушка, или берем из wins
            net += h.amount; // Это общая сумма выигрышей (без вычета ставок)
        }
        // Чтобы было честно, нужно вычесть wagered.
        // Net = TotalPayout - TotalWagered
    });
    
    // В appState у нас нет TotalPayout, есть только wins count.
    // Но мы можем грубо прикинуть:
    const realNet = net - wagered;
    const netEl = document.getElementById('net-profit');
    
    netEl.innerText = (realNet >= 0 ? '+' : '') + formatMoney(realNet) + ' $';
    netEl.className = realNet >= 0 ? 'plus' : 'minus';
}

function renderChart() {
    const chart = document.getElementById('winrate-chart');
    const percent = chart.dataset.percent || 0;
    
    // CSS Conic Gradient
    // Зеленый (wins) | Серый (losses)
    // 0deg ... Xdeg
    const deg = (percent / 100) * 360;
    chart.style.background = `conic-gradient(#

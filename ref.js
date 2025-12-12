/**
 * FASTMONEY - REFERRAL SYSTEM
 * Link generation, Dummy data & Claim logic
 */

const tg = window.Telegram.WebApp;

// === 1. СОСТОЯНИЕ ===
let appState = JSON.parse(localStorage.getItem('fastMoneyState')) || {
    balance: { RUB: { real: 0, demo: 10000 }, USDT: { real: 0, demo: 1000 } },
    currency: 'USDT',
    mode: 'demo',
    referrals: [], // { name, avatar, profit, date }
    refEarnings: 0 // Доступно к выводу
};

// === 2. ИНИЦИАЛИЗАЦИЯ ===
document.addEventListener('DOMContentLoaded', () => {
    tg.ready();
    tg.expand();
    
    // Генерируем ссылку
    generateLink();
    
    // Если список пуст, сгенерируем парочку для вида (демо)
    if (!appState.referrals || appState.referrals.length === 0) {
        // Оставим пустым, чтобы пользователь видел empty state
        // Или раскомментируй ниже для авто-заполнения:
        // generateFakeReferrals();
    }

    renderStats();
    renderList();
});

// === 3. ЛОГИКА ===

function generateLink() {
    const userId = tg.initDataUnsafe.user ? tg.initDataUnsafe.user.id : '12345';
    const link = `https://t.me/fastmoneytwo_bot?start=${userId}`;
    document.getElementById('ref-link').value = link;
}

window.copyLink = () => {
    const input = document.getElementById('ref-link');
    input.select();
    input.setSelectionRange(0, 99999);
    
    navigator.clipboard.writeText(input.value).then(() => {
        tg.HapticFeedback.notificationOccurred('success');
        
        const btn = document.querySelector('.copy-btn');
        const icon = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-check"></i>';
        setTimeout(() => btn.innerHTML = icon, 2000);
    });
};

function renderStats() {
    const refs = appState.referrals || [];
    const totalEarned = refs.reduce((acc, curr) => acc + curr.profit, 0);
    
    document.getElementById('ref-count').innerText = refs.length;
    document.getElementById('total-earned').innerText = formatMoney(totalEarned) + ' $';
    
    // Доступно к выводу (симуляция накопления)
    // В реальном приложении это значение с бэкенда
    if (appState.refEarnings === undefined) appState.refEarnings = 0;
    
    // Если демо - добавим рандомно пару баксов
    if (Math.random() > 0.7) {
        appState.refEarnings += Math.random() * 5;
        saveState();
    }

    document.getElementById('available-balance').innerText = formatMoney(appState.refEarnings) + ' $';
    
    const btn = document.getElementById('claim-btn');
    if (appState.refEarnings < 1) {
        btn.disabled = true;
        btn.innerText = "MIN 1 $";
    } else {
        btn.disabled = false;
        btn.innerText = "ЗАБРАТЬ";
    }
}

function renderList() {
    const list = document.getElementById('friends-list');
    const refs = appState.referrals || [];
    
    if (refs.length === 0) return; // Оставляем empty state
    
    list.innerHTML = ''; // Очистка
    
    // Сортировка по дате (новые сверху)
    refs.slice().reverse().forEach(ref => {
        const item = document.createElement('div');
        item.className = 'friend-item';
        
        item.innerHTML = `
            <div class="f-avatar">
                <img src="${ref.avatar}" alt="User">
            </div>
            <div class="f-info">
                <span class="f-name">${ref.name}</span>
                <span class="f-date">${ref.date}</span>
            </div>
            <span class="f-profit">+${formatMoney(ref.profit)} $</span>
        `;
        list.appendChild(item);
    });
}

window.claimRewards = () => {
    if (appState.refEarnings <= 0) return;
    
    const amount = appState.refEarnings;
    
    // Перевод на основной баланс (USDT по умолчанию, или текущую валюту)
    // Допустим, рефка всегда в USDT
    appState.balance['USDT'].real += amount; // Начисляем на реал
    appState.refEarnings = 0;
    
    saveState();
    renderStats();
    
    // Модалка
    document.getElementById('modal-success').classList.remove('hidden');
    tg.HapticFeedback.notificationOccurred('success');
};

// Генератор фейков (для теста)
function generateFakeReferrals() {
    const names = ["Alex", "Dmitry", "Elena", "CryptoKing", "Winner777"];
    appState.referrals = [];
    
    for (let i = 0; i < 3; i++) {
        appState.referrals.push({
            name: names[i],
            avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${i}`,
            profit: Math.floor(Math.random() * 500),
            date: new Date().toLocaleDateString()
        });
    }
    appState.refEarnings = 154.50;
    saveState();
}

// === УТИЛИТЫ ===
window.closeSuccessModal = () => document.getElementById('modal-success').classList.add('hidden');
window.openInfoModal = () => document.getElementById('modal-info').classList.remove('hidden');
window.closeInfoModal = () => document.getElementById('modal-info').classList.add('hidden');

function formatMoney(num) {
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function saveState() {
    localStorage.setItem('fastMoneyState', JSON.stringify(appState));
  }

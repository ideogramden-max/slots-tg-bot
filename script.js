/**
 * FASTMONEY - CORE ENGINE (Client-Server Version)
 * Handles User Init, Balance Sync & Mode Switching
 */

const tg = window.Telegram.WebApp;

// === НАСТРОЙКИ СЕРВЕРА ===
const CONFIG = {
    // Твоя вечная ссылка (пока работает туннель)
    SERVER_URL: "https://alpha-firms-electronics-return.trycloudflare.com", 
};

// === СОСТОЯНИЕ ===
let appState = {
    user: { name: "Guest", id: "000000", avatar: null, xp: 0 },
    balance: { real: 0, demo: 10000 },
    currency: 'USDT', // Визуальное отображение (в базе все в $)
    mode: 'demo',     // 'real' или 'demo'
    history: []
};

// === ИНИЦИАЛИЗАЦИЯ ===
document.addEventListener('DOMContentLoaded', () => {
    tg.ready();
    tg.expand();

    // 1. Загружаем сохраненный режим
    const savedMode = localStorage.getItem('fastMoneyMode');
    if (savedMode) appState.mode = savedMode;

    // 2. Получаем данные от Телеграм
    const user = tg.initDataUnsafe.user;
    
    // 3. Запрос к серверу за актуальным балансом
    initUserFromServer(user);

    initBackground();
});

async function initUserFromServer(tgUser) {
    if (!tgUser) {
        updateUI();
        return;
    }

    try {
        const response = await fetch(`${CONFIG.SERVER_URL}/api/user/init`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: tgUser.id,
                username: tgUser.username || tgUser.first_name
            })
        });

        const data = await response.json();

        if (data.error) {
            console.error("Server Error:", data.error);
            return;
        }

        // Обновляем стейт данными с сервера
        appState.user.id = data.user.id;
        appState.user.name = tgUser.first_name; 
        appState.user.xp = data.user.xp;
        
        appState.balance.real = data.balance.real;
        appState.balance.demo = data.balance.demo;

        if (tgUser.photo_url) appState.user.avatar = tgUser.photo_url;

        // Сохраняем локально
        localStorage.setItem('fastMoneyState', JSON.stringify(appState));
        
        updateUI();

    } catch (e) {
        console.error("Connection Failed:", e);
        const cached = localStorage.getItem('fastMoneyState');
        if (cached) {
            appState = JSON.parse(cached);
            updateUI();
        }
    }
}

// === UI LOGIC ===

function updateUI() {
    const nameEl = document.getElementById('username');
    if (nameEl) nameEl.innerText = appState.user.name;
    
    const idEl = document.getElementById('userid');
    if (idEl) idEl.innerText = appState.user.id;

    if (appState.user.avatar) {
        const ava = document.getElementById('user-avatar');
        if (ava) ava.src = appState.user.avatar;
    }

    document.querySelectorAll('.toggle-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById(appState.mode === 'real' ? 'btn-real' : 'btn-demo');
    if (activeBtn) activeBtn.classList.add('active');

    const balanceEl = document.getElementById('balance-amount');
    if (balanceEl) {
        const currentAmount = appState.balance[appState.mode];
        animateValue(balanceEl, parseFloat(balanceEl.innerText.replace(/[^0-9.]/g, '') || 0), currentAmount);
    }
}

window.setMode = (mode) => {
    if (appState.mode === mode) return;
    
    appState.mode = mode;
    localStorage.setItem('fastMoneyMode', mode);
    
    updateUI();
    tg.HapticFeedback.impactOccurred('light');
};

// === UTILS ===

function animateValue(obj, start, end) {
    if (start === end) return;
    let startTimestamp = null;
    const duration = 500;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const val = Math.floor(start + (end - start) * progress);
        obj.innerHTML = val.toLocaleString();
        if (progress < 1) {
            window.requestAnimationFrame(step);
        } else {
            obj.innerHTML = end.toLocaleString();
        }
    };
    window.requestAnimationFrame(step);
}

function initBackground() {
    const canvas = document.getElementById('bg-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let width, height;
    function resize() {
        width = window.innerWidth;
        height = window.innerHeight;
        canvas.width = width;
        canvas.height = height;
    }
    window.addEventListener('resize', resize);
    resize();

    const particles = Array.from({ length: 20 }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        speed: Math.random() * 0.5 + 0.1,
        size: Math.random() * 2
    }));

    function animate() {
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = 'rgba(0, 240, 255, 0.2)';
        particles.forEach(p => {
            p.y -= p.speed;
            if (p.y < 0) p.y = height;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
        });
        requestAnimationFrame(animate);
    }
    animate();
}

window.navigateTo = (url) => {
    tg.HapticFeedback.impactOccurred('medium');
    setTimeout(() => { window.location.href = url; }, 100);
};

window.openDepositModal = () => window.location.href = 'deposit.html';
window.openWalletModal = () => window.location.href = 'withdraw.html';

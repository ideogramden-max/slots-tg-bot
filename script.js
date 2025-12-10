// === FASTMONEY CORE ===

const tg = window.Telegram.WebApp;

// Начальное состояние (если зашли первый раз)
const defaultState = {
    balance: {
        RUB: { real: 0, demo: 10000 },
        USDT: { real: 0, demo: 1000 },
        STARS: { real: 0, demo: 5000 }
    },
    currency: 'USDT',
    mode: 'demo', // 'real' or 'demo'
    user: {
        name: 'Guest',
        id: '000000'
    }
};

// Загрузка состояния
let appState = JSON.parse(localStorage.getItem('fastMoneyState')) || defaultState;

// Сохранение состояния
function saveState() {
    localStorage.setItem('fastMoneyState', JSON.stringify(appState));
}

// === ИНИЦИАЛИЗАЦИЯ ===
document.addEventListener('DOMContentLoaded', () => {
    tg.ready();
    tg.expand();
    
    // Получение данных юзера из ТГ
    const user = tg.initDataUnsafe.user;
    if (user) {
        appState.user.name = user.first_name;
        appState.user.id = user.id;
        document.getElementById('username').innerText = user.first_name;
        document.getElementById('userid').innerText = user.id;
        
        // Пытаемся загрузить аватарку
        if (user.photo_url) document.getElementById('user-avatar').src = user.photo_url;
    }
    
    saveState(); // Обновляем данные юзера
    updateUI();
    initBackground();
});

// === UI LOGIC ===

function updateUI() {
    // 1. Валюта
    const curr = appState.currency;
    document.getElementById('curr-name').innerText = curr;
    
    // Иконка валюты
    const icon = document.getElementById('curr-icon');
    if (curr === 'USDT') icon.src = 'https://cryptologos.cc/logos/tether-usdt-logo.png';
    else if (curr === 'RUB') icon.src = 'https://cdn-icons-png.flaticon.com/512/330/330437.png'; // Флаг/символ
    else if (curr === 'STARS') icon.src = 'https://cdn-icons-png.flaticon.com/512/1828/1828884.png'; // Звезда

    // 2. Режим (Demo/Real)
    const mode = appState.mode;
    document.getElementById('btn-real').classList.toggle('active', mode === 'real');
    document.getElementById('btn-demo').classList.toggle('active', mode === 'demo');

    // 3. Баланс
    const balanceVal = appState.balance[curr][mode];
    const balanceEl = document.getElementById('balance-amount');
    
    // Анимация чисел
    animateValue(balanceEl, parseInt(balanceEl.innerText.replace(/[^0-9]/g, '') || 0), balanceVal);
    
    // Символ
    const symMap = { 'RUB': '₽', 'USDT': '$', 'STARS': '★' };
    document.getElementById('main-curr-sym').innerText = symMap[curr];
}

// Переключатель режима
window.setMode = (mode) => {
    if (appState.mode === mode) return;
    appState.mode = mode;
    saveState();
    updateUI();
    tg.HapticFeedback.impactOccurred('light');
};

// Меню валюты
const dropdown = document.getElementById('curr-dropdown');
document.getElementById('currency-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('hidden');
    tg.HapticFeedback.selectionChanged();
});

// Смена валюты
window.changeCurrency = (curr) => {
    appState.currency = curr;
    saveState();
    updateUI();
    dropdown.classList.add('hidden');
};

// Закрытие дропдауна при клике вне
document.addEventListener('click', () => dropdown.classList.add('hidden'));

// Навигация с вибрацией
window.navigateTo = (url) => {
    tg.HapticFeedback.impactOccurred('medium');
    // Небольшая задержка для анимации клика
    setTimeout(() => {
        window.location.href = url;
    }, 100);
};

// === UTILS ===
function animateValue(obj, start, end) {
    if (start === end) return;
    let startTimestamp = null;
    const duration = 500;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        obj.innerHTML = Math.floor(progress * (end - start) + start).toLocaleString();
        if (progress < 1) {
            window.requestAnimationFrame(step);
        } else {
            obj.innerHTML = end.toLocaleString();
        }
    };
    window.requestAnimationFrame(step);
}

// === BACKGROUND PARTICLES (Упрощенные для производительности) ===
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

    const particles = Array.from({ length: 30 }, () => ({
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

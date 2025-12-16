/**
 * FASTMONEY - MAIN LOBBY CONTROLLER
 * Управляет состоянием приложения, навигацией и обновлением UI главной страницы.
 * Зависимости: Config, API, Utils
 */

// Инициализация Telegram WebApp
const tg = window.Telegram.WebApp;

// === 1. ГЛОБАЛЬНОЕ СОСТОЯНИЕ (STATE) ===
const App = {
    // Данные пользователя (по умолчанию заглушка)
    user: {
        id: 0,
        username: "Guest",
        avatar: null,
        level: 1,
        xp: 0
    },

    // Балансы (хранятся в базовых валютах: Real = USD, Demo = Chips)
    balance: {
        real: 0.00,
        demo: 10000.00
    },

    // Текущие настройки сессии
    state: {
        mode: 'demo',        // 'real' | 'demo'
        currency: 'USDT',    // Текущая визуальная валюта
        isLoading: false
    }
};

// === 2. ТОЧКА ВХОДА ===
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Настройка Telegram
    tg.ready();
    tg.expand(); // На весь экран
    
    // Настраиваем цвета хедера под тему
    if (tg.themeParams && tg.themeParams.bg_color) {
        document.body.style.backgroundColor = tg.themeParams.bg_color;
    }

    // 2. Загрузка сохраненных настроек
    loadLocalSettings();

    // 3. Инициализация UI (сначала рисуем кеш/дефолт, чтобы не было белого экрана)
    renderAll();
    initBackground();     // Запуск Canvas анимации
    initOnlineCounter();  // Запуск фейкового онлайна

    // 4. Запрос данных с сервера
    await syncUserData();
});

// === 3. ЛОГИКА ДАННЫХ ===

/**
 * Загрузка настроек из LocalStorage
 */
function loadLocalSettings() {
    // Режим игры
    const savedMode = localStorage.getItem('fastMoney_mode');
    if (savedMode && ['real', 'demo'].includes(savedMode)) {
        App.state.mode = savedMode;
    }

    // Выбранная валюта
    const savedCurr = localStorage.getItem('fastMoney_currency');
    if (savedCurr && Config.CURRENCY.LIST[savedCurr]) {
        App.state.currency = savedCurr;
    }
}

/**
 * Синхронизация с Бэкендом
 */
async function syncUserData() {
    App.state.isLoading = true;
    
    try {
        // Данные для отправки (берем из ТГ)
        const tgUser = tg.initDataUnsafe?.user || {};
        
        const requestData = {
            user_id: tgUser.id || 0,
            username: tgUser.username || tgUser.first_name || "Guest",
            // Передаем ref код, если он есть в start_param
            ref_code: tg.initDataUnsafe?.start_param || null
        };

        // Запрос API
        const response = await API.post(Config.API.USER_INIT, requestData);

        if (response.status === 'ok') {
            // Обновляем стейт
            App.user.id = response.user.id;
            App.user.username = response.user.username;
            App.user.xp = response.user.xp;
            App.user.level = calculateLevel(response.user.xp); // Расчет уровня
            
            // Балансы с сервера
            App.balance.real = parseFloat(response.balance.real);
            App.balance.demo = parseFloat(response.balance.demo);

            // Аватар берем из ТГ, так как на сервере хранить ссылки ненадежно (они протухают)
            if (tgUser.photo_url) {
                App.user.avatar = tgUser.photo_url;
            }
            
            // Ререндер
            renderAll();
        }
    } catch (error) {
        console.error("Sync Error:", error);
        // Если ошибка сети, не пугаем юзера, он видит кешированные или демо данные
        if(Config.SYSTEM.DEBUG_MODE) Utils.vibrate('error');
    } finally {
        App.state.isLoading = false;
    }
}

// === 4. УПРАВЛЕНИЕ UI (RENDER) ===

function renderAll() {
    renderUser();
    renderBalance();
    renderControls();
}

/**
 * Отрисовка шапки профиля
 */
function renderUser() {
    // Имя
    const nameEl = document.getElementById('username');
    nameEl.innerText = Utils.maskUsername(App.user.username);

    // ID
    const idEl = document.getElementById('userid');
    idEl.innerText = App.user.id === 0 ? "GUEST" : App.user.id;

    // Аватар
    const avaEl = document.getElementById('user-avatar');
    if (App.user.avatar) {
        avaEl.src = App.user.avatar;
    }

    // Уровень (Бейдж)
    const lvlEl = document.getElementById('user-level-badge');
    if (lvlEl) lvlEl.innerText = App.user.level;
}

/**
 * Отрисовка баланса с анимацией и конвертацией
 */
function renderBalance() {
    const amountEl = document.getElementById('balance-amount');
    const symEl = document.getElementById('main-curr-sym');
    
    // 1. Определяем базовую сумму (Real или Demo)
    let baseAmount = App.state.mode === 'real' ? App.balance.real : App.balance.demo;
    
    // 2. Если режим DEMO, игнорируем выбранную валюту и показываем D$
    // Если REAL, конвертируем в выбранную (RUB, STARS, USDT)
    let displayAmount = baseAmount;
    let displaySym = '$';
    let decimals = 2;

    if (App.state.mode === 'demo') {
        displaySym = 'D$';
        decimals = 2;
    } else {
        // Конвертация Real Balance (USD) -> Selected Currency
        const currCode = App.state.currency;
        const rate = Config.CURRENCY.RATES[currCode] || 1;
        const conf = Config.CURRENCY.LIST[currCode];
        
        displayAmount = baseAmount * rate;
        displaySym = conf.symbol;
        decimals = conf.decimals;
    }

    // 3. Обновляем DOM
    symEl.innerText = displaySym;
    
    // Анимация счетчика (Odometer effect)
    animateCounter(amountEl, displayAmount, decimals);
}

/**
 * Обновление кнопок (активный класс)
 */
function renderControls() {
    // Переключатель Real/Demo
    document.querySelectorAll('.toggle-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtnId = App.state.mode === 'real' ? 'btn-real' : 'btn-demo';
    document.getElementById(activeBtnId).classList.add('active');

    // Селектор валюты
    // Обновляем иконку и текст в хедере
    const currConf = Config.CURRENCY.LIST[App.state.currency];
    const currIcon = document.getElementById('curr-icon');
    const currName = document.getElementById('curr-name');
    
    if (currConf.isCrypto || App.state.currency === 'USDT') {
        currIcon.src = "https://cryptologos.cc/logos/tether-usdt-logo.png";
        currIcon.style.display = "block";
    } else if (App.state.currency === 'STARS') {
        // Для звезд у нас иконка fontawesome внутри списка, но в хедере картинка
        // Можно заменить src на прозрачный png и использовать фон, но проще скрыть img и показать i
        // Для простоты в этом коде оставим логику картинок, предполагая что есть иконка звезды png
        currIcon.style.display = "none"; // Временно скрываем, если нет картинки
    } else {
        currIcon.style.display = "none"; // Для рубля скрываем картинку
    }
    
    currName.innerText = App.state.currency;
}

// === 5. ДЕЙСТВИЯ ПОЛЬЗОВАТЕЛЯ ===

/**
 * Переключение режима Real / Demo
 */
window.setMode = (mode) => {
    if (App.state.mode === mode) return;

    App.state.mode = mode;
    localStorage.setItem('fastMoney_mode', mode);
    
    // Визуальный отклик
    Utils.vibrate('medium');
    
    // Перерисовка
    renderAll();
    
    // Можно добавить эффект "перезагрузки" баланса
    const balEl = document.getElementById('balance-amount');
    balEl.style.opacity = '0.5';
    setTimeout(() => balEl.style.opacity = '1', 200);
};

/**
 * Смена валюты отображения
 */
window.changeCurrency = (code) => {
    if (!Config.CURRENCY.LIST[code]) return;
    
    App.state.currency = code;
    localStorage.setItem('fastMoney_currency', code);
    
    Utils.vibrate('selection');
    
    // Скрываем дропдаун
    document.getElementById('curr-dropdown').classList.add('hidden');
    
    renderAll();
};

/**
 * Навигация с задержкой для анимации нажатия
 */
window.navigateTo = (url) => {
    Utils.vibrate('light');
    setTimeout(() => {
        window.location.href = url;
    }, 100);
};

// === 6. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ===

/**
 * Плавная анимация чисел
 */
let currentAnimation = null;
function animateCounter(element, targetValue, decimals) {
    const startValue = parseFloat(element.innerText.replace(/[^0-9.]/g, '')) || 0;
    if (startValue === targetValue) {
        element.innerText = formatValue(targetValue, decimals);
        return;
    }

    const duration = 600; // ms
    const startTime = performance.now();

    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Easing function (easeOutQuart)
        const ease = 1 - Math.pow(1 - progress, 4);
        
        const current = startValue + (targetValue - startValue) * ease;
        element.innerText = formatValue(current, decimals);

        if (progress < 1) {
            currentAnimation = requestAnimationFrame(update);
        } else {
            element.innerText = formatValue(targetValue, decimals);
        }
    }

    if (currentAnimation) cancelAnimationFrame(currentAnimation);
    currentAnimation = requestAnimationFrame(update);
}

function formatValue(val, decimals) {
    return val.toLocaleString('ru-RU', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
}

function calculateLevel(xp) {
    // Простая формула: уровень каждые 1000 XP (или как в конфиге)
    return Math.floor(xp / 5000) + 1;
}

// === 7. ФОНОВЫЕ ПРОЦЕССЫ ===

/**
 * Имитация живого онлайна
 */
function initOnlineCounter() {
    const el = document.getElementById('online-counter');
    let count = Utils.randomInt(12000, 15000); // Стартовое значение
    
    el.innerText = count.toLocaleString();

    setInterval(() => {
        // Небольшие колебания +/-
        const change = Utils.randomInt(-50, 80);
        count += change;
        el.innerText = count.toLocaleString();
    }, 4000);
}

/**
 * Canvas Анимация (Частицы на фоне)
 */
function initBackground() {
    const canvas = document.getElementById('bg-canvas');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    let width, height;
    let particles = [];

    // Настройка размеров
    const resize = () => {
        width = window.innerWidth;
        height = window.innerHeight;
        canvas.width = width;
        canvas.height = height;
    };
    window.addEventListener('resize', resize);
    resize();

    // Создание частиц
    const particleCount = 25; // Не много, чтобы не грузить телефон
    for (let i = 0; i < particleCount; i++) {
        particles.push({
            x: Math.random() * width,
            y: Math.random() * height,
            radius: Math.random() * 2 + 1,
            speedY: Math.random() * 0.5 + 0.1, // Медленно падают или всплывают
            opacity: Math.random() * 0.5 + 0.1
        });
    }

    // Рендер цикл
    function animate() {
        ctx.clearRect(0, 0, width, height);
        
        particles.forEach(p => {
            // Обновление позиции
            p.y -= p.speedY;
            
            // Если улетел вверх, возвращаем вниз
            if (p.y < -10) {
                p.y = height + 10;
                p.x = Math.random() * width;
            }

            // Рисование
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(0, 240, 255, ${p.opacity})`; // Neon Blue
            ctx.fill();
        });

        requestAnimationFrame(animate);
    }

    animate();
        }

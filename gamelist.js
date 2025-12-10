/**
 * FASTMONEY - GAMELIST CONTROLLER
 * Логика каталога игр
 */

const tg = window.Telegram.WebApp;

// === 1. ЗАГРУЗКА ДАННЫХ ===
// Получаем состояние, сохраненное на Главной (index.html)
let appState = JSON.parse(localStorage.getItem('fastMoneyState')) || {
    // Дефолт на случай, если открыли файл напрямую без index.html
    balance: { 
        RUB: { real: 0, demo: 10000 },
        USDT: { real: 0, demo: 1000 },
        STARS: { real: 0, demo: 5000 }
    },
    currency: 'USDT',
    mode: 'demo'
};

// === 2. ИНИЦИАЛИЗАЦИЯ ===
document.addEventListener('DOMContentLoaded', () => {
    tg.ready();
    tg.expand();
    
    // Настраиваем цвет хедера под тему, если нужно
    // document.querySelector('.page-header').style.backgroundColor = tg.themeParams.bg_color;

    updateHeaderBalance();
    
    // Анимация входа карточек
    animateCardsEntry();
});

// === 3. ОБНОВЛЕНИЕ UI ===
function updateHeaderBalance() {
    const curr = appState.currency;
    const mode = appState.mode;
    
    // Получаем текущую сумму
    const amount = appState.balance[curr][mode];
    
    // Символы валют
    const symMap = { 
        'RUB': '₽', 
        'USDT': '$', 
        'STARS': '★' 
    };

    // Обновляем текст
    const amountEl = document.getElementById('header-balance');
    const currEl = document.getElementById('header-currency');
    
    if (amountEl) amountEl.innerText = amount.toLocaleString();
    if (currEl) currEl.innerText = symMap[curr] || curr;
    
    // Если режим DEMO, можно подкрасить баланс серым или добавить пометку
    if (mode === 'demo') {
        amountEl.style.opacity = '0.9';
        currEl.innerHTML += ' <span style="font-size:0.6rem; vertical-align:middle;">(DEMO)</span>';
    }
}

// === 4. ЛОГИКА ФИЛЬТРАЦИИ ===
window.filterGames = (category) => {
    // 1. Вибрация
    tg.HapticFeedback.selectionChanged();

    // 2. Переключение активной кнопки
    document.querySelectorAll('.cat-btn').forEach(btn => {
        btn.classList.remove('active');
        // Проверяем по тексту onclick атрибута или просто добавляем логику клика
        // В данном случае мы ищем кнопку, которая вызвала функцию, но через JS проще так:
    });
    
    // Ищем кнопку, которую нажали (через event)
    const activeBtn = event.target;
    activeBtn.classList.add('active');

    // 3. Фильтрация карточек
    const cards = document.querySelectorAll('.game-card');
    const container = document.getElementById('games-grid');

    // Сброс анимации контейнера, чтобы проигралась снова
    container.style.animation = 'none';
    container.offsetHeight; /* trigger reflow */
    container.style.animation = 'fadeInGrid 0.4s ease-out';

    let visibleCount = 0;

    cards.forEach(card => {
        // Если категория 'all' ИЛИ у карточки есть класс этой категории
        if (category === 'all' || card.classList.contains(category)) {
            card.style.display = 'flex';
            visibleCount++;
        } else {
            card.style.display = 'none';
        }
    });

    // Если ничего не найдено (на будущее)
    if (visibleCount === 0) {
        // Можно показать заглушку "Нет игр"
    }
};

// === 5. НАВИГАЦИЯ ===

// Кнопка Назад
window.goBack = () => {
    tg.HapticFeedback.impactOccurred('light');
    // Небольшая задержка для визуального отклика
    setTimeout(() => {
        window.location.href = 'index.html';
    }, 50);
};

// Открытие игры
window.openGame = (url) => {
    tg.HapticFeedback.impactOccurred('medium');
    
    // Тут можно добавить проверку баланса перед входом
    // if (appState.balance[appState.currency][appState.mode] <= 0) { ... }

    // Эффект нажатия
    setTimeout(() => {
        window.location.href = url;
    }, 100);
};

// === 6. ДЕКОРАТИВНЫЕ ЭФФЕКТЫ ===

function animateCardsEntry() {
    const cards = document.querySelectorAll('.game-card');
    cards.forEach((card, index) => {
        card.style.opacity = '0';
        card.style.transform = 'translateY(20px)';
        // Каскадная анимация (каждая следующая чуть позже)
        setTimeout(() => {
            card.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
            card.style.opacity = '1';
            card.style.transform = 'translateY(0)';
        }, index * 50); // 50мс задержка между карточками
    });
}

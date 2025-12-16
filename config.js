/**
 * FASTMONEY - GLOBAL CONFIGURATION
 * Единый источник правды для всех настроек приложения.
 */

const Config = {
    // =========================================
    // 1. СЕТЕВЫЕ НАСТРОЙКИ (API & SOCKETS)
    // =========================================
    
    // Текущий адрес бэкенда (Туннель или VDS IP)
    // В продакшене заменить на реальный домен (напр. https://api.fastmoney.game)
    API_BASE_URL: "https://alpha-firms-electronics-return.trycloudflare.com",
    
    // Адрес вебсокетов (обычно меняется https -> wss)
    // Используется для Чата, Краша и Лайв-ленты
    WS_BASE_URL: "wss://alpha-firms-electronics-return.trycloudflare.com/ws",

    // Таймаут запросов (мс)
    REQUEST_TIMEOUT: 10000,

    // Эндпоинты API (Карта маршрутов)
    API: {
        // --- Core ---
        USER_INIT:      "/api/user/init",       // Получение профиля и баланса
        USER_UPDATE:    "/api/user/update",     // Сохранение настроек
        
        // --- Finance ---
        PAYMENT_CREATE: "/api/create_payment",  // Создание инвойса (1plat/Stars)
        PAYOUT_REQ:     "/api/payout/request",  // Запрос на вывод
        TRANS_HISTORY:  "/api/payout/history",  // История транзакций
        
        // --- Games (General) ---
        CRASH_BET:      "/api/crash/bet",
        CRASH_CASHOUT:  "/api/crash/cashout",
        CRASH_STATUS:   "/api/crash/status",
        
        MINES_START:    "/api/mines/start",
        MINES_CLICK:    "/api/mines/click",
        MINES_CASHOUT:  "/api/mines/cashout",
        
        SLOT_SPIN:      "/api/slot/spin",
        
        // Другие игры (шаблоны)
        TOWER_START:    "/api/tower/start",
        TOWER_STEP:     "/api/tower/step",
        TOWER_CASHOUT:  "/api/tower/cashout",
        
        // --- Social ---
        CHAT_HISTORY:   "/api/chat/history",
        LEADERBOARD:    "/api/stats/leaderboard",
        LIVE_FEED:      "/api/stats/live",
        
        // --- Promo ---
        REF_STATS:      "/api/ref/stats",       // Статистика рефералов
        REF_CLAIM:      "/api/ref/claim",       // Вывод рефки
        FAUCET_CLAIM:   "/api/balance/faucet"   // Бесплатные демо-деньги
    },

    // =========================================
    // 2. НАСТРОЙКИ ВАЛЮТ
    // =========================================
    
    CURRENCY: {
        // Основная валюта игры (в которой ведутся расчеты на бэке)
        DEFAULT: 'USDT', 
        
        // Конфигурация отображения
        LIST: {
            'USDT':  { symbol: '$', name: 'USDT (TRC20)', isCrypto: true, decimals: 2 },
            'RUB':   { symbol: '₽', name: 'Российский Рубль', isCrypto: false, decimals: 0 },
            'STARS': { symbol: '★', name: 'Telegram Stars', isCrypto: false, decimals: 0 },
            'DEMO':  { symbol: 'D$', name: 'Demo Chips', isCrypto: false, decimals: 2 }
        },

        // Курсы конвертации (примерные, для UI, точные считает сервер)
        // 1 USD равен:
        RATES: {
            'RUB': 96.5,
            'STARS': 50,  // 1$ = 50 звезд (пример)
            'USDT': 1
        }
    },

    // =========================================
    // 3. ИГРОВЫЕ ЛИМИТЫ И НАСТРОЙКИ
    // =========================================
    
    GAME_SETTINGS: {
        // Лимиты ставок (в $)
        MIN_BET: 0.10,
        MAX_BET: 1000.00,
        
        // Настройки демо-режима
        START_DEMO_BALANCE: 10000,
        FAUCET_AMOUNT: 1000,     // Сколько дает кран
        FAUCET_COOLDOWN: 3600,   // Секунд (1 час)
        
        // Настройки анимаций
        ANIMATION_SPEED: 1.0,    // Множитель скорости (для ускорения игр)
    },

    // =========================================
    // 4. СИСТЕМНЫЕ НАСТРОЙКИ
    // =========================================
    
    SYSTEM: {
        APP_VERSION: "2.5.1",
        DEBUG_MODE: true,        // Включает логи в консоль
        LANGUAGE: "ru",          // Язык интерфейса (пока только RU)
        
        // Ссылки на ресурсы
        SOUNDS_PATH: "assets/sounds/",
        IMAGES_PATH: "assets/icons/",
        
        // Ссылка на поддержку
        SUPPORT_URL: "https://t.me/support_fastmoney"
    }
};

// Заморозка объекта, чтобы случайно не изменить конфиг в процессе игры
Object.freeze(Config);

// Экспорт для использования в модулях (если используем ES6 modules)
// export default Config; 
// Но так как у нас чистый JS в script тегах, он будет доступен глобально как `Config`.

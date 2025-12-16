/**
 * FASTMONEY - CRASH GAME CONFIGURATION
 * Настройки физики полета, отрисовки графика и API.
 */

const CrashConfig = {
    // =========================================
    // 1. НАСТРОЙКИ ИГРОВОЙ МЕХАНИКИ (Must match Backend!)
    // =========================================
    GAME: {
        // Скорость роста экспоненты (0.0006 = 1.00x -> 2.00x за ~11.5 сек)
        // Должно строго совпадать с константой GROWTH_SPEED на Python
        GROWTH_SPEED: 0.0006, 
        
        // Как часто опрашивать сервер во время игры (в мс)
        // Используется если нет WebSockets, для синхронизации краша
        POLL_INTERVAL: 1000, 
        
        // Время между раундами (визуальный таймер перед следующим стартом)
        RESTART_DELAY: 3000, // 3 секунды
        
        // Максимальный множитель для отрисовки (защита от переполнения канваса)
        MAX_DISPLAY_MULT: 1000.00,
        
        // Компенсация пинга (в мс), чтобы график шел чуть плавнее
        PING_OFFSET: 100
    },

    // =========================================
    // 2. НАСТРОЙКИ ОТРИСОВКИ (CANVAS)
    // =========================================
    GRAPH: {
        // Цвет линии графика
        LINE_COLOR: '#00f3ff', // Неоновый голубой
        LINE_WIDTH: 4,
        
        // Цвет заливки под графиком
        FILL_COLOR_START: 'rgba(0, 243, 255, 0.2)',
        FILL_COLOR_END: 'rgba(0, 243, 255, 0.0)',
        
        // Настройки осей координат
        AXIS_COLOR: 'rgba(255, 255, 255, 0.1)',
        AXIS_TEXT_COLOR: '#666',
        FONT: "bold 12px 'Orbitron', sans-serif",
        
        // Настройки зума (камеры)
        // Через сколько секунд полета начинать сжимать график (Zoom Out)
        ZOOM_START_TIME: 4000, // 4 секунды
        
        // Отступы внутри Canvas (padding)
        PADDING: { top: 50, right: 50, bottom: 30, left: 30 }
    },

    // =========================================
    // 3. API ЭНДПОИНТЫ (Локальные алиасы)
    // =========================================
    API: {
        // Ссылаемся на глобальный конфиг, если он загружен
        BET:        (typeof Config !== 'undefined') ? Config.API.CRASH_BET     : '/api/crash/bet',
        CASHOUT:    (typeof Config !== 'undefined') ? Config.API.CRASH_CASHOUT : '/api/crash/cashout',
        STATUS:     (typeof Config !== 'undefined') ? Config.API.CRASH_STATUS  : '/api/crash/status'
    },

    // =========================================
    // 4. ТЕКСТЫ СТАТУСОВ
    // =========================================
    MESSAGES: {
        CONNECTING: "ПОДКЛЮЧЕНИЕ...",
        WAITING: "ОЖИДАНИЕ...",
        STARTING: "НА ВЗЛЕТ!",
        CRASHED: "УЛЕТЕЛ",
        WON: "ПОБЕДА!"
    },
    
    // =========================================
    // 5. ЗВУКИ (Пути)
    // =========================================
    AUDIO: {
        FLY_LOOP: "../../../assets/sounds/rocket_fly_loop.mp3",
        EXPLOSION: "../../../assets/sounds/explosion.mp3",
        WIN: "../../../assets/sounds/win.mp3",
        CLICK: "../../../assets/sounds/click.mp3"
    }
};

// Делаем доступным глобально
window.CrashConfig = CrashConfig;

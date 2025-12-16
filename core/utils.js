/**
 * FASTMONEY - UTILITIES
 * Общие вспомогательные функции для форматирования, математики и UI.
 */

const Utils = {

    // =========================================
    // 1. ФОРМАТИРОВАНИЕ ДАННЫХ
    // =========================================

    /**
     * Форматирует число в денежный вид
     * @param {number} amount - Сумма
     * @param {boolean} compact - Сокращенный вид (1.5k, 2M)
     * @param {string} currencyCode - Код валюты (RUB, USDT...)
     */
    formatMoney(amount, compact = false, currencyCode = null) {
        if (amount === undefined || amount === null) return "0.00";
        
        let num = parseFloat(amount);
        if (isNaN(num)) return "0.00";

        // Определяем настройки валюты из конфига
        let decimals = 2;
        let symbol = "";
        
        if (currencyCode && typeof Config !== 'undefined') {
            const currConfig = Config.CURRENCY.LIST[currencyCode];
            if (currConfig) {
                decimals = currConfig.decimals;
                symbol = " " + currConfig.symbol;
            }
        }

        // Компактный режим (для больших чисел в графике или хедере)
        if (compact) {
            if (num >= 1000000) return (num / 1000000).toFixed(1) + "M" + symbol;
            if (num >= 1000) return (num / 1000).toFixed(1) + "k" + symbol;
        }

        // Стандартный режим с разделителями (10 000.00)
        return num.toLocaleString('ru-RU', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        }) + symbol;
    },

    /**
     * Возвращает символ валюты по коду
     */
    getCurrencySymbol(code) {
        if (typeof Config === 'undefined') return '$';
        return Config.CURRENCY.LIST[code]?.symbol || code;
    },

    /**
     * Форматирует дату (DD.MM HH:mm)
     * @param {string|number} dateInput - Timestamp или ISO string
     */
    formatDate(dateInput) {
        if (!dateInput) return "-";
        const date = new Date(dateInput);
        
        const d = String(date.getDate()).padStart(2, '0');
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const h = String(date.getHours()).padStart(2, '0');
        const min = String(date.getMinutes()).padStart(2, '0');
        
        return `${d}.${m} ${h}:${min}`;
    },

    /**
     * Скрывает часть никнейма (Alex -> Ale***)
     */
    maskUsername(username) {
        if (!username) return "User***";
        if (username.length <= 3) return username + "***";
        return username.substring(0, 3) + "***";
    },

    // =========================================
    // 2. МАТЕМАТИКА И РАНДОМ
    // =========================================

    /**
     * Случайное целое число (включительно)
     */
    randomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    },

    /**
     * Случайное число с плавающей точкой
     */
    randomFloat(min, max) {
        return Math.random() * (max - min) + min;
    },

    /**
     * Выбор случайного элемента массива
     */
    randomChoice(arr) {
        if (!arr || arr.length === 0) return null;
        return arr[Math.floor(Math.random() * arr.length)];
    },

    /**
     * Линейная интерполяция (для плавных анимаций)
     */
    lerp(start, end, t) {
        return start * (1 - t) + end * t;
    },

    // =========================================
    // 3. АСИНХРОННОСТЬ И ВРЕМЯ
    // =========================================

    /**
     * Пауза (await Utils.sleep(1000))
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },

    // =========================================
    // 4. UI И UX (ТЕЛЕГРАМ)
    // =========================================

    /**
     * Вызов вибрации (Haptic Feedback)
     * @param {string} type - 'light', 'medium', 'heavy', 'rigid', 'soft' | 'error', 'success', 'warning'
     */
    vibrate(type = 'light') {
        // Проверяем, есть ли Telegram SDK
        if (!window.Telegram || !window.Telegram.WebApp || !window.Telegram.WebApp.HapticFeedback) {
            return;
        }

        const haptic = window.Telegram.WebApp.HapticFeedback;

        // Notification types
        if (['error', 'success', 'warning'].includes(type)) {
            haptic.notificationOccurred(type);
        } 
        // Impact types
        else if (['light', 'medium', 'heavy', 'rigid', 'soft'].includes(type)) {
            haptic.impactOccurred(type);
        }
        // Selection change
        else if (type === 'selection') {
            haptic.selectionChanged();
        }
    },

    /**
     * Копирование текста в буфер обмена с уведомлением
     */
    async copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            this.vibrate('success');
            // Здесь можно вызвать тост-уведомление, если есть глобальная функция
            // if (window.showToast) window.showToast("Скопировано!");
            return true;
        } catch (err) {
            console.error('Ошибка копирования:', err);
            this.vibrate('error');
            return false;
        }
    },

    /**
     * Предзагрузка изображений (чтобы игры не мигали)
     */
    preloadImages(urls) {
        urls.forEach(url => {
            const img = new Image();
            img.src = url;
        });
    },

    // =========================================
    // 5. LOCAL STORAGE (Безопасная работа)
    // =========================================

    loadState(key) {
        try {
            const item = localStorage.getItem(key);
            return item ? JSON.parse(item) : null;
        } catch (e) {
            console.error("Ошибка чтения LocalStorage:", e);
            return null;
        }
    },

    saveState(key, data) {
        try {
            localStorage.setItem(key, JSON.stringify(data));
        } catch (e) {
            console.error("Ошибка записи в LocalStorage:", e);
        }
    },
    
    // =========================================
    // 6. ХЕЛПЕР ДЛЯ КАРТИНОК ИГР
    // =========================================
    getGameIconClass(gameName) {
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
            'HiLo': 'fa-solid fa-arrow-up-right-dots',
            'Plinko': 'fa-solid fa-arrow-down-long',
            'XO': 'fa-solid fa-xmarks-lines',
            'Mafia': 'fa-solid fa-user-secret',
            'Durak': 'fa-solid fa-layer-group',
            'Chess': 'fa-solid fa-chess-knight'
        };
        return map[gameName] || 'fa-solid fa-gamepad';
    }
};

// Делаем доступным глобально (для чистого JS без модулей)
window.Utils = Utils;

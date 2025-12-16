/**
 * FASTMONEY - GLOBAL STORE
 * Централизованное хранилище данных приложения.
 * Аналог Redux/Vuex, но на чистом JS.
 * 
 * Использование:
 * Store.get('balance').real
 * Store.update('balance', { real: 100 }) -> Автоматически обновит UI и LocalStorage
 */

const Store = {
    // =========================================
    // 1. НАЧАЛЬНОЕ СОСТОЯНИЕ (DEFAULT STATE)
    // =========================================
    _state: {
        // Данные пользователя
        user: {
            id: 0,
            username: "Guest",
            avatar: null,
            xp: 0,
            level: 1
        },
        
        // Финансы
        balance: {
            real: 0.00,
            demo: 10000.00
        },
        
        // Настройки приложения
        app: {
            mode: 'demo',       // 'real' | 'demo'
            currency: 'USDT',   // Визуальная валюта
            language: 'ru'
        },
        
        // Пользовательские настройки
        settings: {
            sound: true,
            haptic: true,
            animations: true
        }
    },

    // Подписчики (функции, которые вызываются при изменении данных)
    _listeners: [],

    // Ключ для LocalStorage
    _STORAGE_KEY: 'fastMoney_store_v1',

    // =========================================
    // 2. ИНИЦИАЛИЗАЦИЯ
    // =========================================
    
    init() {
        this._loadFromStorage();
        console.log('[Store] Initialized', this._state);
    },

    _loadFromStorage() {
        try {
            const raw = localStorage.getItem(this._STORAGE_KEY);
            if (raw) {
                const savedData = JSON.parse(raw);
                
                // Аккуратно мержим сохраненные данные с дефолтными
                // (чтобы не сломать структуру при обновлении версии)
                if (savedData.user) this._state.user = { ...this._state.user, ...savedData.user };
                if (savedData.balance) this._state.balance = { ...this._state.balance, ...savedData.balance };
                if (savedData.app) this._state.app = { ...this._state.app, ...savedData.app };
                if (savedData.settings) this._state.settings = { ...this._state.settings, ...savedData.settings };
            }
        } catch (e) {
            console.error('[Store] Load Error:', e);
        }
    },

    _saveToStorage() {
        try {
            // Сохраняем всё, кроме чувствительных данных, если они появятся
            localStorage.setItem(this._STORAGE_KEY, JSON.stringify(this._state));
        } catch (e) {
            console.error('[Store] Save Error:', e);
        }
    },

    // =========================================
    // 3. GETTERS (ПОЛУЧЕНИЕ ДАННЫХ)
    // =========================================

    /**
     * Получить весь объект состояния
     */
    getState() {
        return this._state;
    },

    /**
     * Получить конкретную ветку (например, 'user')
     */
    get(key) {
        return this._state[key];
    },

    /**
     * Получить текущий активный баланс (в зависимости от режима)
     */
    getCurrentBalance() {
        const mode = this._state.app.mode; // 'real' or 'demo'
        return this._state.balance[mode];
    },

    // =========================================
    // 4. SETTERS (ИЗМЕНЕНИЕ ДАННЫХ)
    // =========================================

    /**
     * Обновить ветку состояния
     * @param {string} key - Ключ (например, 'balance')
     * @param {object} value - Новые данные (частично или полностью)
     */
    set(key, value) {
        if (this._state[key] !== undefined) {
            // Если это объект, делаем слияние
            if (typeof this._state[key] === 'object' && !Array.isArray(this._state[key])) {
                this._state[key] = { ...this._state[key], ...value };
            } else {
                this._state[key] = value;
            }
            
            this._saveToStorage();
            this._notifyListeners(key);
        } else {
            console.warn(`[Store] Key '${key}' not found in state.`);
        }
    },

    /**
     * Удобный метод для изменения баланса
     * @param {number} amount - Сумма изменения (может быть отрицательной)
     * @param {string} mode - 'real' или 'demo' (если null, берет текущий)
     */
    updateBalance(amount, mode = null) {
        const targetMode = mode || this._state.app.mode;
        const current = this._state.balance[targetMode];
        
        const newBalance = current + amount;
        
        this.set('balance', { [targetMode]: newBalance });
    },

    // =========================================
    // 5. РЕАКТИВНОСТЬ (СОБЫТИЯ)
    // =========================================

    /**
     * Подписаться на изменения
     * @param {function} callback - Функция, вызываемая при обновлении
     */
    subscribe(callback) {
        this._listeners.push(callback);
    },

    /**
     * Уведомить всех подписчиков
     */
    _notifyListeners(changedKey) {
        this._listeners.forEach(callback => callback(this._state, changedKey));
    }
};

// Авто-инициализация
Store.init();

// Глобальный доступ
window.Store = Store;

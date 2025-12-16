/**
 * FASTMONEY - EVENT BUS
 * Шина событий для слабой связности компонентов (Pub/Sub).
 * Позволяет модулям общаться без прямых зависимостей.
 */

const EventBus = {
    // Хранилище подписчиков: { 'event_name': [callback1, callback2] }
    _listeners: {},

    // =========================================
    // 1. МЕТОДЫ ПОДПИСКИ
    // =========================================

    /**
     * Подписаться на событие
     * @param {string} event - Название события
     * @param {function} callback - Функция-обработчик
     */
    on(event, callback) {
        if (!this._listeners[event]) {
            this._listeners[event] = [];
        }
        this._listeners[event].push(callback);
    },

    /**
     * Подписаться на событие (выполнится только один раз)
     */
    once(event, callback) {
        const wrapper = (data) => {
            callback(data);
            this.off(event, wrapper);
        };
        this.on(event, wrapper);
    },

    /**
     * Отписаться от события
     */
    off(event, callback) {
        if (!this._listeners[event]) return;

        this._listeners[event] = this._listeners[event].filter(
            listener => listener !== callback
        );
    },

    // =========================================
    // 2. МЕТОДЫ ПУБЛИКАЦИИ
    // =========================================

    /**
     * Вызвать событие (уведомить всех подписчиков)
     * @param {string} event - Название события
     * @param {any} data - Данные для передачи
     */
    emit(event, data = null) {
        // Логирование для отладки (если включен глобальный конфиг)
        if (window.Config && window.Config.SYSTEM && window.Config.SYSTEM.DEBUG_MODE) {
            // Игнорируем частые события типа tick, чтобы не засорять консоль
            if (!event.includes('tick')) {
                console.log(`[EventBus] Emit: ${event}`, data);
            }
        }

        if (!this._listeners[event]) return;

        this._listeners[event].forEach(callback => {
            try {
                callback(data);
            } catch (error) {
                console.error(`[EventBus] Error in listener for '${event}':`, error);
            }
        });
    },

    // =========================================
    // 3. СПИСОК СТАНДАРТНЫХ СОБЫТИЙ
    // =========================================
    // Используйте эти константы вместо строк, чтобы избежать опечаток
    EVENTS: {
        // Баланс и Юзер
        BALANCE_UPDATED:    'balance:updated',    // data: { real: 100, demo: 500 }
        USER_UPDATED:       'user:updated',       // data: { level: 5, xp: 1200 }
        
        // Игровая механика
        GAME_START:         'game:start',
        GAME_END:           'game:end',           // data: { win: true, amount: 100 }
        
        // Навигация и UI
        NAVIGATE:           'nav:go',             // data: 'url'
        MODAL_OPEN:         'modal:open',         // data: 'modal_id'
        MODAL_CLOSE:        'modal:close',
        
        // Сокеты и Чат
        WS_CONNECTED:       'ws:connected',
        WS_MESSAGE:         'ws:message',
        CHAT_NEW_MSG:       'chat:new_message',
        
        // Системные
        ERROR:              'sys:error',          // data: { message: '...' }
        OFFLINE:            'sys:offline'
    }
};

// Глобальный доступ
window.EventBus = EventBus;

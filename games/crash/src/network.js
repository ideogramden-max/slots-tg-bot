/**
 * FASTMONEY - CRASH NETWORK CONTROLLER
 * Слой API для игры Crash.
 * 
 * Отвечает за:
 * 1. Отправку ставки (Bet).
 * 2. Отправку запроса на вывод (Cashout).
 * 3. Получение текущего статуса игры (Sync).
 */

const CrashNetwork = {

    /**
     * Сделать ставку и войти в раунд.
     * @param {number} amount - Сумма ставки
     * @returns {Promise<object>} Результат ставки
     */
    async placeBet(amount) {
        try {
            // Получаем текущий режим (Real/Demo) из глобального стора
            const mode = this._getCurrentMode();

            // Формируем payload
            const payload = {
                amount: amount,
                mode: mode
            };

            // Отправляем запрос
            const response = await API.post(CrashConfig.API.BET, payload);

            // Обработка успешного ответа
            // Бэкенд возвращает: { status: 'started', server_time: 1234567890.123, balance: ... }
            return {
                success: true,
                serverTime: response.server_time * 1000, // Конвертация в мс
                newBalance: response.balance
            };

        } catch (error) {
            console.error('[CrashNet] Bet Failed:', error);
            throw error; // Пробрасываем ошибку в UI для показа алерта
        }
    },

    /**
     * Забрать выигрыш (Cashout).
     * @returns {Promise<object>} Результат вывода
     */
    async cashOut() {
        try {
            // ID пользователя подставится автоматически в api.js
            const response = await API.post(CrashConfig.API.CASHOUT);

            // Бэкенд возвращает: 
            // 1. { status: 'won', win_amount: 200, balance: ... }
            // 2. { status: 'crashed', crash_point: 1.23 }
            
            return {
                success: true,
                status: response.status, // 'won' или 'crashed' (если не успели)
                winAmount: response.win_amount || 0,
                crashPoint: response.crash_point || 0,
                newBalance: response.balance
            };

        } catch (error) {
            console.error('[CrashNet] Cashout Failed:', error);
            // Если ошибка сети во время кэшаута — это критично.
            // В идеале бэкенд должен иметь авто-кэшаут, если связь потеряна.
            throw error;
        }
    },

    /**
     * Получить текущий статус игры (Polling).
     * Используется для синхронизации, если мы только зашли или WebSocket недоступен.
     */
    async checkStatus() {
        try {
            const response = await API.post(CrashConfig.API.STATUS);
            
            // Ответ: { status: 'flying' | 'idle' | 'crashed', start_time: ... }
            return {
                status: response.status,
                startTime: response.start_time ? response.start_time * 1000 : null,
                crashPoint: response.crash_point || null
            };
        } catch (error) {
            // Тихий фейл для поллинга, чтобы не спамить ошибками
            return { status: 'error' };
        }
    },

    /**
     * Вспомогательный метод: получить режим игры
     * @private
     */
    _getCurrentMode() {
        if (window.Store) {
            return window.Store.get('app').mode || 'demo';
        }
        // Фолбэк на localStorage, если Store еще не инит
        return localStorage.getItem('fastMoney_mode') || 'demo';
    }
};

// Экспорт глобально
window.CrashNetwork = CrashNetwork;

/**
 * FASTMONEY - API CLIENT (FINAL)
 * Сетевой слой приложения.
 * 
 * Функционал:
 * 1. Обертка над fetch с таймаутом.
 * 2. Автоматическое добавление заголовков авторизации (Telegram WebApp Data).
 * 3. Централизованная обработка ошибок через EventBus.
 * 4. Авто-подстановка user_id в POST запросы.
 */

const API = {
    
    /**
     * Формирование заголовков запроса
     * @private
     */
    _getHeaders() {
        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };

        // Добавляем данные инициализации Telegram для проверки на бэкенде (HMAC)
        if (window.Telegram && window.Telegram.WebApp) {
            headers['X-Telegram-Data'] = window.Telegram.WebApp.initData;
        }

        return headers;
    },

    /**
     * Основной метод выполнения запроса
     * @private
     */
    async _request(endpoint, method, body = null) {
        // Проверка наличия конфига
        if (typeof Config === 'undefined') {
            console.error('[API] Config not loaded');
            throw new Error("Системная ошибка: Конфигурация не загружена");
        }

        const url = `${Config.API_BASE_URL}${endpoint}`;
        
        const options = {
            method: method,
            headers: this._getHeaders(),
            mode: 'cors' // Разрешаем кросс-доменные запросы
        };

        if (body) {
            options.body = JSON.stringify(body);
        }

        // Логирование (если включен Debug)
        if (Config.SYSTEM.DEBUG_MODE) {
            console.log(`%c[API] ${method} ${endpoint}`, 'color: #00f3ff', body || '');
        }

        // Контроллер для таймаута
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), Config.REQUEST_TIMEOUT);
        options.signal = controller.signal;

        try {
            const response = await fetch(url, options);
            clearTimeout(timeoutId);

            // Обработка HTTP ошибок
            if (!response.ok) {
                // Пытаемся получить текст ошибки от сервера
                let errorData = {};
                try {
                    errorData = await response.json();
                } catch (e) {
                    errorData = { error: `HTTP Error ${response.status}` };
                }

                const errorMsg = errorData.error || errorData.message || 'Неизвестная ошибка сервера';
                
                // Если 401 Unauthorized - возможно, стоит перезагрузить страницу
                if (response.status === 401) {
                    console.warn('[API] Unauthorized');
                }

                throw new Error(errorMsg);
            }

            // Успешный ответ
            const data = await response.json();
            
            if (Config.SYSTEM.DEBUG_MODE) {
                console.log(`%c[API] Response:`, 'color: #00ff88', data);
            }

            return data;

        } catch (error) {
            clearTimeout(timeoutId);
            let userMessage = error.message;

            // Обработка специфичных ошибок сети
            if (error.name === 'AbortError') {
                userMessage = "Превышено время ожидания ответа.";
            } else if (error.message === 'Failed to fetch') {
                userMessage = "Нет соединения с сервером. Проверьте интернет.";
            }

            console.error(`[API Error] ${endpoint}:`, userMessage);

            // Отправляем событие в EventBus, чтобы UI мог показать тост/алерт
            if (window.EventBus) {
                window.EventBus.emit(EventBus.EVENTS.ERROR, { message: userMessage });
            }

            // Пробрасываем ошибку дальше, если вызывающий код хочет обработать её сам
            throw new Error(userMessage);
        }
    },

    /**
     * GET запрос
     * @param {string} endpoint - Путь (напр. /api/user)
     * @returns {Promise<object>}
     */
    async get(endpoint) {
        return this._request(endpoint, 'GET');
    },

    /**
     * POST запрос
     * @param {string} endpoint - Путь
     * @param {object} data - Тело запроса
     * @returns {Promise<object>}
     */
    async post(endpoint, data = {}) {
        // Удобство: автоматически добавляем user_id из Telegram SDK, если его нет в данных
        // Это упрощает вызовы в коде игр
        if (window.TelegramApp && !data.user_id) {
            const user = TelegramApp.getUser();
            if (user) {
                data.user_id = user.id;
                // Добавляем username на всякий случай (для регистрации)
                if (!data.username) data.username = user.username || user.first_name;
            } else if (Config.SYSTEM.DEBUG_MODE) {
                // Фолбэк для разработки в браузере без Telegram
                data.user_id = 12345;
                console.warn("[API] Using DEV user_id: 12345");
            }
        }

        return this._request(endpoint, 'POST', data);
    }
};

// Экспорт глобально
window.API = API;

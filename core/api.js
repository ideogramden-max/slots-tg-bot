/**
 * FASTMONEY - API CLIENT
 * Обертка для HTTP запросов с автоматической авторизацией через Telegram InitData.
 * Зависит от: config.js, telegram-web-app.js
 */

const API = {
    
    /**
     * Формирует заголовки запроса
     * Добавляет 'X-Telegram-Data' для валидации на бэкенде
     */
    _getHeaders() {
        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };

        // Добавляем данные инициализации Telegram для проверки на сервере
        if (window.Telegram && window.Telegram.WebApp) {
            headers['X-Telegram-Data'] = window.Telegram.WebApp.initData;
        }

        return headers;
    },

    /**
     * Основная функция запроса (Private)
     */
    async _request(endpoint, method, body = null) {
        // Убираем лишние слеши
        const url = `${Config.API_BASE_URL}${endpoint}`;
        
        const options = {
            method: method,
            headers: this._getHeaders(),
            mode: 'cors' // Важно для Cross-Origin запросов
        };

        if (body) {
            options.body = JSON.stringify(body);
        }

        // Логирование в Debug режиме
        if (Config.SYSTEM.DEBUG_MODE) {
            console.log(`[API] ${method} ${endpoint}`, body || '');
        }

        try {
            // Устанавливаем таймаут (через Promise.race)
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), Config.REQUEST_TIMEOUT);
            options.signal = controller.signal;

            const response = await fetch(url, options);
            clearTimeout(timeoutId);

            // Обработка статусов
            if (!response.ok) {
                // Пытаемся распарсить ошибку от сервера
                const errorData = await response.json().catch(() => ({}));
                const errorMessage = errorData.error || `Ошибка сервера: ${response.status}`;
                
                throw new Error(errorMessage);
            }

            // Успешный ответ
            const data = await response.json();
            
            if (Config.SYSTEM.DEBUG_MODE) {
                console.log(`[API] Response:`, data);
            }

            return data;

        } catch (error) {
            console.error(`[API Error] ${endpoint}:`, error.message);
            
            // Обработка обрыва сети или таймаута
            if (error.name === 'AbortError') {
                throw new Error("Время ожидания истекло. Проверьте интернет.");
            }
            if (error.message === 'Failed to fetch') {
                throw new Error("Нет соединения с сервером.");
            }

            throw error; // Пробрасываем дальше, чтобы обработать в UI
        }
    },

    /**
     * GET Запрос
     * @param {string} endpoint - путь (напр. /api/user)
     */
    async get(endpoint) {
        return this._request(endpoint, 'GET');
    },

    /**
     * POST Запрос
     * @param {string} endpoint - путь
     * @param {object} data - тело запроса
     */
    async post(endpoint, data = {}) {
        // Автоматически добавляем user_id в тело, если его нет
        // (Так как наш текущий бэкенд в примерах ожидает user_id в body)
        if (window.Telegram && window.Telegram.WebApp.initDataUnsafe && window.Telegram.WebApp.initDataUnsafe.user) {
            if (!data.user_id) {
                data.user_id = window.Telegram.WebApp.initDataUnsafe.user.id;
            }
            // Добавляем username на случай регистрации
            if (!data.username) {
                data.username = window.Telegram.WebApp.initDataUnsafe.user.username || window.Telegram.WebApp.initDataUnsafe.user.first_name;
            }
        } else {
            // Фолбэк для тестов в браузере без ТГ (Guest)
            if (Config.SYSTEM.DEBUG_MODE && !data.user_id) {
                console.warn("[API] TG User not found, using dummy ID 12345");
                data.user_id = 12345; 
                data.username = "DevUser";
            }
        }

        return this._request(endpoint, 'POST', data);
    }
};

// Глобальный обработчик ошибок (Опционально)
window.handleApiError = (error) => {
    // Если есть вибрация
    if (window.Telegram && window.Telegram.WebApp.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.notificationOccurred('error');
    }
    // Показываем алерт (или красивую модалку, если она есть в HTML)
    alert(error.message);
};

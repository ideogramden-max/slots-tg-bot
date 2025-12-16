/**
 * FASTMONEY - TELEGRAM SDK WRAPPER
 * Упрощает работу с Telegram Web Apps API.
 * Обеспечивает безопасный доступ к методам (проверка наличия SDK).
 */

const TelegramApp = {
    // Ссылка на нативный объект
    _tg: window.Telegram ? window.Telegram.WebApp : null,

    /**
     * Инициализация приложения
     */
    init() {
        if (!this.isAvailable()) {
            console.warn('[Telegram] SDK not found. Running in browser mode.');
            // Добавляем класс к body для стилизации в браузере (если нужно)
            document.body.classList.add('browser-mode');
            return;
        }

        // Сообщаем, что приложение готово
        this._tg.ready();
        
        // Разворачиваем на весь экран
        this._tg.expand();

        // Настраиваем цвета под тему
        this.updateTheme();

        // Отключаем нативный скролл (для полноэкранных игр)
        this._tg.isVerticalSwipesEnabled = false; 
        
        console.log('[Telegram] Initialized');
    },

    /**
     * Проверка доступности Telegram среды
     */
    isAvailable() {
        return !!this._tg;
    },

    /**
     * Получение данных пользователя
     */
    getUser() {
        if (!this.isAvailable()) return null;
        return this._tg.initDataUnsafe?.user || null;
    },

    /**
     * Получение сырой строки initData (для валидации на бэкенде)
     */
    getInitData() {
        if (!this.isAvailable()) return '';
        return this._tg.initData;
    },

    /**
     * Управление вибрацией (Haptic Feedback)
     */
    Haptic: {
        impact(style = 'medium') { // light, medium, heavy, rigid, soft
            if (TelegramApp.isAvailable() && TelegramApp._tg.HapticFeedback) {
                TelegramApp._tg.HapticFeedback.impactOccurred(style);
            }
        },
        notify(type = 'success') { // error, success, warning
            if (TelegramApp.isAvailable() && TelegramApp._tg.HapticFeedback) {
                TelegramApp._tg.HapticFeedback.notificationOccurred(type);
            }
        },
        selection() {
            if (TelegramApp.isAvailable() && TelegramApp._tg.HapticFeedback) {
                TelegramApp._tg.HapticFeedback.selectionChanged();
            }
        }
    },

    /**
     * Управление окном
     */
    close() {
        if (this.isAvailable()) {
            this._tg.close();
        } else {
            window.close();
        }
    },

    /**
     * Открытие внешних ссылок
     */
    openLink(url) {
        if (this.isAvailable()) {
            this._tg.openLink(url);
        } else {
            window.open(url, '_blank');
        }
    },

    /**
     * Открытие Telegram ссылки (на канал, бота и т.д.)
     */
    openTelegramLink(url) {
        if (this.isAvailable()) {
            this._tg.openTelegramLink(url);
        } else {
            window.open(url, '_blank');
        }
    },

    /**
     * Оплата через Telegram Stars (Invoice)
     */
    openInvoice(url, callback) {
        if (this.isAvailable()) {
            this._tg.openInvoice(url, (status) => {
                if (callback) callback(status);
            });
        } else {
            alert('[DEV] Invoice opened: ' + url);
            if (callback) callback('paid'); // Симуляция успеха в браузере
        }
    },

    /**
     * Настройка темы (цвета хедера и фона)
     */
    updateTheme() {
        if (!this.isAvailable()) return;

        // Устанавливаем цвет хедера в цвет фона body
        const bgColor = getComputedStyle(document.body).backgroundColor;
        
        // Настраиваем HeaderColor
        if (this._tg.setHeaderColor) {
            this._tg.setHeaderColor(this._tg.themeParams.bg_color || bgColor);
        }
        
        // Настраиваем BackgroundColor
        if (this._tg.setBackgroundColor) {
            this._tg.setBackgroundColor(this._tg.themeParams.bg_color || bgColor);
        }
    },

    /**
     * Показ нативного алерта
     */
    alert(message, callback) {
        if (this.isAvailable()) {
            this._tg.showAlert(message, callback);
        } else {
            alert(message);
            if (callback) callback();
        }
    },

    /**
     * Показ нативного конфирма
     */
    confirm(message, callback) {
        if (this.isAvailable()) {
            this._tg.showConfirm(message, callback);
        } else {
            const result = confirm(message);
            if (callback) callback(result);
        }
    },

    /**
     * Управление нативной кнопкой "Назад"
     */
    BackButton: {
        show(onClick) {
            if (TelegramApp.isAvailable()) {
                TelegramApp._tg.BackButton.show();
                if (onClick) {
                    TelegramApp._tg.BackButton.onClick(onClick);
                }
            }
        },
        hide() {
            if (TelegramApp.isAvailable()) {
                TelegramApp._tg.BackButton.hide();
                TelegramApp._tg.BackButton.offClick();
            }
        }
    },

    /**
     * Управление нативной Главной Кнопкой (MainButton)
     */
    MainButton: {
        setText(text) {
            if (TelegramApp.isAvailable()) TelegramApp._tg.MainButton.setText(text);
        },
        show(onClick) {
            if (TelegramApp.isAvailable()) {
                TelegramApp._tg.MainButton.show();
                if (onClick) {
                    // Сбрасываем старые листенеры перед добавлением нового
                    TelegramApp._tg.MainButton.offClick();
                    TelegramApp._tg.MainButton.onClick(onClick);
                }
            }
        },
        hide() {
            if (TelegramApp.isAvailable()) {
                TelegramApp._tg.MainButton.hide();
                TelegramApp._tg.MainButton.offClick();
            }
        },
        enable() {
            if (TelegramApp.isAvailable()) TelegramApp._tg.MainButton.enable();
        },
        disable() {
            if (TelegramApp.isAvailable()) TelegramApp._tg.MainButton.disable();
        },
        setLoading(isLoading) {
            if (TelegramApp.isAvailable()) {
                isLoading ? TelegramApp._tg.MainButton.showProgress() : TelegramApp._tg.MainButton.hideProgress();
            }
        }
    }
};

// Авто-инициализация при загрузке скрипта (опционально, но удобно)
// Можно вызывать вручную в main.js, но здесь мы гарантируем применение настроек сразу
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => TelegramApp.init());
} else {
    TelegramApp.init();
}

// Экспорт глобально
window.TelegramApp = TelegramApp;

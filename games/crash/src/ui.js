/**
 * FASTMONEY - CRASH UI CONTROLLER
 * Управление интерфейсом: кнопки, инпуты, история, модалки.
 */

const UI = {
    // Текущая выбранная ставка
    currentBet: 100,

    // Кэш DOM элементов
    els: {
        betAmount: null,
        mainBtn: null,
        btnTitle: null,
        btnSub: null,
        balance: null,
        history: null,
        statusMsg: null,
        multDisplay: null,
        crashMsg: null,
        toast: null,
        toastVal: null
    },

    /**
     * Инициализация UI
     */
    init() {
        this.cacheElements();
        this.bindEvents();
        this.updateBalanceDisplay();
        
        // Установка начальной ставки
        this.renderBet();
    },

    /**
     * Кэширование элементов для быстрого доступа
     */
    cacheElements() {
        this.els.betAmount = document.getElementById('bet-amount');
        this.els.mainBtn = document.getElementById('main-btn');
        this.els.btnTitle = this.els.mainBtn.querySelector('.btn-title');
        this.els.btnSub = this.els.mainBtn.querySelector('.btn-subtitle');
        this.els.balance = document.getElementById('balance-display');
        this.els.history = document.getElementById('history-track');
        
        // Элементы оверлея
        this.els.statusMsg = document.getElementById('status-msg');
        this.els.multDisplay = document.getElementById('multiplier-display');
        this.els.crashMsg = document.getElementById('crash-msg');
        
        // Тост
        this.els.toast = document.getElementById('toast-win');
        this.els.toastVal = document.getElementById('toast-val-display');
    },

    /**
     * Привязка событий (кнопки +/-)
     */
    bindEvents() {
        document.getElementById('btn-dec').addEventListener('click', () => {
            this.changeBet(-100);
        });
        
        document.getElementById('btn-inc').addEventListener('click', () => {
            this.changeBet(100);
        });
    },

    // =========================================
    // 1. УПРАВЛЕНИЕ СТАВКАМИ
    // =========================================

    /**
     * Установка конкретной суммы (вызывается из HTML quick-bets)
     */
    setBet(val) {
        // Проверка на 'max'
        if (val === 'max') {
            // Берем текущий баланс из глобального стора или API
            let maxBalance = 0;
            if (window.Store) {
                maxBalance = window.Store.getCurrentBalance();
            } else {
                // Фолбэк, если Store недоступен (парсим из DOM, не рекомендуется, но надежно)
                maxBalance = parseFloat(this.els.balance.innerText.replace(/[^0-9.]/g, '')) || 0;
            }
            
            // Ограничиваем конфигом
            this.currentBet = Math.min(maxBalance, Config.GAME_SETTINGS.MAX_BET);
        } else {
            this.currentBet = val;
        }

        this.validateBet();
        this.renderBet();
        
        // Вибрация
        if (window.Utils) window.Utils.vibrate('selection');
    },

    /**
     * Изменение ставки на шаг (+/-)
     */
    changeBet(delta) {
        this.currentBet += delta;
        this.validateBet();
        this.renderBet();
        if (window.Utils) window.Utils.vibrate('light');
    },

    /**
     * Проверка лимитов
     */
    validateBet() {
        // Минимум
        if (this.currentBet < Config.GAME_SETTINGS.MIN_BET) {
            this.currentBet = Config.GAME_SETTINGS.MIN_BET;
        }
        // Максимум
        if (this.currentBet > Config.GAME_SETTINGS.MAX_BET) {
            this.currentBet = Config.GAME_SETTINGS.MAX_BET;
        }
        // Округление до 2 знаков
        this.currentBet = Math.floor(this.currentBet * 100) / 100;
    },

    /**
     * Отрисовка числа в инпуте
     */
    renderBet() {
        this.els.betAmount.innerText = this.currentBet;
    },

    /**
     * Обновление баланса в хедере
     */
    updateBalanceDisplay(newBalance = null) {
        // Если передали явно (например, после ставки)
        if (newBalance !== null) {
            this.els.balance.innerText = window.Utils ? window.Utils.formatMoney(newBalance) : newBalance;
            return;
        }

        // Иначе берем из глобального стора
        if (window.Store) {
            const bal = window.Store.getCurrentBalance();
            this.els.balance.innerText = window.Utils ? window.Utils.formatMoney(bal) : bal;
        }
    },

    // =========================================
    // 2. ГЛАВНАЯ КНОПКА (STATE MACHINE)
    // =========================================

    /**
     * Переключение состояния кнопки
     * @param {string} state - 'LOADING', 'BET', 'CASHOUT', 'DISABLED'
     * @param {object} data - Доп. данные (например, текущий выигрыш)
     */
    setBtnState(state, data = {}) {
        const btn = this.els.mainBtn;
        
        // Сброс классов
        btn.className = 'big-btn';
        btn.disabled = false;

        switch (state) {
            case 'LOADING':
                btn.classList.add('btn-loading');
                btn.disabled = true;
                this.setBtnText("ЗАГРУЗКА", "Связь с сервером...");
                break;

            case 'BET':
                btn.classList.add('btn-bet');
                this.setBtnText("ПОСТАВИТЬ", "Начать новый раунд");
                break;

            case 'CASHOUT':
                btn.classList.add('btn-cashout');
                // Показываем текущий потенциальный выигрыш
                const winAmount = data.win || 0;
                this.setBtnText("ЗАБРАТЬ", `${winAmount} $`);
                break;

            case 'DISABLED': // Например, после вывода или краша
                btn.classList.add('btn-disabled');
                btn.disabled = true;
                this.setBtnText(data.title || "ЖДИТЕ", data.sub || "Раунд идет...");
                break;
        }
    },

    setBtnText(title, sub) {
        this.els.btnTitle.innerText = title;
        this.els.btnSub.innerText = sub;
    },

    // =========================================
    // 3. ЦЕНТРАЛЬНЫЙ ДИСПЛЕЙ И ИСТОРИЯ
    // =========================================

    /**
     * Показать статус (По центру)
     */
    setStatus(type, text = "") {
        // Скрываем все
        this.els.statusMsg.classList.add('hidden');
        this.els.multDisplay.classList.add('hidden');
        this.els.crashMsg.classList.add('hidden');

        if (type === 'msg') {
            this.els.statusMsg.classList.remove('hidden');
            this.els.statusMsg.innerText = text;
        } 
        else if (type === 'flying') {
            this.els.multDisplay.classList.remove('hidden');
            this.els.multDisplay.style.color = 'white'; // Сброс цвета
        } 
        else if (type === 'crash') {
            this.els.crashMsg.classList.remove('hidden');
            // Обновляем текст краша в main.js, тут просто показываем блок
        }
    },

    /**
     * Обновление множителя на экране
     */
    updateMultiplier(value) {
        this.els.multDisplay.innerText = value.toFixed(2) + 'x';
    },

    /**
     * Добавление бабла в историю
     */
    addHistoryBadge(value) {
        const div = document.createElement('div');
        
        // Определение цвета
        let styleClass = 'low'; // < 2x
        if (value >= 10) styleClass = 'high'; // > 10x
        else if (value >= 2) styleClass = 'med'; // > 2x
        if (value < 1.1) styleClass = 'crash'; // Мгновенный слив

        div.className = `badge ${styleClass}`;
        div.innerText = value.toFixed(2) + 'x';

        // Добавляем в начало списка
        this.els.history.prepend(div);

        // Ограничиваем историю (удаляем старые, если больше 20)
        if (this.els.history.children.length > 20) {
            this.els.history.lastChild.remove();
        }
    },

    // =========================================
    // 4. УВЕДОМЛЕНИЯ (WIN / INFO)
    // =========================================

    /**
     * Показать тост победы
     */
    showWinToast(amount) {
        this.els.toastVal.innerText = window.Utils ? window.Utils.formatMoney(amount) : amount;
        this.els.toast.classList.remove('hidden');
        
        // Звук победы
        if (window.AudioEngine) window.AudioEngine.play('win');

        // Скрыть через 3 секунды
        setTimeout(() => {
            this.els.toast.classList.add('hidden');
        }, 3000);
    },

    /**
     * Открыть/Закрыть модалку Инфо
     */
    toggleInfo(show) {
        const modal = document.getElementById('modal-info');
        if (show) {
            modal.classList.remove('hidden');
            if (window.Utils) window.Utils.vibrate('light');
        } else {
            modal.classList.add('hidden');
        }
    }
};

// Экспорт
window.UI = UI;

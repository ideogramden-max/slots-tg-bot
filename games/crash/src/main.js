/**
 * FASTMONEY - CRASH MAIN CONTROLLER
 * Точка входа и оркестратор игры.
 * Связывает UI, Network, Graphics и Math.
 */

const CrashGame = {
    // =========================================
    // 1. СОСТОЯНИЕ ИГРЫ
    // =========================================
    state: {
        status: 'IDLE',     // IDLE, BETTING, FLYING, CASHED, CRASHED
        startTime: 0,       // Время старта раунда (timestamp ms)
        betAmount: 0,       // Текущая ставка
        currentMult: 1.00,  // Текущий множитель
        gameId: null,       // ID текущей партии (если есть)
        
        // Таймеры
        rafId: null,        // RequestAnimationFrame ID
        pollId: null,       // Интервал опроса статуса
    },

    // =========================================
    // 2. ИНИЦИАЛИЗАЦИЯ
    // =========================================
    init() {
        console.log('[Crash] Initializing...');

        // 1. Инициализация подсистем
        if (window.CrashGraphics) CrashGraphics.init();
        if (window.UI) UI.init();

        // 2. Привязка главной кнопки
        const btn = document.getElementById('main-btn');
        if (btn) {
            btn.onclick = () => this.handleMainAction();
        }

        // 3. Предзагрузка звуков
        if (window.AudioEngine && window.CrashConfig) {
            // AudioEngine.preload(CrashConfig.AUDIO); // Если поддерживается массовая загрузка
            // Или загружаем критичные
            AudioEngine.load('fly', CrashConfig.AUDIO.FLY_LOOP);
            AudioEngine.load('boom', CrashConfig.AUDIO.EXPLOSION);
            AudioEngine.load('win', CrashConfig.AUDIO.WIN);
        }

        // 4. Сброс в исходное состояние
        this.resetGame();
        
        // 5. Проверка статуса (вдруг игра уже идет, если перезагрузили страницу)
        this.checkExistingSession();
    },

    /**
     * Проверка, не идет ли игра прямо сейчас (Reconnection)
     */
    async checkExistingSession() {
        UI.setBtnState('LOADING');
        const status = await CrashNetwork.checkStatus();
        
        if (status.status === 'flying' && status.startTime) {
            // Восстанавливаем игру
            this.state.startTime = status.startTime;
            this.startGameLoop(true); // true = reconnection mode
        } else {
            UI.setBtnState('BET');
        }
    },

    // =========================================
    // 3. УПРАВЛЕНИЕ ДЕЙСТВИЯМИ (CONTROLS)
    // =========================================

    /**
     * Обработчик нажатия главной кнопки
     */
    async handleMainAction() {
        // Защита от дабл-клика
        if (this.state.isProcessing) return;
        this.state.isProcessing = true;

        if (this.state.status === 'IDLE') {
            await this.placeBet();
        } else if (this.state.status === 'FLYING') {
            await this.cashOut();
        }

        this.state.isProcessing = false;
    },

    /**
     * Сделать ставку (Начало раунда)
     */
    async placeBet() {
        // Валидация баланса (через UI, так как там актуальное значение)
        const betVal = UI.currentBet;
        
        // Блокируем UI
        this.state.status = 'BETTING';
        UI.setBtnState('LOADING');
        UI.setStatus('msg', CrashConfig.MESSAGES.CONNECTING);

        try {
            // Отправка запроса
            const data = await CrashNetwork.placeBet(betVal);

            if (data.success) {
                // Успешный старт
                this.state.betAmount = betVal;
                this.state.startTime = data.serverTime;
                
                // Обновляем баланс (списание)
                UI.updateBalanceDisplay(data.newBalance);
                
                // Запускаем процесс
                this.startRound();
            }
        } catch (error) {
            console.error(error);
            // Возвращаем как было
            this.resetGame(); 
            // Ошибка уже показана через API -> EventBus -> Alert, но можно добавить вибро
            if (window.Utils) Utils.vibrate('error');
        }
    },

    /**
     * Забрать деньги
     */
    async cashOut() {
        // Блокируем кнопку, чтобы не нажать дважды
        UI.setBtnState('LOADING'); 

        try {
            const data = await CrashNetwork.cashOut();

            if (data.status === 'won') {
                this.handleWin(data.winAmount, data.newBalance);
            } else if (data.status === 'crashed') {
                this.handleCrash(data.crashPoint);
            }
        } catch (error) {
            // Если сеть отвалилась, возвращаем кнопку (шанс кликнуть еще раз)
            console.error(error);
            UI.setBtnState('CASHOUT', { win: Math.floor(this.state.betAmount * this.state.currentMult) });
        }
    },

    // =========================================
    // 4. ИГРОВОЙ ЦИКЛ (GAME LOOP)
    // =========================================

    startRound() {
        this.state.status = 'FLYING';
        
        // UI
        UI.setBtnState('CASHOUT', { win: this.state.betAmount }); // Сразу показываем номинал
        UI.setStatus('flying');
        
        // Звук
        AudioEngine.play('fly', true); // Loop
        if (window.Utils) Utils.vibrate('light');

        // Запуск графики и поллинга
        this.startGameLoop();
        this.startPolling();
    },

    startGameLoop(isReconnect = false) {
        const loop = () => {
            if (this.state.status !== 'FLYING' && this.state.status !== 'CASHED') {
                cancelAnimationFrame(this.state.rafId);
                return;
            }

            // 1. Время
            const now = Date.now();
            // Компенсация пинга (немного сдвигаем время назад, чтобы совпадать с сервером)
            const elapsed = now - this.state.startTime - (isReconnect ? 0 : CrashConfig.GAME.PING_OFFSET);

            // 2. Математика
            const mult = CrashMath.calculateMultiplier(elapsed);
            this.state.currentMult = mult;

            // 3. Графика
            CrashGraphics.drawFrame(elapsed, false);

            // 4. UI Обновление
            // Если мы еще летим - обновляем цифры и кнопку
            if (this.state.status === 'FLYING') {
                UI.updateMultiplier(mult);
                
                // Обновляем сумму на кнопке вывода
                const currentWin = Math.floor(this.state.betAmount * mult);
                // Обновляем текст кнопки (без полной перерисовки класса для оптимизации)
                const btnSub = document.querySelector('#main-btn .btn-subtitle');
                if (btnSub) btnSub.innerText = window.Utils ? Utils.formatMoney(currentWin) + " $" : currentWin;
            }

            // 5. Защита (Client-side auto-stop visual)
            if (mult >= CrashConfig.GAME.MAX_DISPLAY_MULT) {
                // Если улетели в космос, просто останавливаем рост, но ждем ответа сервера
            }

            this.state.rafId = requestAnimationFrame(loop);
        };

        this.state.rafId = requestAnimationFrame(loop);
    },

    /**
     * Поллинг статуса (на случай если WebSocket не используется)
     */
    startPolling() {
        if (this.state.pollId) clearInterval(this.state.pollId);

        this.state.pollId = setInterval(async () => {
            if (this.state.status !== 'FLYING') {
                clearInterval(this.state.pollId);
                return;
            }

            const data = await CrashNetwork.checkStatus();
            
            if (data.status === 'crashed') {
                this.handleCrash(data.crashPoint);
            }
        }, CrashConfig.GAME.POLL_INTERVAL);
    },

    // =========================================
    // 5. ОБРАБОТКА ИСХОДОВ
    // =========================================

    /**
     * Победа (Cashout)
     */
    handleWin(amount, balance) {
        this.state.status = 'CASHED'; // Переходим в режим наблюдателя
        
        // Звук
        AudioEngine.stop('fly');
        AudioEngine.play('win');
        
        // UI
        UI.showWinToast(amount);
        UI.updateBalanceDisplay(balance);
        UI.setBtnState('DISABLED', { title: "ВЫВЕДЕНО", sub: "Ждем финала..." });
        
        // Мы продолжаем рисовать график (в режиме CASHED), пока сервер не скажет CRASH
        // Поллинг продолжается
    },

    /**
     * Краш (Конец раунда)
     */
    handleCrash(crashPoint) {
        // Останавливаем циклы
        clearInterval(this.state.pollId);
        cancelAnimationFrame(this.state.rafId);
        
        const previousStatus = this.state.status;
        this.state.status = 'CRASHED';

        // Рассчитываем финальное время для отрисовки точной точки краша
        const finalTime = CrashMath.inverseMultiplier(crashPoint);

        // Финальный кадр графики (Ракета взрывается)
        CrashGraphics.drawFrame(finalTime, true);
        
        // Звук
        AudioEngine.stop('fly');
        // Играем взрыв только если мы не успели вывести (или играем тихо)
        if (previousStatus !== 'CASHED') {
            AudioEngine.play('boom');
            if (window.Utils) Utils.vibrate('error');
        }

        // UI Краша
        UI.setStatus('crash');
        UI.updateMultiplier(crashPoint); // Показываем точный финальный кэф
        UI.addHistoryBadge(crashPoint);
        
        if (previousStatus === 'CASHED') {
            UI.setBtnState('DISABLED', { title: "РАУНД ОКОНЧЕН", sub: "Перезагрузка..." });
        } else {
            UI.setBtnState('DISABLED', { title: "УЛЕТЕЛ", sub: "Попробуй еще раз" });
        }

        // Таймер перезапуска
        setTimeout(() => {
            this.resetGame();
        }, CrashConfig.GAME.RESTART_DELAY);
    },

    // =========================================
    // 6. СБРОС
    // =========================================
    resetGame() {
        this.state.status = 'IDLE';
        this.state.currentMult = 1.00;
        this.state.startTime = 0;
        this.state.isProcessing = false; // Разблокируем клики

        // Очистка таймеров
        if (this.state.pollId) clearInterval(this.state.pollId);
        if (this.state.rafId) cancelAnimationFrame(this.state.rafId);

        // Сброс UI
        UI.setBtnState('BET');
        UI.setStatus('msg', CrashConfig.MESSAGES.WAITING);
        
        // Очистка Canvas
        CrashGraphics.clear();
        // Рисуем стартовую позицию (ракету внизу)
        CrashGraphics.updateRocket({ x: 0, y: 0 }, 0, false);
    }
};

// Запуск при загрузке
document.addEventListener('DOMContentLoaded', () => {
    CrashGame.init();
});

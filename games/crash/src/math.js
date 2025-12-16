/**
 * FASTMONEY - CRASH MATH ENGINE
 * 
 * Отвечает за:
 * 1. Расчет множителя на основе времени (дублирует логику бэкенда).
 * 2. Проекцию математических координат (время, кэф) на экранные координаты (пиксели).
 * 3. Логику масштабирования (Zoom Out) по мере роста графика.
 */

const CrashMath = {

    /**
     * Рассчитывает текущий множитель на основе прошедшего времени.
     * Формула: Multiplier = e ^ (time_ms * growth_speed)
     * 
     * @param {number} elapsedMs - Время с начала раунда в миллисекундах
     * @returns {number} Текущий коэффициент (например, 2.54)
     */
    calculateMultiplier(elapsedMs) {
        // Защита от отрицательного времени
        if (elapsedMs <= 0) return 1.00;
        
        // Берем скорость роста из конфига (должна совпадать с Python backend!)
        const k = CrashConfig.GAME.GROWTH_SPEED;
        
        // Экспоненциальный рост
        const mult = Math.exp(elapsedMs * k);
        
        // Ограничиваем максимальное значение для UI (чтобы не сломать Canvas)
        return Math.min(mult, CrashConfig.GAME.MAX_DISPLAY_MULT);
    },

    /**
     * Обратная функция: Считает время, необходимое для достижения множителя.
     * T = ln(Multiplier) / k
     * 
     * @param {number} multiplier - Целевой коэффициент
     * @returns {number} Время в мс
     */
    inverseMultiplier(multiplier) {
        if (multiplier <= 1) return 0;
        const k = CrashConfig.GAME.GROWTH_SPEED;
        return Math.log(multiplier) / k;
    },

    /**
     * Главная функция проекции.
     * Преобразует время (t) в координаты (x, y) на Canvas.
     * Реализует динамическое масштабирование осей.
     * 
     * @param {number} t - Текущее время полета (мс)
     * @param {number} width - Ширина канваса (px)
     * @param {number} height - Высота канваса (px)
     * @returns {object} { x, y } - Координаты точки
     */
    mapToCanvas(t, width, height) {
        // Отступы для осей
        const pad = CrashConfig.GRAPH.PADDING;
        
        // Рабочая область графика (в пикселях)
        const graphW = width - pad.left - pad.right;
        const graphH = height - pad.top - pad.bottom;

        // --- ЛОГИКА ЗУМА (КАМЕРЫ) ---
        // Мы определяем "окно просмотра" (View Window).
        // Изначально оно фиксировано (например, 10 секунд и кэф 2.0x).
        // Если текущее время больше, окно расширяется.

        // Базовое время масштабирования (до этого момента график просто ползет вправо)
        const baseZoomTime = CrashConfig.GRAPH.ZOOM_START_TIME || 5000; // 5 сек по дефолту

        // Максимальное время по оси X, которое влезает в экран сейчас
        // Либо базовое, либо текущее (если улетели дальше)
        const maxX = Math.max(t, baseZoomTime);

        // Максимальный множитель по оси Y, который влезает в экран
        // Рассчитываем его исходя из maxX, чтобы график всегда шел по диагонали
        // Немного домножаем, чтобы ракета не упиралась в самый потолок
        const maxY = this.calculateMultiplier(maxX);

        // --- НОРМАЛИЗАЦИЯ (0.0 ... 1.0) ---
        
        // Позиция по X (линейная зависимость от времени)
        const normX = t / maxX;

        // Позиция по Y
        // Здесь хитрость: так как рост экспоненциальный, если мапить Y линейно к Multiplier,
        // график будет резко уходить вверх.
        // Чтобы сохранить красивую дугу, мы мапим Y тоже относительно текущего максимума экспоненты.
        
        const currentMult = this.calculateMultiplier(t);
        
        // (Текущий - 1) / (МаксимальныйВидимый - 1)
        // Вычитаем 1, так как старт начинается с 1.00 (это пол)
        const normY = (currentMult - 1) / (maxY - 1 || 1); // защита от деления на 0 при старте

        // --- ПРЕОБРАЗОВАНИЕ В ПИКСЕЛИ ---
        
        // X: Слева направо (+ отступ слева)
        const pixelX = pad.left + (normX * graphW);

        // Y: Снизу вверх (Canvas Y=0 это верх, поэтому инвертируем)
        // height - отступ снизу - высота точки
        const pixelY = (height - pad.bottom) - (normY * graphH);

        return { x: pixelX, y: pixelY };
    },

    /**
     * Линейная интерполяция (Lerp).
     * Используется для плавного движения ракеты между кадрами отрисовки,
     * если FPS проседает или данные приходят рывками.
     * 
     * @param {number} start - Начальное значение
     * @param {number} end - Конечное значение
     * @param {number} amt - Коэффициент (0.0 - 1.0)
     */
    lerp(start, end, amt) {
        return (1 - amt) * start + amt * end;
    },

    /**
     * Форматирует число для красивого вывода (1.00x)
     */
    formatOutput(val) {
        return val.toFixed(2) + 'x';
    }
};

// Экспортируем глобально
window.CrashMath = CrashMath;

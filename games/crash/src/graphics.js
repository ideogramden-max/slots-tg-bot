/**
 * FASTMONEY - CRASH GRAPHICS ENGINE
 * Отвечает за рендеринг Canvas (линия, заливка, оси) и позиционирование ракеты.
 * Использует CrashMath для получения координат.
 */

const CrashGraphics = {
    canvas: null,
    ctx: null,
    rocketEl: null,
    
    // Размеры канваса (логические)
    width: 0,
    height: 0,

    /**
     * Инициализация графики
     */
    init() {
        this.canvas = document.getElementById('crash-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.rocketEl = document.getElementById('rocket');

        // Первичная настройка размеров
        this.resize();
        
        // Слушаем ресайз окна
        window.addEventListener('resize', () => this.resize());
    },

    /**
     * Адаптация размеров Canvas под экран
     * Учитывает DPR (Device Pixel Ratio) для четкости на Retina дисплеях
     */
    resize() {
        const container = this.canvas.parentElement;
        const rect = container.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;

        // Устанавливаем физические размеры
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;

        // Масштабируем контекст
        this.ctx.scale(dpr, dpr);

        // Сохраняем логические размеры для расчетов
        this.width = rect.width;
        this.height = rect.height;

        // Применяем настройки шрифта
        this.ctx.font = CrashConfig.GRAPH.FONT;
    },

    /**
     * Очистка кадра
     */
    clear() {
        this.ctx.clearRect(0, 0, this.width, this.height);
    },

    /**
     * Основной метод отрисовки кадра
     * @param {number} currentTimeMs - Текущее время полета
     * @param {boolean} isCrashed - Флаг краша (для остановки партиклов или смены цвета)
     */
    drawFrame(currentTimeMs, isCrashed = false) {
        this.clear();

        // 1. Рисуем сетку (оси и метки)
        this.drawGrid(currentTimeMs);

        // 2. Рисуем график (кривую)
        // Чтобы получить кривую, мы берем точки с шагом (например, каждые 100мс)
        // и соединяем их линиями.
        
        this.ctx.beginPath();
        this.ctx.moveTo(CrashConfig.GRAPH.PADDING.left, this.height - CrashConfig.GRAPH.PADDING.bottom); // Старт (0,0)

        // Шаг детализации (чем меньше, тем плавнее кривая, но выше нагрузка)
        // Динамический шаг: если время большое, шаг увеличиваем
        const step = currentTimeMs > 10000 ? 200 : 50;
        
        let tipPos = { x: 0, y: 0 };

        // Проходим в цикле от 0 до текущего времени
        for (let t = 0; t <= currentTimeMs; t += step) {
            const pos = CrashMath.mapToCanvas(t, this.width, this.height);
            this.ctx.lineTo(pos.x, pos.y);
            
            // Запоминаем последнюю точку для ракеты (если это последний шаг цикла)
            // Но лучше вычислить точно после цикла
        }

        // Дорисовываем линию до точного текущего момента (чтобы не было рывков между шагами)
        const finalPos = CrashMath.mapToCanvas(currentTimeMs, this.width, this.height);
        this.ctx.lineTo(finalPos.x, finalPos.y);
        tipPos = finalPos;

        // 3. Заливка градиентом (под графиком)
        this.ctx.save();
        // Замыкаем контур вниз
        this.ctx.lineTo(finalPos.x, this.height - CrashConfig.GRAPH.PADDING.bottom);
        this.ctx.lineTo(CrashConfig.GRAPH.PADDING.left, this.height - CrashConfig.GRAPH.PADDING.bottom);
        this.ctx.closePath();

        // Создаем градиент
        const gradient = this.ctx.createLinearGradient(0, 0, 0, this.height);
        gradient.addColorStop(0, CrashConfig.GRAPH.FILL_COLOR_START);
        gradient.addColorStop(1, CrashConfig.GRAPH.FILL_COLOR_END);
        this.ctx.fillStyle = gradient;
        this.ctx.fill();
        this.ctx.restore();

        // 4. Обводка линии (поверх заливки)
        // Нам нужно заново построить путь только линии, без замыкания вниз
        this.ctx.beginPath();
        this.ctx.moveTo(CrashConfig.GRAPH.PADDING.left, this.height - CrashConfig.GRAPH.PADDING.bottom);
        // (Повторяем логику точек - для оптимизации можно было сохранить Path2D, но для JS это не критично)
        for (let t = 0; t <= currentTimeMs; t += step) {
            const pos = CrashMath.mapToCanvas(t, this.width, this.height);
            this.ctx.lineTo(pos.x, pos.y);
        }
        this.ctx.lineTo(finalPos.x, finalPos.y);
        
        this.ctx.lineWidth = CrashConfig.GRAPH.LINE_WIDTH;
        this.ctx.strokeStyle = isCrashed ? '#ff4444' : CrashConfig.GRAPH.LINE_COLOR;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        this.ctx.stroke();

        // 5. Позиционирование ракеты (HTML элемента)
        this.updateRocket(tipPos, currentTimeMs, isCrashed);
    },

    /**
     * Отрисовка осей и меток
     */
    drawGrid(currentTimeMs) {
        this.ctx.fillStyle = CrashConfig.GRAPH.AXIS_TEXT_COLOR;
        this.ctx.textAlign = "right";
        this.ctx.textBaseline = "middle";

        // --- Ось Y (Множители) ---
        // Список множителей, которые мы хотим видеть на сетке
        const multipliers = [1.5, 2.0, 3.0, 5.0, 10.0, 100.0, 500.0];
        
        multipliers.forEach(mult => {
            // Спрашиваем у математики: где должен быть этот множитель (Y)
            // Для X берем 0 (время), так как нам нужна только высота
            // Но mapToCanvas требует время.
            // Решаем обратную задачу: нам нужна проекция множителя на ось Y в текущем масштабе.
            // Хак: берем time=0, чтобы получить Y для старта, но mapToCanvas зависит от Zoom.
            
            // Получаем время, когда достигается этот множитель
            const t = CrashMath.inverseMultiplier(mult);
            
            // Получаем координату Y для этого момента времени в ТЕКУЩЕМ масштабе (currentTimeMs)
            // Мы передаем 't' в mapToCanvas, но с контекстом отрисовки, который зависит от currentTimeMs
            // В реализации CrashMath.mapToCanvas внутри используется maxX = max(currentTimeMs, zoomStart).
            // Значит, если мы передадим t, мы получим точку на кривой. Y координата этой точки и есть уровень линии.
            
            const pos = CrashMath.mapToCanvas(t, this.width, this.height);
            
            // Рисуем, только если линия внутри видимой области (с учетом отступов)
            const bottomLimit = this.height - CrashConfig.GRAPH.PADDING.bottom;
            const topLimit = CrashConfig.GRAPH.PADDING.top;

            if (pos.y < bottomLimit && pos.y > topLimit) {
                // Линия
                this.ctx.beginPath();
                this.ctx.moveTo(CrashConfig.GRAPH.PADDING.left, pos.y);
                this.ctx.lineTo(this.width, pos.y);
                this.ctx.lineWidth = 1;
                this.ctx.strokeStyle = CrashConfig.GRAPH.AXIS_COLOR;
                this.ctx.stroke();

                // Текст
                this.ctx.fillText(mult + 'x', CrashConfig.GRAPH.PADDING.left - 10, pos.y);
            }
        });

        // --- Ось X (Время) ---
        this.ctx.textAlign = "center";
        this.ctx.textBaseline = "top";
        
        const times = [2000, 4000, 6000, 10000, 15000, 20000, 30000]; // мс
        
        times.forEach(timeMs => {
            const pos = CrashMath.mapToCanvas(timeMs, this.width, this.height);
            const leftLimit = CrashConfig.GRAPH.PADDING.left;
            
            if (pos.x > leftLimit && pos.x < this.width) {
                this.ctx.fillText((timeMs / 1000) + 's', pos.x, this.height - CrashConfig.GRAPH.PADDING.bottom + 10);
            }
        });
    },

    /**
     * Обновление позиции HTML ракеты
     */
    updateRocket(pos, currentTimeMs, isCrashed) {
        if (!this.rocketEl) return;

        // Смещение, чтобы центр ракеты был на кончике линии
        // Сама ракета 60x60, центр 30,30
        const offsetX = -30; 
        const offsetY = -30;

        // Рассчитываем угол наклона
        // Чем больше множитель, тем круче вверх (до 90 градусов)
        // Простая эвристика: угол зависит от текущего множителя
        const mult = CrashMath.calculateMultiplier(currentTimeMs);
        let angleDeg = 0;

        if (currentTimeMs < 1000) {
            // На взлете угол меняется быстро от 0 до 15
            angleDeg = (currentTimeMs / 1000) * 15;
        } else {
            // Дальше плавно растет до 80
            // Логарифмический рост угла смотрится лучше
            angleDeg = 15 + Math.min(65, (Math.log(mult) * 20));
        }

        // Если краш - ракета может падать или застыть
        if (isCrashed) {
            // При краше ракета не меняет угол или падает носом вниз (опционально)
            // Мы оставляем как есть, класс .boom сделает скэйл
        }

        // Применяем стили (GPU ускорение через translate3d)
        // Иконка внутри wrapper поворачивается отдельно
        this.rocketEl.style.transform = `translate3d(${pos.x + offsetX}px, ${pos.y + offsetY}px, 0)`;
        
        const icon = this.rocketEl.querySelector('i');
        if (icon) {
            // -45deg потому что иконка FontAwesome fa-jet-fighter-up смотрит вверх, а 0deg это вправо
            // Но мы уже повернули её в CSS на 45.
            // Добавляем вычисленный угол.
            icon.style.transform = `rotate(${angleDeg}deg)`;
        }
    }
};

// Экспорт
window.CrashGraphics = CrashGraphics;

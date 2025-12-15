/**
 * FASTMONEY - SPA ENGINE
 * Handles seamless navigation without page reloads.
 */

const SPA = {
    // Контейнеры
    contentContainer: null, // Сюда грузим HTML
    styleContainer: null,   // Сюда грузим CSS

    // Хранилище активных процессов (чтобы убивать их при выходе)
    activeIntervals: [],
    activeTimeouts: [],
    cleanupFunction: null, // Функция очистки конкретной игры

    init() {
        this.contentContainer = document.getElementById('app-content');
        // Перехватываем кнопку "Назад" в Telegram
        if (window.Telegram && window.Telegram.WebApp) {
            window.Telegram.WebApp.BackButton.onClick(() => {
                this.navigate('index.html'); // Или логика истории
            });
        }
        
        // Перехват кликов по ссылкам (если нужно, но мы используем navigateTo)
        console.log("🚀 SPA Engine Initialized");
    },

    // ГЛАВНАЯ ФУНКЦИЯ НАВИГАЦИИ
    async navigate(url) {
        if (!url) return;

        // 1. Вибрация и UI
        if (window.Telegram && window.Telegram.WebApp) {
            window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
        }
        
        // Показываем лоадер (можно добавить свой красивый оверлей)
        // document.getElementById('global-loader').classList.remove('hidden');

        try {
            // 2. Очистка старой страницы
            this.cleanup();

            // 3. Загрузка новой страницы
            const response = await fetch(url);
            const htmlText = await response.text();

            // 4. Парсинг HTML
            const parser = new DOMParser();
            const doc = parser.parseFromString(htmlText, 'text/html');

            // 5. Замена СТИЛЕЙ
            this.swapStyles(doc);

            // 6. Замена КОНТЕНТА (Плавный переход)
            const newContent = doc.querySelector('main') || doc.body;
            
            // Анимация ухода
            this.contentContainer.style.opacity = '0';
            
            setTimeout(() => {
                // Подмена HTML
                this.contentContainer.innerHTML = newContent.innerHTML;
                this.contentContainer.className = newContent.className; // Копируем классы main/body

                // 7. Замена СКРИПТОВ (Самое важное!)
                this.swapScripts(doc);

                // Анимация прихода
                this.contentContainer.style.opacity = '1';
                
                // Управление кнопкой Назад
                if (url.includes('index.html')) {
                    window.Telegram.WebApp.BackButton.hide();
                } else {
                    window.Telegram.WebApp.BackButton.show();
                }

            }, 200); // 200мс на фейд

        } catch (e) {
            console.error("SPA Navigation Error:", e);
            window.location.href = url; // Фоллбек на обычный переход
        }
    },

    swapStyles(newDoc) {
        // Удаляем старые уникальные стили (не style.css)
        const oldLinks = document.querySelectorAll('link[rel="stylesheet"]');
        oldLinks.forEach(link => {
            if (!link.href.includes('style.css') && !link.href.includes('font-awesome')) {
                link.remove();
            }
        });

        // Добавляем новые
        const newLinks = newDoc.querySelectorAll('link[rel="stylesheet"]');
        newLinks.forEach(link => {
            if (!link.href.includes('style.css') && !link.href.includes('font-awesome')) {
                const newLink = document.createElement('link');
                newLink.rel = 'stylesheet';
                newLink.href = link.getAttribute('href'); // Важно брать атрибут, а не свойство
                document.head.appendChild(newLink);
            }
        });
    },

    swapScripts(newDoc) {
        // Находим скрипты в новом документе
        const scripts = newDoc.querySelectorAll('script');
        
        scripts.forEach(script => {
            // Игнорируем библиотеки (Telegram SDK, JQuery и т.д.)
            if (script.src && (script.src.includes('telegram') || script.src.includes('font-awesome'))) return;

            const newScript = document.createElement('script');
            if (script.src) {
                newScript.src = script.src;
                // Добавляем timestamp чтобы избежать кэширования логики при повторном входе
                // newScript.src += `?t=${Date.now()}`; 
            } else {
                newScript.textContent = script.textContent;
            }
            
            document.body.appendChild(newScript);
            // Удаляем после загрузки, чтобы не засорять DOM (переменные останутся в памяти)
            // newScript.onload = () => newScript.remove(); 
        });
    },

    // Очистка таймеров и событий старой игры
    cleanup() {
        // Очистка интервалов (игры часто их используют)
        this.activeIntervals.forEach(clearInterval);
        this.activeTimeouts.forEach(clearTimeout);
        this.activeIntervals = [];
        this.activeTimeouts = [];

        // Вызов специфичной функции очистки игры (если игра её предоставила)
        if (typeof window.gameCleanup === 'function') {
            window.gameCleanup();
            window.gameCleanup = null;
        }
        
        // Сброс глобальных переменных игр (чтобы не конфликтовали)
        // Но делаем это аккуратно, не трогая appState
        if (window.game) window.game = null; 
    },

    // Хелперы для игр, чтобы регистрировать таймеры
    setInterval(fn, ms) {
        const id = window.setInterval(fn, ms);
        this.activeIntervals.push(id);
        return id;
    },

    setTimeout(fn, ms) {
        const id = window.setTimeout(fn, ms);
        this.activeTimeouts.push(id);
        return id;
    }
};

// Глобальный перехват таймеров (МАНК ПАТЧИНГ)
// Это позволяет не переписывать код игр, заменяя setInterval на SPA.setInterval
const originalSetInterval = window.setInterval;
const originalSetTimeout = window.setTimeout;

window.setInterval = (fn, ms) => {
    const id = originalSetInterval(fn, ms);
    if (SPA && SPA.activeIntervals) SPA.activeIntervals.push(id);
    return id;
};

window.setTimeout = (fn, ms) => {
    const id = originalSetTimeout(fn, ms);
    if (SPA && SPA.activeTimeouts) SPA.activeTimeouts.push(id);
    return id;
};

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', () => {
    SPA.init();
});

/**
 * FASTMONEY - AUDIO ENGINE
 * Управление звуковыми эффектами и музыкой.
 * Поддерживает пул звуков, зацикливание и глобальный Mute.
 */

const AudioEngine = {
    // Кэш загруженных аудио-объектов
    _sounds: {},
    
    // Текущий фоновый трек
    _currentBgm: null,
    
    // Глобальные настройки
    _enabled: true,
    _volume: 1.0,

    /**
     * Инициализация (загрузка настроек)
     */
    init() {
        // Пытаемся взять настройки из Store, если он уже загружен
        if (window.Store) {
            const settings = window.Store.get('settings');
            this._enabled = settings ? settings.sound : true;
            
            // Подписываемся на изменения в Store
            window.Store.subscribe((state, key) => {
                if (key === 'settings') {
                    this.setMute(!state.settings.sound);
                }
            });
        } 
        // Иначе читаем напрямую из LocalStorage (резерв)
        else {
            const saved = localStorage.getItem('fastMoney_store_v1');
            if (saved) {
                try {
                    const parsed = JSON.parse(saved);
                    this._enabled = parsed.settings?.sound ?? true;
                } catch (e) {}
            }
        }

        console.log(`[Audio] Initialized. Sound is ${this._enabled ? 'ON' : 'OFF'}`);
    },

    /**
     * Загрузка звука в память
     * @param {string} key - Уникальное имя (например 'win')
     * @param {string} path - Путь к файлу
     */
    load(key, path) {
        if (this._sounds[key]) return; // Уже загружен

        const audio = new Audio();
        audio.src = path;
        audio.preload = 'auto';
        
        // Обработка ошибок загрузки
        audio.onerror = () => {
            console.warn(`[Audio] Failed to load: ${key} (${path})`);
        };

        this._sounds[key] = audio;
    },

    /**
     * Предзагрузка массива звуков
     * @param {Object} soundMap - { key: path, key2: path2 }
     */
    preload(soundMap) {
        for (const [key, path] of Object.entries(soundMap)) {
            this.load(key, path);
        }
    },

    /**
     * Проиграть звук
     * @param {string} key - Ключ звука
     * @param {boolean} loop - Зациклить?
     * @param {number} volumeScale - Громкость конкретно этого звука (0.0 - 1.0)
     */
    play(key, loop = false, volumeScale = 1.0) {
        if (!this._enabled) return null;

        const original = this._sounds[key];
        if (!original) {
            // console.warn(`[Audio] Sound not found: ${key}`);
            return null;
        }

        try {
            // Для SFX создаем клон, чтобы можно было играть наложением (быстрые клики)
            // Для музыки (loop) используем оригинал или управляем отдельно
            let instance;

            if (loop) {
                // Если это музыка или долгий луп
                instance = original;
                instance.loop = true;
                this._currentBgm = instance;
            } else {
                // Клонируем узел для SFX (Fire-and-forget)
                instance = original.cloneNode();
            }

            instance.volume = this._volume * volumeScale;
            
            // Promise play (для обработки политик автоплея браузеров)
            const playPromise = instance.play();
            
            if (playPromise !== undefined) {
                playPromise.catch(error => {
                    // Обычно возникает, если пользователь еще не взаимодействовал со страницей
                    // console.log('[Audio] Autoplay blocked');
                });
            }

            return instance;

        } catch (e) {
            console.error('[Audio] Play Error:', e);
            return null;
        }
    },

    /**
     * Остановить конкретный звук (обычно луп)
     */
    stop(key) {
        const sound = this._sounds[key];
        if (sound) {
            sound.pause();
            sound.currentTime = 0;
        }
    },

    /**
     * Остановить вообще всё (например при выходе из игры)
     */
    stopAll() {
        // Останавливаем BGM
        if (this._currentBgm) {
            this._currentBgm.pause();
            this._currentBgm.currentTime = 0;
            this._currentBgm = null;
        }
        
        // Останавливаем оригиналы
        Object.values(this._sounds).forEach(audio => {
            audio.pause();
            audio.currentTime = 0;
        });
    },

    /**
     * Включить/Выключить звук глобально
     */
    setMute(isMuted) {
        this._enabled = !isMuted;
        
        if (isMuted) {
            this.stopAll();
        } else {
            // Если была музыка, можно возобновить (опционально)
        }
    },

    /**
     * Установить глобальную громкость
     */
    setVolume(val) {
        this._volume = Math.max(0, Math.min(1, val));
        if (this._currentBgm) {
            this._currentBgm.volume = this._volume;
        }
    },

    /**
     * Проиграть стандартный клик (удобно вызывать из HTML onclick)
     */
    click() {
        // Предполагается, что 'click' загружен в appInit
        this.play('click', false, 0.5); 
    }
};

// Авто-инициализация
AudioEngine.init();

// Глобальный доступ
window.AudioEngine = AudioEngine;

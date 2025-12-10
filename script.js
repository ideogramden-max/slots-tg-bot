const tg = window.Telegram.WebApp;
tg.expand(); // Раскрыть на весь экран

// Символы и их "вес" (для простоты все равны)
const symbols = ["🍒", "🍋", "🍇", "💎", "7️⃣", "🔔"];

let balance = 1000;
const bet = 10;
const winMultiplier = 10; // Множитель выигрыша

const reel1 = document.getElementById('reel1');
const reel2 = document.getElementById('reel2');
const reel3 = document.getElementById('reel3');
const balanceEl = document.getElementById('balance');
const statusEl = document.getElementById('status');
const spinBtn = document.getElementById('spinBtn');

function getRandomSymbol() {
    return symbols[Math.floor(Math.random() * symbols.length)];
}

function spin() {
    if (balance < bet) {
        statusEl.innerText = "Недостаточно средств! 😢";
        tg.HapticFeedback.notificationOccurred('error');
        return;
    }

    // Списание баланса
    balance -= bet;
    updateBalance();
    
    // Блокировка кнопки и эффекты
    spinBtn.disabled = true;
    statusEl.innerText = "Крутим...";
    tg.HapticFeedback.impactOccurred('medium'); // Вибрация при нажатии

    // Анимация прокрутки (фейковая)
    let count = 0;
    const interval = setInterval(() => {
        reel1.innerText = getRandomSymbol();
        reel2.innerText = getRandomSymbol();
        reel3.innerText = getRandomSymbol();
        count++;

        if (count > 10) {
            clearInterval(interval);
            finalizeSpin();
        }
    }, 100);
}

function finalizeSpin() {
    // Финальные результаты
    const res1 = getRandomSymbol();
    const res2 = getRandomSymbol();
    const res3 = getRandomSymbol();

    reel1.innerText = res1;
    reel2.innerText = res2;
    reel3.innerText = res3;

    spinBtn.disabled = false;

    // Проверка выигрыша
    if (res1 === res2 && res2 === res3) {
        const winAmount = bet * winMultiplier;
        balance += winAmount;
        statusEl.innerText = `JACKPOT! Вы выиграли ${winAmount} 💰`;
        tg.HapticFeedback.notificationOccurred('success'); // Вибрация успеха
        
        // Эффект фейерверка можно добавить сюда
    } else if (res1 === res2 || res2 === res3 || res1 === res3) {
        // Утешительный приз за 2 совпадения
        const smallWin = bet * 2;
        balance += smallWin;
        statusEl.innerText = `Мини-выигрыш! +${smallWin} 💰`;
        tg.HapticFeedback.impactOccurred('light');
    } else {
        statusEl.innerText = "Попробуй еще раз!";
    }
    
    updateBalance();
}

function updateBalance() {
    balanceEl.innerText = balance;
    // Сохраняем баланс в локальное хранилище, чтобы не сбрасывался при перезагрузке
    // В реальном проекте здесь должен быть запрос к базе данных
    localStorage.setItem('slotBalance', balance);
}

// Загрузка баланса при старте
const savedBalance = localStorage.getItem('slotBalance');
if (savedBalance) {
    balance = parseInt(savedBalance);
    updateBalance();
               }

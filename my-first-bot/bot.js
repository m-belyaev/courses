require('dotenv').config();
const fs = require('fs');
const axios = require('axios');
const { Telegraf, Markup } = require('telegraf');

const jokes = require('./messages');
const { getRandomJoke } = require('./utility');

// основний бот
const bot = new Telegraf(process.env.TELEGRAM_TOKEN);

// прості логи і лічильник запусків у data.json
let data = { visits: 0, users: {} };
try {
  const raw = fs.readFileSync('data.json', 'utf8');
  data = JSON.parse(raw);
} catch (e) {
  // якщо файлу ще нема або пошкоджений – використовуємо значення за замовчуванням
}

// сесії для кроків (імʼя/вік/місто, ігри тощо)
const sessions = {};


// /start – привітання, лічильник запусків, клавіатура Reply
bot.start((ctx) => {
  const userName = ctx.from.first_name || 'друже';
  data.visits += 1;
  fs.writeFileSync('data.json', JSON.stringify(data, null, 2));

  ctx.reply(
    `Привіт, ${userName}! Бот запущено вже ${data.visits} раз(и).\nОбери дію в меню.`,
    {
      reply_markup: {
        keyboard: [
          ['Інфо', 'Допомога'],
          ['Жарт', 'Кіт 🐱', 'Погода ☁️'],
          ['Міні-анкета', 'Гра число', 'Вікторина']
        ],
        resize_keyboard: true
      }
    }
  );
});

// /help – список команд
bot.help((ctx) => {
  ctx.reply(
    [
      'Доступні команди:',
      '/start – запустити бота',
      '/help – список команд',
      '/joke – випадковий жарт',
      '/random – випадкова відповідь',
      '/quiz – вікторина з кнопками',
      '/photo – випадкове фото',
      '/video – відео',
      '/file – файл PDF',
      '/cat – кіт з API',
      '/weather – погода з API'
    ].join('\n')
  );
});

// масив відповідей для /random (завдання з презентації)
const answers = [
  'Сьогодні в тебе все вийде!',
  'Краще трохи відпочинь.',
  'Час спробувати щось нове.',
  'Удача вже в дорозі до тебе.'
];

bot.command('random', (ctx) => {
  const index = Math.floor(Math.random() * answers.length);
  ctx.reply(answers[index]);
});

// /text – спеціальний режим: повторити те, що введе користувач
bot.command('text', (ctx) => {
  const id = ctx.from.id;
  sessions[id] = { type: 'echo' };
  ctx.reply('Введи будь-який текст, і я його повторю один раз.');
});

// /joke – випадковий жарт з окремого модуля
bot.command('joke', (ctx) => {
  ctx.reply(getRandomJoke(jokes));
});

// приклад масиву команд і циклу з презентації (виводиться лише в консоль)
const commands = ['start', 'help', 'joke'];
for (let i = 0; i < commands.length; i++) {
  console.log('Доступна команда:', commands[i]);
}

// Обробка тексту: спочатку активні "сесії" (анкета, гра),
// якщо сесії немає — реагуємо тільки на текстові кнопки меню
bot.on('text', (ctx) => {
  const text = ctx.message.text;
  const id = ctx.from.id;

  // ігноруємо команди типу /start, /help тощо — для них є свої хендлери
  if (text.startsWith('/')) {
    return;
  }

  // якщо є активна сесія "анкета"
  if (sessions[id]?.type === 'form') {
    if (sessions[id].step === 1) {
      sessions[id].name = text;
      sessions[id].step = 2;
      ctx.reply('Скільки тобі років?');
    } else if (sessions[id].step === 2) {
      sessions[id].age = text;
      sessions[id].step = 3;
      ctx.reply('З якого ти міста?');
    } else if (sessions[id].step === 3) {
      sessions[id].city = text;
      const s = sessions[id];
      ctx.reply(`Імʼя: ${s.name}\nВік: ${s.age}\nМісто: ${s.city}`);
      delete sessions[id];
    }
    return;
  }

  // спеціальна сесія /text: один раз виводимо "Ти написав: ...", потім вимикаємо режим
  if (sessions[id]?.type === 'echo') {
    ctx.reply('Ти написав: ' + text);
    delete sessions[id];
    return;
  }

  // якщо є активна сесія "гра число"
  if (sessions[id]?.type === 'guess') {
    const secret = sessions[id].secret;
    const num = parseInt(text, 10);
    if (Number.isNaN(num)) {
      ctx.reply('Введи число від 1 до 10.');
      return;
    }
    if (num === secret) {
      ctx.reply('Правильно! Ти вгадав число.');
      delete sessions[id];
    } else if (num < secret) {
      ctx.reply('Загадане число більше.');
    } else {
      ctx.reply('Загадане число менше.');
    }
    return;
  }

  // якщо сесій немає — це "звичайний" режим, реагуємо тільки на текстові кнопки меню

  // збереження останнього повідомлення користувача у data.json (users)
  const userId = ctx.from.id;
  data.users[userId] = text;
  fs.writeFileSync('data.json', JSON.stringify(data, null, 2));

  if (text === 'Інфо') {
    ctx.reply(`Тебе звати ${ctx.from.first_name || 'користувач'}.\nТвій ID: ${ctx.from.id}`);
  } else if (text === 'Допомога') {
    ctx.reply('Натисни "Жарт", "Кіт 🐱", "Погода ☁️", "Міні-анкета", "Гра число" або "Вікторина".');
  } else if (text === 'Жарт') {
    ctx.reply(getRandomJoke(jokes));
  } else if (text === 'Кіт 🐱') {
    handleCat(ctx);
  } else if (text === 'Погода ☁️') {
    handleWeather(ctx);
  } else if (text === 'Міні-анкета') {
    startForm(ctx);
  } else if (text === 'Гра число') {
    startGuessGame(ctx);
  } else if (text === 'Вікторина') {
    sendQuiz(ctx);
  } else {
    // будь-який інший довільний текст у "звичайному" режимі ігноруємо
    return;
  }
});

// Inline-клавіатура /menu (аналог прикладу з Markup.inlineKeyboard)
bot.command('menu', (ctx) => {
  ctx.reply(
    'Меню дій (inline-кнопки):',
    Markup.inlineKeyboard([
      Markup.button.callback('Жарт', 'joke_inline'),
      Markup.button.callback('Факт', 'fact_inline')
    ])
  );
});

bot.action('joke_inline', (ctx) => {
  ctx.reply('Ось випадковий жарт: ' + getRandomJoke(jokes));
});

bot.action('fact_inline', (ctx) => {
  ctx.reply('Цікавий факт: Telegraf працює поверх Telegram Bot API.');
});

// приклад з презентації: bot.command("file")
bot.command('file', (ctx) => {
  ctx.replyWithDocument(
    'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf'
  );
});

// /photo – надсилання випадкового фото
bot.command('photo', (ctx) => {
  ctx.replyWithPhoto('https://picsum.photos/300');
});

// /video – відео
bot.command('video', (ctx) => {
  ctx.replyWithVideo(
    'https://sample-videos.com/video123/mp4/240/big_buck_bunny_240p_1mb.mp4'
  );
});

// ---- API: /cat та /weather (axios) ----

async function handleCat(ctx) {
  try {
    const response = await axios.get('https://api.thecatapi.com/v1/images/search');
    const imageUrl = response.data[0].url;
    await ctx.replyWithPhoto(imageUrl);
  } catch (e) {
    console.error(e);
    ctx.reply('Не вдалося отримати котика :(');
  }
}

async function handleWeather(ctx) {
  try {
    const response = await axios.get(
      'https://api.open-meteo.com/v1/forecast' +
        '?latitude=50&longitude=30' +
        '&current_weather=true'
    );
    const temp = response.data.current_weather.temperature;
    ctx.reply('Температура: ' + temp + '°C');
  } catch (e) {
    console.error(e);
    ctx.reply('Не вдалося отримати погоду :(');
  }
}

bot.command('cat', (ctx) => handleCat(ctx));
bot.command('weather', (ctx) => handleWeather(ctx));

// ---- Сесії: міні-анкета за кроками (step 1/2/3) ----

function startForm(ctx) {
  const id = ctx.from.id;
  sessions[id] = { type: 'form', step: 1 };
  ctx.reply('Як тебе звати?');
}

// ---- Гра "вгадай число" ----

function startGuessGame(ctx) {
  const id = ctx.from.id;
  const randomNumber = Math.floor(Math.random() * 10) + 1;
  sessions[id] = { type: 'guess', secret: randomNumber };
  ctx.reply('Я загадав число від 1 до 10. Спробуй вгадати!');
}

// ---- Вікторина /quiz (inline-кнопки) ----

function sendQuiz(ctx) {
  ctx.reply(
    'Скільки буде 2 + 2?',
    Markup.inlineKeyboard([
      Markup.button.callback('3', 'q1'),
      Markup.button.callback('4', 'q2'),
      Markup.button.callback('5', 'q3')
    ])
  );
}

bot.command('quiz', (ctx) => sendQuiz(ctx));

bot.action('q2', (ctx) => {
  ctx.reply('Правильно!');
});

bot.action('q1', (ctx) => {
  ctx.reply('Неправильно 😅');
});

bot.action('q3', (ctx) => {
  ctx.reply('Неправильно 😅');
});

// запуск бота
bot.launch();
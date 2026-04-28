require('dotenv').config();
const { Telegraf } = require('telegraf');

const token = process.env.BOT_TOKEN;

if (!token) {
  console.error('BOT_TOKEN is not set in .env file');
  process.exit(1);
}

const bot = new Telegraf(token);

bot.start((ctx) => {
  return ctx.reply('Привіт! Я перший бот на Telegraf. 👋');
});

bot.help((ctx) => {
  return ctx.reply('Надішли мені будь-яке повідомлення, і я його повторю.\nКоманди: /start, /help');
});

bot.on('text', (ctx) => {
  return ctx.reply(`Ти написав: ${ctx.message.text}`);
});

bot.launch().then(() => {
  console.log('Bot is up and running');
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));


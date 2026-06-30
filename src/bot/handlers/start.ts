import { Bot } from 'grammy';
import { BotContext } from '../../types';
import * as UsersService from '../../services/users.service';
import * as CategoriesService from '../../services/categories.service';

export function registerStartHandlers(bot: Bot<BotContext>) {
  bot.command('start', async (ctx) => {
    const telegramId = BigInt(ctx.from!.id);
    const user = await UsersService.findByTelegramId(ctx.prisma, telegramId);

    if (!user) {
      await ctx.reply(
        '👋 Welcome to EI Bot!\n\nI\'ll help you track your income and expenses.\n\nChoose your currency:',
        {
          reply_markup: {
            inline_keyboard: [
              [
                { text: '🇺🇸 USD', callback_data: 'reg:USD' },
                { text: '🇰🇭 KHR', callback_data: 'reg:KHR' },
                { text: '🇹🇭 THB', callback_data: 'reg:THB' },
              ],
              [
                { text: '🇪🇺 EUR', callback_data: 'reg:EUR' },
                { text: '🇬🇧 GBP', callback_data: 'reg:GBP' },
              ],
            ],
          },
        },
      );
    } else {
      await ctx.reply(
        `Welcome back, ${ctx.from!.first_name}! 👋\n\n` +
        `💰 /income <amount> <note>\n` +
        `💸 /expense <amount> <note>\n` +
        `📊 /report daily|weekly|monthly\n` +
        `📈 /stats\n` +
        `💼 /budget\n` +
        `📋 /category\n` +
        `🔄 /recurring\n` +
        `⏰ /remind\n` +
        `🔍 /search <query>\n` +
        `📤 /export csv|xlsx|pdf\n` +
        `⚙️ /settings\n` +
        `❓ /help`,
      );
    }
  });

  bot.callbackQuery(/^reg:([A-Z]+)$/, async (ctx) => {
    const currency = ctx.match[1];
    await ctx.editMessageText(
      `Currency: ${currency} ✅\n\nChoose your timezone:`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🌍 UTC', callback_data: `reg_tz:UTC:${currency}` },
              { text: '🇰🇭 Phnom Penh', callback_data: `reg_tz:Asia/Phnom_Penh:${currency}` },
            ],
            [
              { text: '🇹🇭 Bangkok', callback_data: `reg_tz:Asia/Bangkok:${currency}` },
              { text: '🇻🇳 Ho Chi Minh', callback_data: `reg_tz:Asia/Ho_Chi_Minh:${currency}` },
            ],
            [
              { text: '🇺🇸 New York', callback_data: `reg_tz:America/New_York:${currency}` },
              { text: '🇬🇧 London', callback_data: `reg_tz:Europe/London:${currency}` },
            ],
          ],
        },
      },
    );
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^reg_tz:([^:]+):([A-Z]+)$/, async (ctx) => {
    const timezone = ctx.match[1];
    const currency = ctx.match[2];
    await ctx.editMessageText(
      `Timezone: ${timezone} ✅\n\nChoose your language:`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🇺🇸 English', callback_data: `reg_lang:en:${currency}:${timezone}` },
              { text: '🇰🇭 ភាសាខ្មែរ', callback_data: `reg_lang:km:${currency}:${timezone}` },
            ],
          ],
        },
      },
    );
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^reg_lang:([a-z]+):([A-Z]+):(.+)$/, async (ctx) => {
    const language = ctx.match[1];
    const currency = ctx.match[2];
    const timezone = ctx.match[3];

    const user = await UsersService.createUser(ctx.prisma, {
      telegramId: BigInt(ctx.from!.id),
      username: ctx.from!.username,
      firstName: ctx.from!.first_name,
      currency,
      timezone,
      language,
    });

    await CategoriesService.seedDefaultCategories(ctx.prisma, user.id);

    await ctx.editMessageText(
      `🎉 Setup complete!\n\n💱 Currency: ${currency}\n🕐 Timezone: ${timezone}\n\nUse /help to see all commands.`,
    );
    await ctx.answerCallbackQuery();
  });

  bot.command('help', async (ctx) => {
    await ctx.reply(
      `📖 *EI Bot Help*\n\n` +
      `*Transactions:*\n/income 500 salary\n/expense 5 coffee\n\n` +
      `*Reports:*\n/report daily|weekly|monthly|quarterly|yearly\n\n` +
      `*Budget:*\n/budget set food 500 monthly\n/budget list\n\n` +
      `*Categories:*\n/category list\n/category add Gaming\n\n` +
      `*Recurring:*\n/recurring add income 1000 salary monthly\n/recurring list\n\n` +
      `*Reminders:*\n/remind rent 500 monthly\n/remind list\n\n` +
      `*Other:*\n/search coffee\n/export csv|xlsx|pdf\n/stats\n/settings`,
      { parse_mode: 'Markdown' },
    );
  });
}

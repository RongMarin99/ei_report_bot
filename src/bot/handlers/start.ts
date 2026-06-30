import { Bot } from 'grammy';
import { BotContext } from '../../types';
import * as UsersService from '../../services/users.service';
import * as CategoriesService from '../../services/categories.service';

export function mainMenu(name: string) {
  return {
    text:
      `👋 Welcome back, ${name}!\n\n` +
      `What do you want to do?`,
    reply_markup: {
      inline_keyboard: [
        [
          { text: '💰 Add Income', callback_data: 'menu:income' },
          { text: '💸 Add Expense', callback_data: 'menu:expense' },
        ],
        [
          { text: '📊 Report', callback_data: 'menu:report' },
          { text: '📈 Stats', callback_data: 'menu:stats' },
        ],
        [
          { text: '💼 Budget', callback_data: 'menu:budget' },
          { text: '⚙️ Settings', callback_data: 'menu:settings' },
        ],
        [
          { text: '❓ Help', callback_data: 'menu:help' },
        ],
      ],
    },
  };
}

export function registerStartHandlers(bot: Bot<BotContext>) {
  bot.command('start', async (ctx) => {
    const telegramId = BigInt(ctx.from!.id);
    const user = await UsersService.findByTelegramId(ctx.prisma, telegramId);

    if (!user) {
      await ctx.reply(
        '👋 Welcome to *EI Bot*!\n\nTrack income & expenses easily.\n\nFirst, choose your currency:',
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '🇺🇸 USD (Dollar)', callback_data: 'reg:USD' },
                { text: '🇰🇭 KHR (Riel)', callback_data: 'reg:KHR' },
              ],
            ],
          },
        },
      );
    } else {
      const m = mainMenu(ctx.from!.first_name ?? 'there');
      await ctx.reply(m.text, { parse_mode: 'Markdown', reply_markup: m.reply_markup });
    }
  });

  // --- Registration flow ---
  bot.callbackQuery(/^reg:([A-Z]+)$/, async (ctx) => {
    const currency = ctx.match[1];
    await ctx.editMessageText(
      `Currency: *${currency}* ✅\n\nChoose your timezone:`,
      {
        parse_mode: 'Markdown',
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
      `Timezone: *${timezone}* ✅\n\nChoose your language:`,
      {
        parse_mode: 'Markdown',
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

    const m = mainMenu(ctx.from!.first_name ?? 'there');
    await ctx.editMessageText(
      `🎉 *Setup complete!*\n\n💱 Currency: ${currency}\n🕐 Timezone: ${timezone}\n\n${m.text}`,
      { parse_mode: 'Markdown', reply_markup: m.reply_markup },
    );
    await ctx.answerCallbackQuery();
  });

  // --- Main menu callbacks ---
  bot.callbackQuery('menu:income', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply(
      '💰 *Add Income*\n\nSend: `/income <amount> <note>`\n\nExamples:\n`/income 500 salary`\n`/income 50 freelance`',
      { parse_mode: 'Markdown' },
    );
  });

  bot.callbackQuery('menu:expense', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply(
      '💸 *Add Expense*\n\nSend: `/expense <amount> <note>`\n\nExamples:\n`/expense 5 coffee`\n`/expense 120 groceries`\n`/expense 20 transport`',
      { parse_mode: 'Markdown' },
    );
  });

  bot.callbackQuery('menu:report', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply(
      '📊 *Reports*\n\n`/report daily`\n`/report weekly`\n`/report monthly`\n`/report quarterly`\n`/report yearly`',
      { parse_mode: 'Markdown' },
    );
  });

  bot.callbackQuery('menu:stats', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply('/stats');
  });

  bot.callbackQuery('menu:budget', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply(
      '💼 *Budget*\n\n`/budget set food 500 monthly`\n`/budget list`\n`/budget delete food`',
      { parse_mode: 'Markdown' },
    );
  });

  bot.callbackQuery('menu:settings', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply('/settings');
  });

  bot.callbackQuery('menu:help', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply('/help');
  });

  bot.command('help', async (ctx) => {
    await ctx.reply(
      `📖 *EI Bot Help*\n\n` +
      `*Transactions:*\n\`/income 500 salary\`\n\`/expense 5 coffee\`\n\n` +
      `*Reports:*\n\`/report daily|weekly|monthly|quarterly|yearly\`\n\n` +
      `*Budget:*\n\`/budget set food 500 monthly\`\n\`/budget list\`\n\n` +
      `*Categories:*\n\`/category list\`\n\`/category add Gaming\`\n\n` +
      `*Recurring:*\n\`/recurring add income 1000 salary monthly\`\n\n` +
      `*Reminders:*\n\`/remind rent 500 monthly\`\n\n` +
      `*Other:*\n\`/search coffee\`\n\`/export csv\`\n\`/stats\`\n\`/settings\``,
      { parse_mode: 'Markdown' },
    );
  });
}

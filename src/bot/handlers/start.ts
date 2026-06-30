import { Bot, InlineKeyboard } from 'grammy';
import { BotContext } from '../../types';
import * as UsersService from '../../services/users.service';
import * as CategoriesService from '../../services/categories.service';

function buildMainMenu(rate: number, currency: string) {
  return new InlineKeyboard()
    .text('💰 Add Income', 'menu:income').text('💸 Add Expense', 'menu:expense').row()
    .text(`💹 Rate: 1 USD = ${Math.round(rate).toLocaleString()} ៛`, 'menu:rate').row()
    .text('📊 Reports', 'menu:report').text('⏰ Auto Reports', 'menu:schedule').row()
    .text('📈 Stats', 'menu:stats').text('📋 Category', 'menu:category').row()
    .text('🔍 Search', 'menu:search').text('📤 Export CSV', 'menu:export');
}

export function registerStartHandlers(bot: Bot<BotContext>) {

  // ─── /start ───────────────────────────────────────────────────────────────

  bot.command('start', async (ctx) => {
    const telegramId = BigInt(ctx.from!.id);
    const user = await UsersService.findByTelegramId(ctx.prisma, telegramId);

    if (!user) {
      await ctx.reply(
        '👋 *Welcome to EI Bot!*\n\nTrack income & expenses in USD and KHR.\n\nChoose your *base currency* for reports:',
        {
          parse_mode: 'Markdown',
          reply_markup: new InlineKeyboard()
            .text('🇺🇸 USD (Dollar)', 'reg:USD')
            .text('🇰🇭 KHR (Riel)', 'reg:KHR'),
        },
      );
    } else {
      const rate = (user as any).exchangeRate ?? 4100;
      await ctx.reply(
        `👋 *EI Bot*\n\nBase: *${user.currency}* | Rate: 1 USD = ${Math.round(rate).toLocaleString()} ៛`,
        { parse_mode: 'Markdown', reply_markup: buildMainMenu(rate, user.currency) },
      );
    }
  });

  // ─── Registration (currency only, no language/timezone steps) ─────────────

  bot.callbackQuery(/^reg:([A-Z]+)$/, async (ctx) => {
    const currency = ctx.match[1];
    await ctx.answerCallbackQuery();

    const user = await UsersService.createUser(ctx.prisma, {
      telegramId: BigInt(ctx.from!.id),
      username: ctx.from!.username,
      firstName: ctx.from!.first_name,
      currency,
      timezone: 'UTC',
      language: 'en',
    });

    await CategoriesService.seedDefaultCategories(ctx.prisma, user.id);

    const rate = 4100;
    await ctx.editMessageText(
      `✅ *Setup complete!*\n\nBase currency: *${currency}*\nExchange rate: 1 USD = ${rate.toLocaleString()} ៛\n\n_Adjust rate anytime via the Rate button._`,
      { parse_mode: 'Markdown', reply_markup: buildMainMenu(rate, currency) },
    );
  });

  // ─── Main menu callbacks ───────────────────────────────────────────────────

  bot.callbackQuery('menu:income', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply(
      '💰 *Add Income*\n\n' +
      '`/income <amount> <note>`\n' +
      '`/income <amount> USD <note>`\n' +
      '`/income <amount> KHR <note>`\n\n' +
      '*Examples:*\n' +
      '`/income 500 salary`\n' +
      '`/income 500 USD bonus`\n' +
      '`/income 2000000 KHR freelance`',
      { parse_mode: 'Markdown' },
    );
  });

  bot.callbackQuery('menu:expense', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply(
      '💸 *Add Expense*\n\n' +
      '`/expense <amount> <note>`\n' +
      '`/expense <amount> USD <note>`\n' +
      '`/expense <amount> KHR <note>`\n\n' +
      '*Examples:*\n' +
      '`/expense 5 coffee`\n' +
      '`/expense 5 USD lunch`\n' +
      '`/expense 20000 KHR groceries`',
      { parse_mode: 'Markdown' },
    );
  });

  bot.callbackQuery('menu:report', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply(
      '📊 *Choose Report Period:*',
      {
        parse_mode: 'Markdown',
        reply_markup: new InlineKeyboard()
          .text('Today', 'do_report:daily').text('This Week', 'do_report:weekly').row()
          .text('This Month', 'do_report:monthly').text('This Quarter', 'do_report:quarterly').row()
          .text('This Year', 'do_report:yearly'),
      },
    );
  });

  bot.callbackQuery(/^do_report:(.+)$/, async (ctx) => {
    const period = ctx.match[1];
    await ctx.answerCallbackQuery();
    const user = await UsersService.findByTelegramId(ctx.prisma, BigInt(ctx.from!.id));
    if (!user) return;

    const { generateReport } = await import('../../services/reports.service');
    const rate = (user as any).exchangeRate ?? 4100;
    const report = await generateReport(ctx.prisma, user.id, period, user.timezone, user.currency, rate);
    await ctx.reply(report, { parse_mode: 'Markdown' });
  });

  bot.callbackQuery('menu:rate', async (ctx) => {
    await ctx.answerCallbackQuery();
    const user = await UsersService.findByTelegramId(ctx.prisma, BigInt(ctx.from!.id));
    if (!user) return;
    const current = Math.round((user as any).exchangeRate ?? 4100);

    await ctx.reply(
      `💹 *Exchange Rate*\n\nCurrent: 1 USD = *${current.toLocaleString()} ៛*\n\nChoose a preset or type \`/rate <number>\`:`,
      {
        parse_mode: 'Markdown',
        reply_markup: new InlineKeyboard()
          .text('4,000', 'set_rate:4000').text('4,050', 'set_rate:4050').text('4,100', 'set_rate:4100').row()
          .text('4,150', 'set_rate:4150').text('4,200', 'set_rate:4200').text('4,250', 'set_rate:4250').row()
          .text('4,300', 'set_rate:4300').text('4,400', 'set_rate:4400').text('4,500', 'set_rate:4500'),
      },
    );
  });

  bot.callbackQuery(/^set_rate:(\d+)$/, async (ctx) => {
    const rate = parseInt(ctx.match[1]);
    await ctx.answerCallbackQuery();
    const user = await UsersService.findByTelegramId(ctx.prisma, BigInt(ctx.from!.id));
    if (!user) return;

    await UsersService.updateUser(ctx.prisma, user.id, { exchangeRate: rate } as any);
    await ctx.editMessageText(
      `✅ Exchange rate set: 1 USD = *${rate.toLocaleString()} ៛*\n\nAll reports will use this rate.`,
      { parse_mode: 'Markdown' },
    );
  });

  bot.callbackQuery('menu:schedule', async (ctx) => {
    await ctx.answerCallbackQuery();
    const user = await UsersService.findByTelegramId(ctx.prisma, BigInt(ctx.from!.id));
    if (!user) return;

    const s = await UsersService.getOrCreateReportSettings(ctx.prisma, user.id);
    await ctx.reply(
      `⏰ *Auto Report Schedule*\n\nToggle which reports to receive automatically.\nSend time: ${s.sendTime} UTC\n\nChange send time: \`/sendtime 08:00\``,
      {
        parse_mode: 'Markdown',
        reply_markup: new InlineKeyboard()
          .text(`${s.dailyEnabled ? '✅' : '❌'} Daily`, 'toggle_report:daily')
          .text(`${s.weeklyEnabled ? '✅' : '❌'} Weekly`, 'toggle_report:weekly').row()
          .text(`${s.monthlyEnabled ? '✅' : '❌'} Monthly`, 'toggle_report:monthly')
          .text(`${s.quarterlyEnabled ? '✅' : '❌'} Quarterly`, 'toggle_report:quarterly').row()
          .text(`${s.yearlyEnabled ? '✅' : '❌'} Yearly`, 'toggle_report:yearly'),
      },
    );
  });

  bot.callbackQuery('menu:stats', async (ctx) => {
    await ctx.answerCallbackQuery();
    // Trigger stats command inline
    const user = await UsersService.findByTelegramId(ctx.prisma, BigInt(ctx.from!.id));
    if (!user) return;
    const { getStats } = await import('../../services/transactions.service');
    const { fmtAmount } = await import('../../services/transactions.service');
    const rate = (user as any).exchangeRate ?? 4100;
    const stats = await getStats(ctx.prisma, user.id, user.timezone, user.currency, rate);

    let msg = `📈 *Statistics*\n\n`;
    msg += `Transactions: ${stats.totalTransactions}\n`;
    msg += `Avg daily spend: ${fmtAmount(stats.avgDailySpending, user.currency)}\n`;
    msg += `Avg monthly income: ${fmtAmount(stats.avgMonthlyIncome, user.currency)}\n`;
    msg += `Savings rate: ${stats.savingsRate.toFixed(1)}%\n\n`;
    if (stats.highestExpense) {
      msg += `Highest expense: ${fmtAmount(stats.highestExpense.amount, user.currency)}${stats.highestExpense.note ? ` (${stats.highestExpense.note})` : ''}\n\n`;
    }
    if (stats.topCategories.length > 0) {
      msg += `*Top Categories:*\n`;
      stats.topCategories.forEach((c, i) => {
        msg += `${i + 1}. ${c.icon} ${c.name}: ${fmtAmount(c.total, user.currency)}\n`;
      });
    }
    await ctx.reply(msg, { parse_mode: 'Markdown' });
  });

  bot.callbackQuery('menu:category', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply(
      '📋 *Categories*\n\n`/category list` — view all\n`/category add Gaming expense` — add custom\n`/category delete Gaming` — remove',
      { parse_mode: 'Markdown' },
    );
  });

  bot.callbackQuery('menu:search', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply(
      '🔍 *Search Transactions*\n\n`/search coffee` — by note\n`/search category food` — by category\n`/search amount > 100` — by amount\n`/search last 30 days` — by date',
      { parse_mode: 'Markdown' },
    );
  });

  bot.callbackQuery('menu:export', async (ctx) => {
    await ctx.answerCallbackQuery();
    const user = await UsersService.findByTelegramId(ctx.prisma, BigInt(ctx.from!.id));
    if (!user) return;
    const { exportTransactions } = await import('../../services/export.service');
    const { buffer, filename, mimeType } = await exportTransactions(ctx.prisma, user.id, 'csv');
    await ctx.replyWithDocument(
      { source: buffer, filename },
      { caption: '📤 Your transaction export' },
    );
  });

  // ─── /sendtime command ─────────────────────────────────────────────────────

  bot.command('sendtime', async (ctx) => {
    const parts = (ctx.message?.text ?? '').split(/\s+/).slice(1);
    const time = parts[0];
    if (!time || !/^\d{1,2}:\d{2}$/.test(time)) {
      return ctx.reply('Usage: /sendtime 08:00\nSets the time for auto reports (UTC).');
    }
    const user = await UsersService.findByTelegramId(ctx.prisma, BigInt(ctx.from!.id));
    if (!user) return ctx.reply('Please /start first.');
    await UsersService.updateReportSettings(ctx.prisma, user.id, { sendTime: time });
    await ctx.reply(`✅ Auto reports will be sent at *${time} UTC*`, { parse_mode: 'Markdown' });
  });

  // ─── /help ────────────────────────────────────────────────────────────────

  bot.command('help', async (ctx) => {
    await ctx.reply(
      `📖 *EI Bot Commands*\n\n` +
      `*Add Transactions:*\n` +
      `\`/income 500 salary\`\n` +
      `\`/income 500 USD salary\`\n` +
      `\`/income 2000000 KHR salary\`\n` +
      `\`/expense 5 coffee\`\n\n` +
      `*Reports:*\n` +
      `\`/report daily|weekly|monthly\`\n\n` +
      `*Settings:*\n` +
      `\`/rate 4100\` — set exchange rate\n` +
      `\`/sendtime 08:00\` — set report time\n` +
      `\`/settings\` — all settings\n\n` +
      `*Other:*\n` +
      `\`/budget set food 500 monthly\`\n` +
      `\`/category list\`\n` +
      `\`/search coffee\`\n` +
      `\`/stats\`\n` +
      `\`/export csv\`\n\n` +
      `Type /start to open main menu.`,
      { parse_mode: 'Markdown' },
    );
  });
}

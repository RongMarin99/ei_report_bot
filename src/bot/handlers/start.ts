import { Bot, InlineKeyboard } from 'grammy';
import { BotContext } from '../../types';
import * as UsersService from '../../services/users.service';
import * as CategoriesService from '../../services/categories.service';
import * as ConvService from '../../services/conversation.service';

export function mainMenuKeyboard(user: any): InlineKeyboard {
  const rate = user.exchangeRate ?? 4100;
  return new InlineKeyboard()
    .text('💰 Add Income', 'menu:income').text('💸 Add Expense', 'menu:expense').row()
    .text(`💹 Rate: 1 USD = ${Math.round(rate).toLocaleString()} KHR`, 'menu:rate').row()
    .text('📊 Reports', 'menu:report').text('⏰ Schedule', 'menu:schedule').row()
    .text('📈 Stats', 'menu:stats').text('📤 Export PDF', 'menu:export').row()
    .text('🔍 Search', 'menu:search').text('📋 Category', 'menu:category');
}

export function registerStartHandlers(bot: Bot<BotContext>) {

  // ─── /start ───────────────────────────────────────────────────────────────

  bot.command('start', async (ctx) => {
    const telegramId = BigInt(ctx.from!.id);

    const user = await UsersService.findByTelegramId(ctx.prisma, telegramId);

    if (user) {
      // Clear any stale conversation
      await ConvService.clearConv(ctx.prisma, user.id);
      const rate = user.exchangeRate ?? 4100;
      await ctx.reply(
        `👋 *EI Bot*\n\nBase: *${user.currency}*  |  Rate: 1 USD = ${Math.round(rate).toLocaleString()} KHR\n\nWhat would you like to do?`,
        { parse_mode: 'Markdown', reply_markup: mainMenuKeyboard(user) },
      );
    } else {
      await ctx.reply(
        '👋 *Welcome to EI Bot!*\n\nTrack income & expenses in USD and KHR.\n\nChoose your *base currency* for reports:',
        {
          parse_mode: 'Markdown',
          reply_markup: new InlineKeyboard()
            .text('🇺🇸 USD (Dollar)', 'reg:USD')
            .text('🇰🇭 KHR (Riel)', 'reg:KHR'),
        },
      );
    }
  });

  // ─── Registration ─────────────────────────────────────────────────────────

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

    await ctx.editMessageText(
      `🎉 *Setup complete!*\n\nBase: *${currency}*  |  Rate: 1 USD = 4,100 KHR\n\n_Tap the Rate button anytime to update the exchange rate._\n\nWhat would you like to do?`,
      { parse_mode: 'Markdown', reply_markup: mainMenuKeyboard(user) },
    );
  });

  // ─── Menu: Add Income ─────────────────────────────────────────────────────

  bot.callbackQuery('menu:income', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply(
      '💰 *Add Income*\n\nChoose currency:',
      {
        parse_mode: 'Markdown',
        reply_markup: new InlineKeyboard()
          .text('🇺🇸 USD', 'txn:income:USD')
          .text('🇰🇭 KHR (Riel)', 'txn:income:KHR'),
      },
    );
  });

  // ─── Menu: Add Expense ────────────────────────────────────────────────────

  bot.callbackQuery('menu:expense', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply(
      '💸 *Add Expense*\n\nChoose currency:',
      {
        parse_mode: 'Markdown',
        reply_markup: new InlineKeyboard()
          .text('🇺🇸 USD', 'txn:expense:USD')
          .text('🇰🇭 KHR (Riel)', 'txn:expense:KHR'),
      },
    );
  });

  // ─── Currency selected → ask amount ───────────────────────────────────────

  bot.callbackQuery(/^txn:(expense|income):(USD|KHR)$/, async (ctx) => {
    const type = ctx.match[1] as 'expense' | 'income';
    const currency = ctx.match[2];
    await ctx.answerCallbackQuery();

    const user = await UsersService.findByTelegramId(ctx.prisma, BigInt(ctx.from!.id));
    if (!user) return;

    await ConvService.setConv(ctx.prisma, user.id, `${type}:amount`, { currency, type });

    const icon = type === 'expense' ? '💸' : '💰';
    const hint = currency === 'KHR' ? '20000' : '5';
    await ctx.editMessageText(
      `${icon} *${type === 'expense' ? 'Expense' : 'Income'}* — ${currency}\n\nHow much? Type the amount:\n\n_Example: \`${hint}\`_\n\nType /cancel to go back.`,
      { parse_mode: 'Markdown' },
    );
  });

  // ─── Menu: Reports ────────────────────────────────────────────────────────

  bot.callbackQuery('menu:report', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply(
      '📊 *Choose Report Period:*',
      {
        parse_mode: 'Markdown',
        reply_markup: new InlineKeyboard()
          .text('📅 Today', 'do_report:daily').text('📅 This Week', 'do_report:weekly').row()
          .text('📅 This Month', 'do_report:monthly').text('📅 This Quarter', 'do_report:quarterly').row()
          .text('📅 This Year', 'do_report:yearly'),
      },
    );
  });

  bot.callbackQuery(/^do_report:(.+)$/, async (ctx) => {
    const period = ctx.match[1];
    await ctx.answerCallbackQuery('⏳ Generating PDF…');

    const user = await UsersService.findByTelegramId(ctx.prisma, BigInt(ctx.from!.id));
    if (!user) return;

    await sendReportPDF(ctx, user, period);
  });

  // ─── Menu: Exchange Rate ──────────────────────────────────────────────────

  bot.callbackQuery('menu:rate', async (ctx) => {
    await ctx.answerCallbackQuery();
    const user = await UsersService.findByTelegramId(ctx.prisma, BigInt(ctx.from!.id));
    if (!user) return;
    const current = Math.round(user.exchangeRate ?? 4100);

    await ctx.reply(
      `💹 *Exchange Rate*\n\nCurrent: 1 USD = *${current.toLocaleString()} KHR*\n\nChoose a preset or type \`/rate <number>\`:`,
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
    await ctx.answerCallbackQuery(`✅ Rate set: 1 USD = ${rate.toLocaleString()} KHR`);
    const user = await UsersService.findByTelegramId(ctx.prisma, BigInt(ctx.from!.id));
    if (!user) return;

    await UsersService.updateUser(ctx.prisma, user.id, { exchangeRate: rate });
    await ctx.editMessageText(
      `✅ *Exchange rate updated*\n\n1 USD = *${rate.toLocaleString()} KHR*\n\nAll reports will use this rate.`,
      { parse_mode: 'Markdown' },
    );
  });

  // ─── Menu: Schedule ───────────────────────────────────────────────────────

  bot.callbackQuery('menu:schedule', async (ctx) => {
    await ctx.answerCallbackQuery();
    const user = await UsersService.findByTelegramId(ctx.prisma, BigInt(ctx.from!.id));
    if (!user) return;

    const s = await UsersService.getOrCreateReportSettings(ctx.prisma, user.id);
    await ctx.reply(
      `⏰ *Auto Report Schedule*\n\nToggle which reports to receive automatically.\nSend time: *${s.sendTime} UTC*\n\nChange time with \`/sendtime 08:00\``,
      {
        parse_mode: 'Markdown',
        reply_markup: buildScheduleKeyboard(s),
      },
    );
  });

  // ─── Menu: Stats ──────────────────────────────────────────────────────────

  bot.callbackQuery('menu:stats', async (ctx) => {
    await ctx.answerCallbackQuery();
    const user = await UsersService.findByTelegramId(ctx.prisma, BigInt(ctx.from!.id));
    if (!user) return;

    const { getStats, fmtAmount } = await import('../../services/transactions.service');
    const rate = user.exchangeRate ?? 4100;
    const stats = await getStats(ctx.prisma, user.id, user.timezone, user.currency, rate);

    let msg = `📈 *Statistics*\n\n`;
    msg += `Total transactions: ${stats.totalTransactions}\n`;
    msg += `Avg daily spend: ${fmtAmount(stats.avgDailySpending, user.currency)}\n`;
    msg += `Avg monthly income: ${fmtAmount(stats.avgMonthlyIncome, user.currency)}\n`;
    msg += `Savings rate: ${stats.savingsRate.toFixed(1)}%\n`;
    if (stats.highestExpense) {
      msg += `Biggest expense: ${fmtAmount(stats.highestExpense.amount, user.currency)}${stats.highestExpense.note ? ` — ${stats.highestExpense.note}` : ''}\n`;
    }
    if (stats.topCategories.length > 0) {
      msg += `\n*Top Spending Categories:*\n`;
      stats.topCategories.forEach((c, i) => {
        msg += `${i + 1}. ${c.icon} ${c.name}: ${fmtAmount(c.total, user.currency)}\n`;
      });
    }

    await ctx.reply(msg, {
      parse_mode: 'Markdown',
      reply_markup: new InlineKeyboard().text('🏠 Main Menu', 'goto:menu'),
    });
  });

  // ─── Menu: Export ─────────────────────────────────────────────────────────

  bot.callbackQuery('menu:export', async (ctx) => {
    await ctx.answerCallbackQuery('⏳ Generating PDF…');
    const user = await UsersService.findByTelegramId(ctx.prisma, BigInt(ctx.from!.id));
    if (!user) return;

    await sendReportPDF(ctx, user, 'monthly');
  });

  // ─── Menu: Search ─────────────────────────────────────────────────────────

  bot.callbackQuery('menu:search', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply(
      '🔍 *Search Transactions*\n\n`/search coffee` — by note\n`/search category food` — by category\n`/search amount > 100` — by amount\n`/search last 30 days` — by date range',
      { parse_mode: 'Markdown' },
    );
  });

  // ─── Menu: Category ───────────────────────────────────────────────────────

  bot.callbackQuery('menu:category', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply(
      '📋 *Categories*\n\n`/category list` — view all\n`/category add Gaming expense` — add custom\n`/category delete Gaming` — remove',
      { parse_mode: 'Markdown' },
    );
  });

  // ─── Goto main menu ───────────────────────────────────────────────────────

  bot.callbackQuery('goto:menu', async (ctx) => {
    await ctx.answerCallbackQuery();
    const user = await UsersService.findByTelegramId(ctx.prisma, BigInt(ctx.from!.id));
    if (!user) return;
    const rate = user.exchangeRate ?? 4100;
    await ctx.reply(
      `🏠 *Main Menu*\n\nBase: *${user.currency}*  |  Rate: 1 USD = ${Math.round(rate).toLocaleString()} KHR`,
      { parse_mode: 'Markdown', reply_markup: mainMenuKeyboard(user) },
    );
  });

  // ─── /sendtime ────────────────────────────────────────────────────────────

  bot.command('sendtime', async (ctx) => {
    const time = (ctx.message?.text ?? '').split(/\s+/)[1];
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
      `📖 *EI Bot Help*\n\n` +
      `*Quick way:* Use the buttons from /start\n\n` +
      `*Commands:*\n` +
      `\`/income 500 salary\`\n` +
      `\`/income 500 USD salary\`\n` +
      `\`/expense 5 coffee\`\n` +
      `\`/expense 20000 KHR rent\`\n` +
      `\`/report monthly\`\n` +
      `\`/rate 4100\` — set exchange rate\n` +
      `\`/sendtime 08:00\` — auto report time\n` +
      `\`/budget set food 500 monthly\`\n` +
      `\`/category list\`\n` +
      `\`/search coffee\`\n` +
      `\`/stats\`\n` +
      `\`/export csv\`\n` +
      `\`/cancel\` — cancel current input\n` +
      `\`/start\` — main menu`,
      { parse_mode: 'Markdown' },
    );
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function buildScheduleKeyboard(s: any): InlineKeyboard {
  return new InlineKeyboard()
    .text(`${s.dailyEnabled ? '✅' : '☐'} Daily`, 'toggle_report:daily')
    .text(`${s.weeklyEnabled ? '✅' : '☐'} Weekly`, 'toggle_report:weekly').row()
    .text(`${s.monthlyEnabled ? '✅' : '☐'} Monthly`, 'toggle_report:monthly')
    .text(`${s.quarterlyEnabled ? '✅' : '☐'} Quarterly`, 'toggle_report:quarterly').row()
    .text(`${s.yearlyEnabled ? '✅' : '☐'} Yearly`, 'toggle_report:yearly');
}

async function sendReportPDF(ctx: any, user: any, period: string) {
  const dayjs = (await import('dayjs')).default;
  const utc = (await import('dayjs/plugin/utc')).default;
  const tz = (await import('dayjs/plugin/timezone')).default;
  dayjs.extend(utc);
  dayjs.extend(tz);

  const { getSummary, getDateRange } = await import('../../services/transactions.service');
  const { generateReportPDF } = await import('../../services/pdf.service');

  const rate = user.exchangeRate ?? 4100;
  const { start, end } = getDateRange(period, user.timezone);
  const { transactions, totalIncome, totalExpenses } = await getSummary(
    ctx.prisma, user.id, period, user.timezone, user.currency, rate
  );

  const now = dayjs().tz(user.timezone);
  const PERIOD_LABELS: Record<string, string> = {
    daily: `Daily — ${now.format('DD MMM YYYY')}`,
    weekly: `Weekly — ${dayjs(start).format('DD MMM')} to ${dayjs(end).format('DD MMM YYYY')}`,
    monthly: `Monthly — ${now.format('MMMM YYYY')}`,
    quarterly: `Q${Math.floor(now.month() / 3) + 1} ${now.year()}`,
    yearly: `Yearly — ${now.year()}`,
  };

  const pdfBytes = await generateReportPDF({
    title: PERIOD_LABELS[period] ?? period,
    dateRange: `${dayjs(start).format('DD MMM YYYY')} – ${dayjs(end).format('DD MMM YYYY')}`,
    baseCurrency: user.currency,
    exchangeRate: rate,
    transactions,
  });

  const filename = `ei-bot-${period}-${now.format('YYYY-MM-DD')}.pdf`;
  const net = totalIncome - totalExpenses;

  await ctx.replyWithDocument(
    { source: Buffer.from(pdfBytes), filename },
    {
      caption:
        `📊 *${PERIOD_LABELS[period]}*\n\n` +
        `💰 Income: ${formatAmt(totalIncome, user.currency)}\n` +
        `💸 Expenses: ${formatAmt(totalExpenses, user.currency)}\n` +
        `${net >= 0 ? '📈' : '📉'} Net: ${formatAmt(net, user.currency)}`,
      parse_mode: 'Markdown',
      reply_markup: new InlineKeyboard()
        .text('📅 Another Period', 'menu:report')
        .text('🏠 Menu', 'goto:menu'),
    },
  );
}

function formatAmt(amount: number, currency: string): string {
  if (currency === 'KHR') return `${Math.round(amount).toLocaleString()} KHR`;
  return `${amount.toFixed(2)} ${currency}`;
}

import { Bot } from 'grammy';
import { InlineKeyboard } from 'grammy';
import { BotContext } from '../../types';
import * as UsersService from '../../services/users.service';
import { getSummary, getDateRange, fmtAmount } from '../../services/transactions.service';
import { generateReportPDF } from '../../services/pdf.service';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

const PERIODS = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'];
const PERIOD_LABELS: Record<string, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
};

export function registerReportHandlers(bot: Bot<BotContext>) {
  bot.command('report', async (ctx) => {
    const parts = (ctx.message?.text ?? '').split(/\s+/).slice(1);
    const period = parts[0]?.toLowerCase();

    if (!period || !PERIODS.includes(period)) {
      return ctx.reply(
        '📊 *Reports*\n\nUsage: `/report <period>`\n\nPeriods: `daily` `weekly` `monthly` `quarterly` `yearly`',
        {
          parse_mode: 'Markdown',
          reply_markup: new InlineKeyboard()
            .text('Today', 'do_report:daily').text('This Week', 'do_report:weekly').row()
            .text('This Month', 'do_report:monthly').text('This Year', 'do_report:yearly'),
        },
      );
    }

    const user = await UsersService.findByTelegramId(ctx.prisma, BigInt(ctx.from!.id));
    if (!user) return ctx.reply('Please /start first.');

    await ctx.reply('⏳ Generating PDF report…');
    await sendPDFReport(ctx, user, period);
  });
}

async function sendPDFReport(ctx: any, user: any, period: string) {
  const rate = user.exchangeRate ?? 4100;
  const { start, end } = getDateRange(period, user.timezone);
  const { transactions, totalIncome, totalExpenses } = await getSummary(
    ctx.prisma, user.id, period, user.timezone, user.currency, rate,
  );

  const now = dayjs().tz(user.timezone);
  const label =
    period === 'daily'   ? `Daily — ${now.format('DD MMM YYYY')}` :
    period === 'weekly'  ? `Weekly — ${dayjs(start).format('DD MMM')} to ${dayjs(end).format('DD MMM YYYY')}` :
    period === 'monthly' ? `Monthly — ${now.format('MMMM YYYY')}` :
    period === 'quarterly' ? `Q${Math.floor(now.month() / 3) + 1} ${now.year()}` :
                           `Yearly — ${now.year()}`;

  const pdfBytes = await generateReportPDF({
    title: label,
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
        `📊 *${label}*\n\n` +
        `💰 Income: ${fmtAmount(totalIncome, user.currency)}\n` +
        `💸 Expenses: ${fmtAmount(totalExpenses, user.currency)}\n` +
        `${net >= 0 ? '📈' : '📉'} Net: ${fmtAmount(net, user.currency)}`,
      parse_mode: 'Markdown',
      reply_markup: new InlineKeyboard()
        .text('📅 Another Period', 'menu:report')
        .text('🏠 Menu', 'goto:menu'),
    },
  );
}

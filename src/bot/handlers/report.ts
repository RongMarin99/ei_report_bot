import { Bot } from 'grammy';
import { BotContext } from '../../types';
import * as UsersService from '../../services/users.service';
import * as ReportsService from '../../services/reports.service';

const PERIODS = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'];

export function registerReportHandlers(bot: Bot<BotContext>) {
  bot.command('report', async (ctx) => {
    const parts = (ctx.message?.text ?? '').split(/\s+/).slice(1);
    const period = parts[0]?.toLowerCase();

    if (!period || !PERIODS.includes(period)) {
      return ctx.reply(
        'Usage: /report <period>\n\nPeriods: daily, weekly, monthly, quarterly, yearly\n\nExample: /report monthly',
      );
    }

    const user = await UsersService.findByTelegramId(ctx.prisma, BigInt(ctx.from!.id));
    if (!user) return ctx.reply('Please /start first.');

    await ctx.reply('⏳ Generating report...');

    const rate = (user as any).exchangeRate ?? 4100;
    const report = await ReportsService.generateReport(ctx.prisma, user.id, period, user.timezone, user.currency, rate);
    await ctx.reply(report, { parse_mode: 'Markdown' });
  });
}

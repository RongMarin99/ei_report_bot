import { Bot } from 'grammy';
import { BotContext } from '../../types';
import * as UsersService from '../../services/users.service';
import * as TransactionsService from '../../services/transactions.service';

export function registerStatsHandlers(bot: Bot<BotContext>) {
  bot.command('stats', async (ctx) => {
    const user = await UsersService.findByTelegramId(ctx.prisma, BigInt(ctx.from!.id));
    if (!user) return ctx.reply('Please /start first.');

    await ctx.reply('⏳ Calculating stats...');

    const stats = await TransactionsService.getStats(ctx.prisma, user.id, user.timezone);

    let msg = `📊 *Your Statistics*\n\n`;
    msg += `📝 Total Transactions: ${stats.totalTransactions}\n`;
    msg += `📅 Avg Daily Spending: ${user.currency} ${stats.avgDailySpending.toFixed(2)}\n`;
    msg += `💰 Avg Monthly Income: ${user.currency} ${stats.avgMonthlyIncome.toFixed(2)}\n`;

    if (stats.highestExpense) {
      msg += `🔝 Highest Expense: ${user.currency} ${Number(stats.highestExpense.amount).toFixed(2)}`;
      if (stats.highestExpense.category) msg += ` (${stats.highestExpense.category.name})`;
      msg += '\n';
    }

    if (stats.topCategories.length > 0) {
      msg += '\n*Top Expense Categories:*\n';
      stats.topCategories.forEach((cat, i) => {
        msg += `${i + 1}. ${cat.icon ?? ''} ${cat.name}: ${user.currency} ${cat.total.toFixed(2)}\n`;
      });
    }

    msg += `\n💹 Savings Rate: ${stats.savingsRate.toFixed(1)}%`;

    await ctx.reply(msg, { parse_mode: 'Markdown' });
  });
}

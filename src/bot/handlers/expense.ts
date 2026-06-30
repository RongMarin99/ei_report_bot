import { Bot } from 'grammy';
import { BotContext } from '../../types';
import * as UsersService from '../../services/users.service';
import * as TransactionsService from '../../services/transactions.service';
import * as CategoriesService from '../../services/categories.service';
import * as BudgetsService from '../../services/budgets.service';

export function registerExpenseHandlers(bot: Bot<BotContext>) {
  bot.command('expense', async (ctx) => {
    const text = ctx.message?.text ?? '';
    const parts = text.split(/\s+/).slice(1);

    if (parts.length < 1) {
      return ctx.reply('Usage: /expense <amount> <note>\nExample: /expense 5 coffee');
    }

    const amount = parseFloat(parts[0]);
    if (isNaN(amount) || amount <= 0) {
      return ctx.reply('❌ Invalid amount.\nExample: /expense 5 coffee');
    }

    const note = parts.slice(1).join(' ') || '';
    const user = await UsersService.findByTelegramId(ctx.prisma, BigInt(ctx.from!.id));
    if (!user) return ctx.reply('Please /start first to set up your account.');

    const category = await CategoriesService.findBestMatch(ctx.prisma, user.id, note, 'expense');

    await TransactionsService.create(ctx.prisma, {
      userId: user.id,
      type: 'expense',
      amount,
      currency: user.currency,
      categoryId: category?.id,
      note,
      transactionDate: new Date(),
    });

    const icon = category?.icon ?? '💸';
    const catName = category?.name ?? 'Other';
    const date = new Date().toLocaleDateString();

    let reply =
      `✅ Expense recorded!\n\n` +
      `${icon} ${catName}\n` +
      `Amount: ${user.currency} ${amount.toFixed(2)}\n` +
      (note ? `Note: ${note}\n` : '') +
      `Date: ${date}`;

    if (category) {
      const budget = await BudgetsService.getBudgetForCategory(ctx.prisma, user.id, category.id, 'monthly');
      if (budget) {
        const spent = await TransactionsService.getMonthlySpentByCategory(ctx.prisma, user.id, category.id);
        const budgetAmt = Number(budget.amount);
        const pct = Math.round((spent / budgetAmt) * 100);
        const remaining = budgetAmt - spent;

        reply += `\n\n💼 Budget (${catName}):\n`;
        reply += `${user.currency} ${spent.toFixed(2)} / ${budgetAmt.toFixed(2)} (${pct}%)\n`;
        reply += `Remaining: ${user.currency} ${Math.max(0, remaining).toFixed(2)}`;

        if (pct >= 100) reply += '\n🚨 Budget exceeded!';
        else if (pct >= 80) reply += '\n⚠️ Near budget limit!';
      }
    }

    await ctx.reply(reply);
  });
}

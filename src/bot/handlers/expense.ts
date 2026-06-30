import { Bot } from 'grammy';
import { BotContext } from '../../types';
import * as UsersService from '../../services/users.service';
import * as TransactionsService from '../../services/transactions.service';
import * as CategoriesService from '../../services/categories.service';
import * as BudgetsService from '../../services/budgets.service';

const CURRENCIES = ['USD', 'KHR'];

export function registerExpenseHandlers(bot: Bot<BotContext>) {
  bot.command('expense', async (ctx) => {
    const text = ctx.message?.text ?? '';
    const parts = text.split(/\s+/).slice(1);

    if (parts.length < 1) {
      return ctx.reply(
        'Usage: /expense <amount> [USD|KHR] <note>\n\n' +
        'Examples:\n/expense 5 coffee\n/expense 5 USD coffee\n/expense 20000 KHR coffee',
      );
    }

    const amount = parseFloat(parts[0]);
    if (isNaN(amount) || amount <= 0) {
      return ctx.reply('❌ Invalid amount.\nExample: /expense 5 coffee');
    }

    const user = await UsersService.findByTelegramId(ctx.prisma, BigInt(ctx.from!.id));
    if (!user) return ctx.reply('Please /start first.');

    const rate = (user as any).exchangeRate ?? 4100;

    let currency = user.currency;
    let noteStart = 1;
    if (parts[1] && CURRENCIES.includes(parts[1].toUpperCase())) {
      currency = parts[1].toUpperCase();
      noteStart = 2;
    }
    const note = parts.slice(noteStart).join(' ') || '';

    const category = await CategoriesService.findBestMatch(ctx.prisma, user.id, note, 'expense');

    await TransactionsService.create(ctx.prisma, {
      userId: user.id,
      type: 'expense',
      amount,
      currency,
      categoryId: category?.id,
      note,
      transactionDate: new Date(),
    });

    const icon = category?.icon ?? '💸';
    const catName = category?.name ?? 'Other';
    const displayAmt = TransactionsService.fmtAmount(amount, currency);

    let reply = `✅ Expense recorded!\n\n${icon} ${catName}\nAmount: ${displayAmt}`;
    if (note) reply += `\nNote: ${note}`;

    if (currency !== user.currency) {
      const baseAmt = TransactionsService.toBaseCurrency(amount, currency, user.currency, rate);
      reply += `\n≈ ${TransactionsService.fmtAmount(baseAmt, user.currency)}`;
    }

    if (category) {
      const budget = await BudgetsService.getBudgetForCategory(ctx.prisma, user.id, category.id, 'monthly');
      if (budget) {
        const spent = await TransactionsService.getMonthlySpentByCategory(ctx.prisma, user.id, category.id, 'monthly', user.currency, rate);
        const budgetAmt = budget.amount;
        const pct = Math.round((spent / budgetAmt) * 100);
        const remaining = budgetAmt - spent;

        reply += `\n\n💼 Budget (${catName}):\n`;
        reply += `${TransactionsService.fmtAmount(spent, user.currency)} / ${TransactionsService.fmtAmount(budgetAmt, user.currency)} (${pct}%)\n`;
        reply += `Remaining: ${TransactionsService.fmtAmount(Math.max(0, remaining), user.currency)}`;

        if (pct >= 100) reply += '\n🚨 Budget exceeded!';
        else if (pct >= 80) reply += '\n⚠️ Near limit!';
      }
    }

    await ctx.reply(reply);
  });
}

import { Bot } from 'grammy';
import { BotContext } from '../../types';
import * as UsersService from '../../services/users.service';
import * as BudgetsService from '../../services/budgets.service';
import * as CategoriesService from '../../services/categories.service';
import * as TransactionsService from '../../services/transactions.service';

export function registerBudgetHandlers(bot: Bot<BotContext>) {
  bot.command('budget', async (ctx) => {
    const text = ctx.message?.text ?? '';
    const parts = text.split(/\s+/).slice(1);
    const sub = parts[0]?.toLowerCase();

    const user = await UsersService.findByTelegramId(ctx.prisma, BigInt(ctx.from!.id));
    if (!user) return ctx.reply('Please /start first.');

    if (sub === 'set') {
      // /budget set <category> <amount> <period>
      if (parts.length < 4) {
        return ctx.reply('Usage: /budget set <category> <amount> monthly|weekly\nExample: /budget set food 500 monthly');
      }
      const catName = parts[1];
      const amount = parseFloat(parts[2]);
      const period = parts[3]?.toLowerCase() as 'monthly' | 'weekly';

      if (isNaN(amount) || amount <= 0) return ctx.reply('❌ Invalid amount.');
      if (!['monthly', 'weekly'].includes(period)) return ctx.reply('❌ Period must be monthly or weekly.');

      const category = await CategoriesService.findBestMatch(ctx.prisma, user.id, catName, 'expense');
      if (!category) return ctx.reply(`❌ Category "${catName}" not found. Use /category list to see available categories.`);

      await BudgetsService.upsertBudget(ctx.prisma, user.id, category.id, amount, period);
      await ctx.reply(`✅ Budget set!\n\n${category.icon} ${category.name}: ${user.currency} ${amount} per ${period}`);

    } else if (sub === 'delete') {
      const catName = parts[1];
      const period = (parts[2]?.toLowerCase() ?? 'monthly') as 'monthly' | 'weekly';
      const category = await CategoriesService.findBestMatch(ctx.prisma, user.id, catName, 'expense');
      if (!category) return ctx.reply(`❌ Category "${catName}" not found.`);

      await BudgetsService.deleteBudget(ctx.prisma, user.id, category.id, period);
      await ctx.reply(`✅ Budget for ${category.name} (${period}) deleted.`);

    } else {
      // List budgets
      const budgets = await BudgetsService.getUserBudgets(ctx.prisma, user.id);
      if (budgets.length === 0) {
        return ctx.reply('No budgets set.\n\nUse /budget set <category> <amount> monthly');
      }

      let msg = '💼 *Your Budgets*\n\n';
      for (const b of budgets) {
        const spent = await TransactionsService.getMonthlySpentByCategory(ctx.prisma, user.id, b.categoryId!, b.period);
        const total = Number(b.amount);
        const pct = Math.min(100, Math.round((spent / total) * 100));
        const bar = progressBar(pct);
        const icon = b.category?.icon ?? '📊';
        const status = pct >= 100 ? '🚨' : pct >= 80 ? '⚠️' : '✅';
        msg += `${status} ${icon} ${b.category?.name}\n`;
        msg += `${bar} ${pct}%\n`;
        msg += `${user.currency} ${spent.toFixed(2)} / ${total.toFixed(2)} (${b.period})\n\n`;
      }

      await ctx.reply(msg, { parse_mode: 'Markdown' });
    }
  });
}

function progressBar(pct: number): string {
  const filled = Math.round(pct / 10);
  return '█'.repeat(filled) + '░'.repeat(10 - filled);
}

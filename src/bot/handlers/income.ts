import { Bot } from 'grammy';
import { BotContext } from '../../types';
import * as UsersService from '../../services/users.service';
import * as TransactionsService from '../../services/transactions.service';
import * as CategoriesService from '../../services/categories.service';

export function registerIncomeHandlers(bot: Bot<BotContext>) {
  bot.command('income', async (ctx) => {
    const text = ctx.message?.text ?? '';
    const parts = text.split(/\s+/).slice(1);

    if (parts.length < 1) {
      return ctx.reply('Usage: /income <amount> <note>\nExample: /income 500 salary');
    }

    const amount = parseFloat(parts[0]);
    if (isNaN(amount) || amount <= 0) {
      return ctx.reply('❌ Invalid amount. Use a positive number.\nExample: /income 500 salary');
    }

    const note = parts.slice(1).join(' ') || '';
    const user = await UsersService.findByTelegramId(ctx.prisma, BigInt(ctx.from!.id));
    if (!user) return ctx.reply('Please /start first to set up your account.');

    const category = await CategoriesService.findBestMatch(ctx.prisma, user.id, note, 'income');

    const tx = await TransactionsService.create(ctx.prisma, {
      userId: user.id,
      type: 'income',
      amount,
      currency: user.currency,
      categoryId: category?.id,
      note,
      transactionDate: new Date(),
    });

    const icon = category?.icon ?? '💰';
    const catName = category?.name ?? 'Other';
    const date = new Date().toLocaleDateString();

    await ctx.reply(
      `✅ Income recorded!\n\n` +
      `${icon} ${catName}\n` +
      `Amount: ${user.currency} ${amount.toFixed(2)}\n` +
      (note ? `Note: ${note}\n` : '') +
      `Date: ${date}`,
    );
  });
}

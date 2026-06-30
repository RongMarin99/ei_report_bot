import { Bot } from 'grammy';
import { BotContext } from '../../types';
import * as UsersService from '../../services/users.service';
import * as TransactionsService from '../../services/transactions.service';
import * as CategoriesService from '../../services/categories.service';

const CURRENCIES = ['USD', 'KHR'];

export function registerIncomeHandlers(bot: Bot<BotContext>) {
  bot.command('income', async (ctx) => {
    const text = ctx.message?.text ?? '';
    const parts = text.split(/\s+/).slice(1);

    if (parts.length < 1) {
      return ctx.reply(
        'Usage: /income <amount> [USD|KHR] <note>\n\n' +
        'Examples:\n/income 500 salary\n/income 500 USD salary\n/income 2000000 KHR rent',
      );
    }

    const amount = parseFloat(parts[0]);
    if (isNaN(amount) || amount <= 0) {
      return ctx.reply('❌ Invalid amount.\nExample: /income 500 salary');
    }

    const user = await UsersService.findByTelegramId(ctx.prisma, BigInt(ctx.from!.id));
    if (!user) return ctx.reply('Please /start first.');

    let currency = user.currency;
    let noteStart = 1;
    if (parts[1] && CURRENCIES.includes(parts[1].toUpperCase())) {
      currency = parts[1].toUpperCase();
      noteStart = 2;
    }
    const note = parts.slice(noteStart).join(' ') || '';

    const category = await CategoriesService.findBestMatch(ctx.prisma, user.id, note, 'income');

    await TransactionsService.create(ctx.prisma, {
      userId: user.id,
      type: 'income',
      amount,
      currency,
      categoryId: category?.id,
      note,
      transactionDate: new Date(),
    });

    const icon = category?.icon ?? '💰';
    const catName = category?.name ?? 'Other';
    const displayAmt = TransactionsService.fmtAmount(amount, currency);

    let reply = `✅ Income recorded!\n\n${icon} ${catName}\nAmount: ${displayAmt}`;
    if (note) reply += `\nNote: ${note}`;

    if (currency !== user.currency) {
      const rate = (user as any).exchangeRate ?? 4100;
      const baseAmt = TransactionsService.toBaseCurrency(amount, currency, user.currency, rate);
      reply += `\n≈ ${TransactionsService.fmtAmount(baseAmt, user.currency)}`;
    }

    await ctx.reply(reply);
  });
}

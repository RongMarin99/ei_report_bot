import { Bot } from 'grammy';
import { BotContext } from '../../types';
import * as UsersService from '../../services/users.service';
import * as TransactionsService from '../../services/transactions.service';

export function registerSearchHandlers(bot: Bot<BotContext>) {
  bot.command('search', async (ctx) => {
    const text = ctx.message?.text ?? '';
    const query = text.split(/\s+/).slice(1).join(' ').trim();

    if (!query) {
      return ctx.reply(
        'Usage: /search <query>\n\nExamples:\n' +
        '/search coffee\n' +
        '/search category food\n' +
        '/search last 30 days',
      );
    }

    const user = await UsersService.findByTelegramId(ctx.prisma, BigInt(ctx.from!.id));
    if (!user) return ctx.reply('Please /start first.');

    const results = await TransactionsService.search(ctx.prisma, user.id, query);

    if (results.length === 0) {
      return ctx.reply(`No transactions found for "${query}"`);
    }

    let msg = `🔍 *Search: ${query}*\n`;
    msg += `Found ${results.length} transaction${results.length > 1 ? 's' : ''}\n\n`;

    const shown = results.slice(0, 15);
    for (const tx of shown) {
      const icon = tx.type === 'income' ? '💰' : '💸';
      const catIcon = (tx as any).category?.icon ?? '';
      const date = tx.transactionDate.toLocaleDateString();
      msg += `${icon} ${catIcon} ${user.currency} ${Number(tx.amount).toFixed(2)}`;
      if (tx.note) msg += ` — ${tx.note}`;
      msg += `\n${date}\n\n`;
    }

    if (results.length > 15) {
      msg += `_...and ${results.length - 15} more_`;
    }

    await ctx.reply(msg, { parse_mode: 'Markdown' });
  });
}

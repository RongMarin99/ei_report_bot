import { Bot, InputFile } from 'grammy';
import { BotContext } from '../../types';
import * as UsersService from '../../services/users.service';

export function registerExportHandlers(bot: Bot<BotContext>) {
  bot.command('export', async (ctx) => {
    const user = await UsersService.findByTelegramId(ctx.prisma, BigInt(ctx.from!.id));
    if (!user) return ctx.reply('Please /start first.');

    const transactions = await ctx.prisma.transaction.findMany({
      where: { userId: user.id },
      include: { category: true },
      orderBy: { transactionDate: 'desc' },
    });

    const headers = ['Date', 'Type', 'Category', 'Amount', 'Currency', 'Note'];
    const lines = [
      headers.join(','),
      ...transactions.map((t) => [
        new Date(t.transactionDate).toLocaleDateString('en-GB'),
        t.type,
        (t as any).category?.name ?? 'Other',
        t.amount.toFixed(2),
        t.currency,
        (t.note ?? '').replace(/"/g, '""'),
      ].map((v) => `"${v}"`).join(',')),
    ];

    const now = new Date().toISOString().split('T')[0];
    const filename = `ChhayLuy_Transactions_${now}.csv`;
    await ctx.replyWithDocument(
      new InputFile(Buffer.from(lines.join('\n'), 'utf-8'), filename),
      { caption: `📤 *${transactions.length} transactions exported*`, parse_mode: 'Markdown' },
    );
  });
}

import { Bot } from 'grammy';
import { BotContext } from '../../types';
import * as UsersService from '../../services/users.service';
import * as RecurringService from '../../services/recurring.service';
import * as CategoriesService from '../../services/categories.service';

const FREQUENCIES = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'];

export function registerRecurringHandlers(bot: Bot<BotContext>) {
  bot.command('recurring', async (ctx) => {
    const text = ctx.message?.text ?? '';
    const parts = text.split(/\s+/).slice(1);
    const sub = parts[0]?.toLowerCase();

    const user = await UsersService.findByTelegramId(ctx.prisma, BigInt(ctx.from!.id));
    if (!user) return ctx.reply('Please /start first.');

    if (sub === 'add') {
      // /recurring add <income|expense> <amount> <category> <frequency>
      if (parts.length < 5) {
        return ctx.reply(
          'Usage: /recurring add <income|expense> <amount> <category> <frequency>\n' +
          'Example: /recurring add income 1000 salary monthly',
        );
      }

      const type = parts[1]?.toLowerCase() as 'income' | 'expense';
      const amount = parseFloat(parts[2]);
      const catName = parts[3];
      const frequency = parts[4]?.toLowerCase();

      if (!['income', 'expense'].includes(type)) return ctx.reply('❌ Type must be income or expense.');
      if (isNaN(amount) || amount <= 0) return ctx.reply('❌ Invalid amount.');
      if (!FREQUENCIES.includes(frequency)) return ctx.reply(`❌ Frequency must be: ${FREQUENCIES.join(', ')}`);

      const category = await CategoriesService.findBestMatch(ctx.prisma, user.id, catName, type);

      const rec = await RecurringService.create(ctx.prisma, {
        userId: user.id,
        type: type as any,
        amount,
        categoryId: category?.id,
        frequency: frequency as any,
      });

      const icon = type === 'income' ? '💰' : '💸';
      await ctx.reply(
        `✅ Recurring ${type} added!\n\n` +
        `${icon} ${category?.name ?? catName}: ${user.currency} ${amount}\n` +
        `Frequency: ${frequency}\n` +
        `Next: ${rec.nextExecution.toLocaleDateString()}`,
      );

    } else if (sub === 'toggle') {
      const id = parseInt(parts[1]);
      if (isNaN(id)) return ctx.reply('Usage: /recurring toggle <id>');
      const rec = await RecurringService.toggle(ctx.prisma, id, user.id);
      await ctx.reply(`✅ Recurring #${id} is now ${rec.enabled ? 'enabled ✅' : 'paused ⏸'}`);

    } else if (sub === 'delete') {
      const id = parseInt(parts[1]);
      if (isNaN(id)) return ctx.reply('Usage: /recurring delete <id>');
      await RecurringService.remove(ctx.prisma, id, user.id);
      await ctx.reply(`✅ Recurring #${id} deleted.`);

    } else {
      // List
      const list = await RecurringService.findByUser(ctx.prisma, user.id);
      if (list.length === 0) {
        return ctx.reply('No recurring transactions.\n\nAdd: /recurring add income 1000 salary monthly');
      }

      let msg = '🔄 *Recurring Transactions*\n\n';
      for (const r of list) {
        const icon = r.type === 'income' ? '💰' : '💸';
        const status = r.enabled ? '✅' : '⏸';
        msg += `${status} #${r.id} ${icon} ${(r as any).category?.name ?? 'Unknown'}\n`;
        msg += `${user.currency} ${Number(r.amount).toFixed(2)} / ${r.frequency}\n`;
        msg += `Next: ${r.nextExecution.toLocaleDateString()}\n\n`;
      }

      await ctx.reply(msg, { parse_mode: 'Markdown' });
    }
  });
}

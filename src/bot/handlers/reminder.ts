import { Bot } from 'grammy';
import { BotContext } from '../../types';
import * as UsersService from '../../services/users.service';
import * as RemindersService from '../../services/reminders.service';

const FREQUENCIES = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'];

export function registerReminderHandlers(bot: Bot<BotContext>) {
  bot.command('remind', async (ctx) => {
    const text = ctx.message?.text ?? '';
    const parts = text.split(/\s+/).slice(1);
    const sub = parts[0]?.toLowerCase();

    const user = await UsersService.findByTelegramId(ctx.prisma, BigInt(ctx.from!.id));
    if (!user) return ctx.reply('Please /start first.');

    if (sub === 'list') {
      const reminders = await RemindersService.findByUser(ctx.prisma, user.id);
      if (reminders.length === 0) {
        return ctx.reply('No reminders.\n\nAdd: /remind rent 500 monthly');
      }

      let msg = '⏰ *Your Reminders*\n\n';
      for (const r of reminders) {
        const status = r.enabled ? '✅' : '⏸';
        const amt = r.amount ? ` - ${user.currency} ${Number(r.amount).toFixed(2)}` : '';
        msg += `${status} #${r.id} ${r.title}${amt}\n`;
        msg += `${r.frequency} | Next: ${r.nextExecution.toLocaleDateString()}\n\n`;
      }

      return ctx.reply(msg, { parse_mode: 'Markdown' });
    }

    if (sub === 'delete') {
      const id = parseInt(parts[1]);
      if (isNaN(id)) return ctx.reply('Usage: /remind delete <id>');
      await RemindersService.remove(ctx.prisma, id, user.id);
      return ctx.reply(`✅ Reminder #${id} deleted.`);
    }

    // Default: add reminder
    // /remind <title> <amount> <frequency>  OR  /remind <title> <frequency>
    if (parts.length < 2) {
      return ctx.reply(
        'Usage: /remind <title> [amount] <frequency>\n\n' +
        'Examples:\n/remind rent 500 monthly\n/remind gym monthly',
      );
    }

    const frequency = parts[parts.length - 1]?.toLowerCase();
    if (!FREQUENCIES.includes(frequency)) {
      return ctx.reply(`❌ Frequency must be: ${FREQUENCIES.join(', ')}`);
    }

    const remaining = parts.slice(0, -1);
    const lastPart = remaining[remaining.length - 1];
    const amount = parseFloat(lastPart);
    let title: string;

    if (!isNaN(amount) && remaining.length > 1) {
      title = remaining.slice(0, -1).join(' ');
    } else {
      title = remaining.join(' ');
    }

    const reminder = await RemindersService.create(ctx.prisma, {
      userId: user.id,
      title,
      amount: isNaN(amount) ? undefined : amount,
      frequency: frequency as any,
    });

    const amtStr = !isNaN(amount) ? ` - ${user.currency} ${amount}` : '';
    await ctx.reply(
      `⏰ Reminder set!\n\n${title}${amtStr}\nFrequency: ${frequency}\nNext: ${reminder.nextExecution.toLocaleDateString()}`,
    );
  });
}

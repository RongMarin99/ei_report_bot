import { Bot, InlineKeyboard } from 'grammy';
import { BotContext } from '../../types';
import * as UsersService from '../../services/users.service';
import * as ConvService from '../../services/conversation.service';
import * as TransactionsService from '../../services/transactions.service';
import * as CategoriesService from '../../services/categories.service';
import * as BudgetsService from '../../services/budgets.service';
import { mainMenuKeyboard } from './start';

function parseAmountInput(text: string): number | null {
  const amount = parseFloat(text.replace(/,/g, '').trim());
  if (isNaN(amount) || amount <= 0) return null;
  return amount;
}

async function deleteMessages(ctx: any, ids: number[]) {
  for (const id of ids) {
    await ctx.api.deleteMessage(ctx.chat!.id, id).catch(() => null);
  }
}

export function registerConversationHandlers(bot: Bot<BotContext>) {

  // ─── Cancel (button or command) ───────────────────────────────────────────

  async function cancelFlow(ctx: any, deleteCurrentMsg = false) {
    const user = await UsersService.findByTelegramId(ctx.prisma, BigInt(ctx.from!.id));
    if (user) {
      const conv = await ConvService.getConv(ctx.prisma, user.id);
      if (conv?.data.toDelete?.length) {
        await deleteMessages(ctx, conv.data.toDelete);
      }
      if (deleteCurrentMsg) {
        await ctx.deleteMessage().catch(() => null);
      }
      await ConvService.clearConv(ctx.prisma, user.id);
      await ctx.reply('🏠 *Main Menu*', {
        parse_mode: 'Markdown',
        reply_markup: mainMenuKeyboard(user),
      });
    } else {
      await ctx.reply('Cancelled. Use /start to begin.');
    }
  }

  bot.command('cancel', async (ctx) => {
    await cancelFlow(ctx, false);
  });

  bot.callbackQuery('conv:cancel', async (ctx) => {
    await ctx.answerCallbackQuery('Cancelled');
    await cancelFlow(ctx, true);
  });

  // ─── Skip description ─────────────────────────────────────────────────────

  bot.callbackQuery('conv:skip', async (ctx) => {
    await ctx.answerCallbackQuery();
    const user = await UsersService.findByTelegramId(ctx.prisma, BigInt(ctx.from!.id));
    if (!user) return;

    const conv = await ConvService.getConv(ctx.prisma, user.id);
    if (!conv?.data.amount) return;

    // Delete the "Add description" message (this message)
    await ctx.deleteMessage().catch(() => null);
    await saveTransaction(ctx, user, conv.data, '');
  });

  // ─── Text message handler (non-command) ───────────────────────────────────

  bot.on('message:text', async (ctx) => {
    const text = ctx.message.text.trim();
    if (text.startsWith('/')) return;

    const user = await UsersService.findByTelegramId(ctx.prisma, BigInt(ctx.from!.id));
    if (!user) return ctx.reply('Type /start to begin.');

    const conv = await ConvService.getConv(ctx.prisma, user.id);
    if (!conv) return;

    const rate = user.exchangeRate ?? 4100;
    const userMsgId = ctx.message.message_id;

    // ── Amount step ──────────────────────────────────────────────────────────

    if (conv.step === 'expense:amount' || conv.step === 'income:amount') {
      const amount = parseAmountInput(text);
      if (!amount) {
        const hint = await ctx.reply(
          `❌ Enter a number.\n\nExamples: \`5\`  \`20000\`  \`1500.50\``,
          { parse_mode: 'Markdown' },
        );
        // delete the invalid input + error hint after short delay is not possible,
        // just track them for cleanup
        await ConvService.setConv(ctx.prisma, user.id, conv.step, {
          ...conv.data,
          toDelete: [...(conv.data.toDelete ?? []), userMsgId, hint.message_id],
        });
        return;
      }

      const type = conv.step.split(':')[0] as 'expense' | 'income';
      const currency = conv.data.currency ?? user.currency;

      const displayAmt = TransactionsService.fmtAmount(amount, currency);
      const baseAmt = currency !== user.currency
        ? ` ≈ ${TransactionsService.fmtAmount(TransactionsService.toBaseCurrency(amount, currency, user.currency, rate), user.currency)}`
        : '';

      const icon = type === 'expense' ? '💸' : '💰';
      const sent = await ctx.reply(
        `${icon} *${displayAmt}*${baseAmt}\n\nAdd a description:`,
        {
          parse_mode: 'Markdown',
          reply_markup: new InlineKeyboard()
            .text('⏭️ Skip', 'conv:skip')
            .text('❌ Cancel', 'conv:cancel'),
        },
      );

      await ConvService.setConv(ctx.prisma, user.id, `${type}:desc`, {
        amount, currency, type,
        toDelete: [...(conv.data.toDelete ?? []), userMsgId, sent.message_id],
      });
      return;
    }

    // ── Description step ─────────────────────────────────────────────────────

    if (conv.step === 'expense:desc' || conv.step === 'income:desc') {
      // Track user's description message for cleanup
      const toDelete = [...(conv.data.toDelete ?? []), userMsgId];
      await saveTransaction(ctx, user, { ...conv.data, toDelete }, text);
    }
  });

  // ─── Save transaction ─────────────────────────────────────────────────────

  async function saveTransaction(ctx: any, user: any, data: ConvService.ConvData, note: string) {
    const { amount, currency, type, toDelete } = data;
    if (!amount || !currency || !type) return;

    const rate = user.exchangeRate ?? 4100;
    const category = await CategoriesService.findBestMatch(ctx.prisma, user.id, note, type);

    await TransactionsService.create(ctx.prisma, {
      userId: user.id,
      type,
      amount,
      currency,
      categoryId: category?.id,
      note: note || undefined,
      transactionDate: new Date(),
    });

    await ConvService.clearConv(ctx.prisma, user.id);

    // Delete all intermediate messages to clean up chat
    if (toDelete?.length) {
      await deleteMessages(ctx, toDelete);
    }

    const icon = type === 'expense' ? '💸' : '💰';
    const displayAmt = TransactionsService.fmtAmount(amount, currency);
    const baseAmt = currency !== user.currency
      ? ` (≈ ${TransactionsService.fmtAmount(TransactionsService.toBaseCurrency(amount, currency, user.currency, rate), user.currency)})`
      : '';

    let reply = `✅ *${type === 'expense' ? 'Expense' : 'Income'} saved!*\n\n`;
    reply += `${icon} ${displayAmt}${baseAmt}\n`;
    reply += `📂 ${category?.icon ?? ''} ${category?.name ?? 'Other'}\n`;
    if (note) reply += `📝 ${note}\n`;

    if (type === 'expense' && category) {
      const budget = await BudgetsService.getBudgetForCategory(ctx.prisma, user.id, category.id, 'monthly');
      if (budget) {
        const spent = await TransactionsService.getMonthlySpentByCategory(ctx.prisma, user.id, category.id, 'monthly', user.currency, rate);
        const pct = Math.round((spent / budget.amount) * 100);
        reply += `\n💼 Budget: ${TransactionsService.fmtAmount(spent, user.currency)} / ${TransactionsService.fmtAmount(budget.amount, user.currency)} (${pct}%)`;
        if (pct >= 100) reply += '\n🚨 Budget exceeded!';
        else if (pct >= 80) reply += '\n⚠️ Near limit!';
      }
    }

    await ctx.reply(reply, {
      parse_mode: 'Markdown',
      reply_markup: mainMenuKeyboard(user),
    });
  }
}

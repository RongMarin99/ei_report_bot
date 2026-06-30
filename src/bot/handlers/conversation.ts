import { Bot, InlineKeyboard } from 'grammy';
import { BotContext } from '../../types';
import * as UsersService from '../../services/users.service';
import * as ConvService from '../../services/conversation.service';
import * as TransactionsService from '../../services/transactions.service';
import * as CategoriesService from '../../services/categories.service';
import * as BudgetsService from '../../services/budgets.service';
import { mainMenuKeyboard } from './start';

const CURRENCIES = ['USD', 'KHR'];

function parseAmountInput(text: string, defaultCurrency: string): { amount: number; currency: string } | null {
  const clean = text.replace(/,/g, '').trim();
  const parts = clean.split(/\s+/);
  const amount = parseFloat(parts[0]);
  if (isNaN(amount) || amount <= 0) return null;

  let currency = defaultCurrency;
  if (parts[1] && CURRENCIES.includes(parts[1].toUpperCase())) {
    currency = parts[1].toUpperCase();
  }
  return { amount, currency };
}

export function registerConversationHandlers(bot: Bot<BotContext>) {

  // Cancel command clears any active conversation
  bot.command('cancel', async (ctx) => {
    const user = await UsersService.findByTelegramId(ctx.prisma, BigInt(ctx.from!.id));
    if (user) await ConvService.clearConv(ctx.prisma, user.id);
    await ctx.reply('❌ Cancelled.\n\nUse /start to open the main menu.');
  });

  // Skip description button
  bot.callbackQuery('conv:skip', async (ctx) => {
    await ctx.answerCallbackQuery();
    const user = await UsersService.findByTelegramId(ctx.prisma, BigInt(ctx.from!.id));
    if (!user) return;

    const conv = await ConvService.getConv(ctx.prisma, user.id);
    if (!conv || !conv.data.amount) return;

    await saveTransaction(ctx, user, conv.data, '');
  });

  // Text message handler (non-command)
  bot.on('message:text', async (ctx) => {
    const text = ctx.message.text.trim();
    if (text.startsWith('/')) return; // let commands handle

    const user = await UsersService.findByTelegramId(ctx.prisma, BigInt(ctx.from!.id));
    if (!user) {
      return ctx.reply('Type /start to begin.');
    }

    const conv = await ConvService.getConv(ctx.prisma, user.id);
    if (!conv) return; // no active flow

    const rate = (user as any).exchangeRate ?? 4100;

    if (conv.step === 'expense:amount' || conv.step === 'income:amount') {
      const parsed = parseAmountInput(text, user.currency);
      if (!parsed) {
        return ctx.reply(
          `❌ Invalid amount.\n\nEnter a number:\n\`5\`   \`5 USD\`   \`20000 KHR\``,
          { parse_mode: 'Markdown' },
        );
      }

      const type = conv.step.split(':')[0] as 'expense' | 'income';
      await ConvService.setConv(ctx.prisma, user.id, `${type}:desc`, { amount: parsed.amount, currency: parsed.currency, type });

      const displayAmt = TransactionsService.fmtAmount(parsed.amount, parsed.currency);
      const baseAmt = parsed.currency !== user.currency
        ? ` ≈ ${TransactionsService.fmtAmount(TransactionsService.toBaseCurrency(parsed.amount, parsed.currency, user.currency, rate), user.currency)}`
        : '';

      await ctx.reply(
        `${type === 'expense' ? '💸' : '💰'} *${displayAmt}*${baseAmt}\n\nAdd a description for this ${type}:`,
        {
          parse_mode: 'Markdown',
          reply_markup: new InlineKeyboard().text('⏭️ Skip', 'conv:skip'),
        },
      );
      return;
    }

    if (conv.step === 'expense:desc' || conv.step === 'income:desc') {
      await saveTransaction(ctx, user, conv.data, text);
    }
  });

  async function saveTransaction(ctx: any, user: any, data: ConvService.ConvData, note: string) {
    const { amount, currency, type } = data;
    if (!amount || !currency || !type) return;

    const rate = (user as any).exchangeRate ?? 4100;
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

    const icon = type === 'expense' ? '💸' : '💰';
    const displayAmt = TransactionsService.fmtAmount(amount, currency);
    const baseAmt = currency !== user.currency
      ? ` (≈ ${TransactionsService.fmtAmount(TransactionsService.toBaseCurrency(amount, currency, user.currency, rate), user.currency)})`
      : '';

    let reply = `✅ *${type === 'expense' ? 'Expense' : 'Income'} saved!*\n\n`;
    reply += `${icon} ${displayAmt}${baseAmt}\n`;
    reply += `📂 ${category?.icon ?? ''} ${category?.name ?? 'Other'}\n`;
    if (note) reply += `📝 ${note}\n`;

    // Budget check for expenses
    if (type === 'expense' && category) {
      const budget = await BudgetsService.getBudgetForCategory(ctx.prisma, user.id, category.id, 'monthly');
      if (budget) {
        const spent = await TransactionsService.getMonthlySpentByCategory(ctx.prisma, user.id, category.id, 'monthly', user.currency, rate);
        const pct = Math.round((spent / budget.amount) * 100);
        reply += `\n💼 Budget: ${TransactionsService.fmtAmount(spent, user.currency)} / ${TransactionsService.fmtAmount(budget.amount, user.currency)} (${pct}%)`;
        if (pct >= 100) reply += '\n🚨 Budget exceeded!';
        else if (pct >= 80) reply += '\n⚠️ Near budget limit!';
      }
    }

    await ctx.reply(reply, {
      parse_mode: 'Markdown',
      reply_markup: mainMenuKeyboard(user),
    });
  }
}

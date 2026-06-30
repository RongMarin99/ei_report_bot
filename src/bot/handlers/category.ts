import { Bot } from 'grammy';
import { BotContext } from '../../types';
import * as UsersService from '../../services/users.service';
import * as CategoriesService from '../../services/categories.service';

export function registerCategoryHandlers(bot: Bot<BotContext>) {
  bot.command('category', async (ctx) => {
    const text = ctx.message?.text ?? '';
    const parts = text.split(/\s+/).slice(1);
    const sub = parts[0]?.toLowerCase();

    const user = await UsersService.findByTelegramId(ctx.prisma, BigInt(ctx.from!.id));
    if (!user) return ctx.reply('Please /start first.');

    if (sub === 'add') {
      const name = parts.slice(1, -1).join(' ') || parts[1];
      const typeArg = parts[parts.length - 1]?.toLowerCase();
      const type = typeArg === 'income' ? 'income' : 'expense';
      const catName = typeArg === 'income' || typeArg === 'expense'
        ? parts.slice(1, -1).join(' ')
        : parts.slice(1).join(' ');

      if (!catName) return ctx.reply('Usage: /category add <name> [expense|income]\nExample: /category add Gaming');

      try {
        const cat = await CategoriesService.createUserCategory(ctx.prisma, user.id, catName, type);
        await ctx.reply(`✅ Category "${cat.name}" added! (${type})`);
      } catch (e: any) {
        await ctx.reply(`❌ ${e.message}`);
      }

    } else if (sub === 'delete') {
      const catName = parts.slice(1).join(' ');
      const category = await CategoriesService.findBestMatch(ctx.prisma, user.id, catName, 'expense');
      if (!category) return ctx.reply(`❌ Category "${catName}" not found.`);
      if (category.isDefault) return ctx.reply('❌ Cannot delete default categories.');

      await CategoriesService.deleteUserCategory(ctx.prisma, user.id, category.id);
      await ctx.reply(`✅ Category "${category.name}" deleted.`);

    } else {
      // List all categories
      const categories = await CategoriesService.getUserCategories(ctx.prisma, user.id);
      const expenses = categories.filter((c) => c.type === 'expense');
      const incomes = categories.filter((c) => c.type === 'income');

      let msg = '📋 *Your Categories*\n\n';
      msg += '*💸 Expense:*\n';
      msg += expenses.map((c) => `${c.icon ?? '•'} ${c.name}${c.isDefault ? '' : ' (custom)'}`).join('\n');
      msg += '\n\n*💰 Income:*\n';
      msg += incomes.map((c) => `${c.icon ?? '•'} ${c.name}${c.isDefault ? '' : ' (custom)'}`).join('\n');
      msg += '\n\nAdd: /category add <name>\nDelete: /category delete <name>';

      await ctx.reply(msg, { parse_mode: 'Markdown' });
    }
  });
}

import { Bot } from 'grammy';
import { InputFile } from 'grammy';
import { BotContext } from '../../types';
import * as UsersService from '../../services/users.service';
import * as ExportService from '../../services/export.service';

export function registerExportHandlers(bot: Bot<BotContext>) {
  bot.command('export', async (ctx) => {
    const parts = (ctx.message?.text ?? '').split(/\s+/).slice(1);
    const format = parts[0]?.toLowerCase() as 'csv' | 'xlsx' | 'pdf';

    if (!format || !['csv', 'xlsx', 'pdf'].includes(format)) {
      return ctx.reply('Usage: /export <format>\n\nFormats: csv, xlsx, pdf\nExample: /export csv');
    }

    const user = await UsersService.findByTelegramId(ctx.prisma, BigInt(ctx.from!.id));
    if (!user) return ctx.reply('Please /start first.');

    await ctx.reply(`⏳ Generating ${format.toUpperCase()} export...`);

    try {
      const result = await ExportService.exportTransactions(ctx.prisma, user.id, format);
      await ctx.replyWithDocument(new InputFile(result.buffer, result.filename));
    } catch (e: any) {
      await ctx.reply(`❌ Export failed: ${e.message}`);
    }
  });
}

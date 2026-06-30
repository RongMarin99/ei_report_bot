import { Bot } from 'grammy';
import { BotContext } from '../../types';
import * as UsersService from '../../services/users.service';

export function registerSettingsHandlers(bot: Bot<BotContext>) {
  bot.command('settings', async (ctx) => {
    const user = await UsersService.findByTelegramId(ctx.prisma, BigInt(ctx.from!.id));
    if (!user) return ctx.reply('Please /start first.');

    const settings = await UsersService.getOrCreateReportSettings(ctx.prisma, user.id);
    const rate = (user as any).exchangeRate ?? 4100;

    await ctx.reply(
      `⚙️ *Settings*\n\n` +
      `💱 Currency: ${user.currency}\n` +
      `💹 Exchange Rate: 1 USD = ${Math.round(rate).toLocaleString()} ៛\n` +
      `🕐 Timezone: ${user.timezone}\n\n` +
      `*Auto Reports:*\n` +
      `Daily: ${settings.dailyEnabled ? '✅' : '❌'}\n` +
      `Weekly: ${settings.weeklyEnabled ? '✅' : '❌'}\n` +
      `Monthly: ${settings.monthlyEnabled ? '✅' : '❌'}\n` +
      `Quarterly: ${settings.quarterlyEnabled ? '✅' : '❌'}\n` +
      `Yearly: ${settings.yearlyEnabled ? '✅' : '❌'}\n\n` +
      `Set exchange rate: \`/rate 4100\``,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: `Daily ${settings.dailyEnabled ? '✅' : '❌'}`, callback_data: 'toggle_report:daily' },
              { text: `Weekly ${settings.weeklyEnabled ? '✅' : '❌'}`, callback_data: 'toggle_report:weekly' },
            ],
            [
              { text: `Monthly ${settings.monthlyEnabled ? '✅' : '❌'}`, callback_data: 'toggle_report:monthly' },
              { text: `Quarterly ${settings.quarterlyEnabled ? '✅' : '❌'}`, callback_data: 'toggle_report:quarterly' },
            ],
            [
              { text: `Yearly ${settings.yearlyEnabled ? '✅' : '❌'}`, callback_data: 'toggle_report:yearly' },
            ],
            [
              { text: '💱 Change Currency', callback_data: 'settings:currency' },
            ],
          ],
        },
      },
    );
  });

  // Set exchange rate command: /rate 4100
  bot.command('rate', async (ctx) => {
    const parts = (ctx.message?.text ?? '').split(/\s+/).slice(1);
    const newRate = parseFloat(parts[0]);

    if (isNaN(newRate) || newRate <= 0) {
      return ctx.reply('Usage: /rate <number>\nExample: /rate 4100\n\nSets: 1 USD = 4100 KHR');
    }

    const user = await UsersService.findByTelegramId(ctx.prisma, BigInt(ctx.from!.id));
    if (!user) return ctx.reply('Please /start first.');

    await UsersService.updateUser(ctx.prisma, user.id, { exchangeRate: newRate } as any);
    await ctx.reply(`✅ Exchange rate updated: 1 USD = ${Math.round(newRate).toLocaleString()} ៛\n\nAll reports will use this rate.`);
  });

  bot.callbackQuery(/^toggle_report:(.+)$/, async (ctx) => {
    const period = ctx.match[1];
    const user = await UsersService.findByTelegramId(ctx.prisma, BigInt(ctx.from!.id));
    if (!user) return ctx.answerCallbackQuery('User not found');

    const settings = await UsersService.getOrCreateReportSettings(ctx.prisma, user.id);
    const key = `${period}Enabled` as any;
    await UsersService.updateReportSettings(ctx.prisma, user.id, { [key]: !settings[key] });

    await ctx.answerCallbackQuery(`${period} reports ${!settings[key] ? 'enabled' : 'disabled'}`);
    await ctx.deleteMessage().catch(() => null);
    await ctx.reply(`✅ ${period.charAt(0).toUpperCase() + period.slice(1)} reports ${!settings[key] ? 'enabled ✅' : 'disabled ❌'}\n\nUse /settings to view all settings.`);
  });

  bot.callbackQuery('settings:currency', async (ctx) => {
    await ctx.editMessageText(
      'Choose base currency:\n\n_All reports will be shown in this currency._',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🇺🇸 USD (Dollar)', callback_data: 'set_currency:USD' },
              { text: '🇰🇭 KHR (Riel)', callback_data: 'set_currency:KHR' },
            ],
          ],
        },
      },
    );
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^set_currency:([A-Z]+)$/, async (ctx) => {
    const currency = ctx.match[1];
    const user = await UsersService.findByTelegramId(ctx.prisma, BigInt(ctx.from!.id));
    if (!user) return ctx.answerCallbackQuery('User not found');

    await UsersService.updateUser(ctx.prisma, user.id, { currency });
    await ctx.editMessageText(`✅ Base currency set to ${currency}\n\nAll reports will now show in ${currency}.`);
    await ctx.answerCallbackQuery();
  });
}

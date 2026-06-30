import { Bot } from 'grammy';
import { BotContext } from '../../types';
import * as UsersService from '../../services/users.service';

export function registerSettingsHandlers(bot: Bot<BotContext>) {
  bot.command('settings', async (ctx) => {
    const user = await UsersService.findByTelegramId(ctx.prisma, BigInt(ctx.from!.id));
    if (!user) return ctx.reply('Please /start first.');

    const settings = await UsersService.getOrCreateReportSettings(ctx.prisma, user.id);

    await ctx.reply(
      `⚙️ *Settings*\n\n` +
      `💱 Currency: ${user.currency}\n` +
      `🕐 Timezone: ${user.timezone}\n` +
      `🌐 Language: ${user.language}\n\n` +
      `*Auto Reports:*\n` +
      `Daily: ${settings.dailyEnabled ? '✅' : '❌'}\n` +
      `Weekly: ${settings.weeklyEnabled ? '✅' : '❌'}\n` +
      `Monthly: ${settings.monthlyEnabled ? '✅' : '❌'}\n` +
      `Quarterly: ${settings.quarterlyEnabled ? '✅' : '❌'}\n` +
      `Yearly: ${settings.yearlyEnabled ? '✅' : '❌'}\n` +
      `Send time: ${settings.sendTime}`,
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

  bot.callbackQuery(/^toggle_report:(.+)$/, async (ctx) => {
    const period = ctx.match[1];
    const user = await UsersService.findByTelegramId(ctx.prisma, BigInt(ctx.from!.id));
    if (!user) return ctx.answerCallbackQuery('User not found');

    const settings = await UsersService.getOrCreateReportSettings(ctx.prisma, user.id);
    const key = `${period}Enabled` as any;
    await UsersService.updateReportSettings(ctx.prisma, user.id, { [key]: !settings[key] });

    await ctx.answerCallbackQuery(`${period} reports ${!settings[key] ? 'enabled' : 'disabled'}`);
    await ctx.deleteMessage();
    await ctx.reply(`✅ ${period.charAt(0).toUpperCase() + period.slice(1)} reports ${!settings[key] ? 'enabled ✅' : 'disabled ❌'}`);
  });

  bot.callbackQuery('settings:currency', async (ctx) => {
    await ctx.editMessageText('Choose new currency:', {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🇺🇸 USD', callback_data: 'set_currency:USD' },
            { text: '🇰🇭 KHR', callback_data: 'set_currency:KHR' },
            { text: '🇹🇭 THB', callback_data: 'set_currency:THB' },
          ],
          [
            { text: '🇪🇺 EUR', callback_data: 'set_currency:EUR' },
            { text: '🇬🇧 GBP', callback_data: 'set_currency:GBP' },
          ],
        ],
      },
    });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^set_currency:([A-Z]+)$/, async (ctx) => {
    const currency = ctx.match[1];
    const user = await UsersService.findByTelegramId(ctx.prisma, BigInt(ctx.from!.id));
    if (!user) return ctx.answerCallbackQuery('User not found');

    await UsersService.updateUser(ctx.prisma, user.id, { currency });
    await ctx.editMessageText(`✅ Currency updated to ${currency}`);
    await ctx.answerCallbackQuery();
  });
}

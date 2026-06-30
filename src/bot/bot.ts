import { Bot } from 'grammy';
import { BotContext } from '../types';
import { registerStartHandlers } from './handlers/start';
import { registerIncomeHandlers } from './handlers/income';
import { registerExpenseHandlers } from './handlers/expense';
import { registerReportHandlers } from './handlers/report';
import { registerBudgetHandlers } from './handlers/budget';
import { registerCategoryHandlers } from './handlers/category';
import { registerRecurringHandlers } from './handlers/recurring';
import { registerReminderHandlers } from './handlers/reminder';
import { registerSearchHandlers } from './handlers/search';
import { registerExportHandlers } from './handlers/export';
import { registerStatsHandlers } from './handlers/stats';
import { registerSettingsHandlers } from './handlers/settings';

export function registerHandlers(bot: Bot<BotContext>): void {
  registerStartHandlers(bot);
  registerIncomeHandlers(bot);
  registerExpenseHandlers(bot);
  registerReportHandlers(bot);
  registerBudgetHandlers(bot);
  registerCategoryHandlers(bot);
  registerRecurringHandlers(bot);
  registerReminderHandlers(bot);
  registerSearchHandlers(bot);
  registerExportHandlers(bot);
  registerStatsHandlers(bot);
  registerSettingsHandlers(bot);

  bot.catch((err) => {
    console.error('Bot error:', err.message);
  });
}

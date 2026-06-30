import { Bot } from 'grammy';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { createPrisma } from '../db/prisma';
import { Env } from '../types';

dayjs.extend(utc);
dayjs.extend(timezone);

export async function handleScheduled(
  event: ScheduledEvent,
  env: Env,
  ctx: ExecutionContext,
): Promise<void> {
  const prisma = createPrisma(env.DB);
  const bot = new Bot(env.BOT_TOKEN);

  try {
    await Promise.all([
      processRecurringTransactions(prisma, bot),
      processReminders(prisma, bot),
      processScheduledReports(prisma, bot),
    ]);
  } catch (e) {
    console.error('Scheduled job error:', e);
  } finally {
    await (prisma as any).$disconnect?.();
  }
}

async function processRecurringTransactions(prisma: any, bot: Bot) {
  const due = await prisma.recurringTransaction.findMany({
    where: { enabled: true, nextExecution: { lte: new Date() } },
    include: { user: true, category: true },
  });

  for (const rec of due) {
    try {
      await prisma.transaction.create({
        data: {
          userId: rec.userId,
          type: rec.type,
          amount: rec.amount,
          currency: rec.user.currency,
          categoryId: rec.categoryId,
          note: `Auto: ${rec.category?.name ?? 'recurring'}`,
          transactionDate: new Date(),
        },
      });

      const nextExecution = computeNextDate(rec.frequency);
      await prisma.recurringTransaction.update({
        where: { id: rec.id },
        data: { nextExecution },
      });

      const icon = rec.type === 'income' ? '💰' : '💸';
      await bot.api.sendMessage(
        rec.user.telegramId.toString(),
        `${icon} Auto-recorded: ${rec.user.currency} ${rec.amount} (${rec.category?.name ?? 'recurring'})`,
      );
    } catch (e) {
      console.error(`Recurring ${rec.id} failed:`, e);
    }
  }
}

async function processReminders(prisma: any, bot: Bot) {
  const due = await prisma.reminder.findMany({
    where: { enabled: true, nextExecution: { lte: new Date() } },
    include: { user: true },
  });

  for (const reminder of due) {
    try {
      const nextExecution = computeNextDate(reminder.frequency);
      await prisma.reminder.update({
        where: { id: reminder.id },
        data: { nextExecution },
      });

      const amountStr = reminder.amount ? ` - ${reminder.user.currency} ${reminder.amount}` : '';
      await bot.api.sendMessage(
        reminder.user.telegramId.toString(),
        `⏰ Reminder: ${reminder.title}${amountStr}`,
      );
    } catch (e) {
      console.error(`Reminder ${reminder.id} failed:`, e);
    }
  }
}

async function processScheduledReports(prisma: any, bot: Bot) {
  const now = dayjs();
  const users = await prisma.user.findMany({
    where: { reportSettings: { isNot: null } },
    include: { reportSettings: true },
  });

  for (const user of users) {
    const settings = user.reportSettings;
    if (!settings) continue;

    try {
      const userNow = now.tz(settings.timezone);
      const [sendHour] = settings.sendTime.split(':').map(Number);

      if (userNow.hour() !== sendHour) continue;

      const dayOfWeek = userNow.day();
      const dayOfMonth = userNow.date();
      const month = userNow.month() + 1;

      if (settings.dailyEnabled) {
        await sendReportNotification(bot, user, 'daily');
      }
      if (settings.weeklyEnabled && dayOfWeek === 0) {
        await sendReportNotification(bot, user, 'weekly');
      }
      if (settings.monthlyEnabled && dayOfMonth === 1) {
        await sendReportNotification(bot, user, 'monthly');
      }
      if (settings.quarterlyEnabled && dayOfMonth === 1 && [1, 4, 7, 10].includes(month)) {
        await sendReportNotification(bot, user, 'quarterly');
      }
      if (settings.yearlyEnabled && dayOfMonth === 1 && month === 1) {
        await sendReportNotification(bot, user, 'yearly');
      }
    } catch (e) {
      console.error(`Report for user ${user.id} failed:`, e);
    }
  }
}

async function sendReportNotification(bot: Bot, user: any, period: string) {
  await bot.api.sendMessage(
    user.telegramId.toString(),
    `📊 Your ${period} report is ready! Use /report ${period} to view it.`,
  );
}

function computeNextDate(frequency: string): Date {
  const now = dayjs();
  switch (frequency) {
    case 'daily': return now.add(1, 'day').toDate();
    case 'weekly': return now.add(1, 'week').toDate();
    case 'monthly': return now.add(1, 'month').toDate();
    case 'quarterly': return now.add(3, 'month').toDate();
    case 'yearly': return now.add(1, 'year').toDate();
    default: return now.add(1, 'month').toDate();
  }
}

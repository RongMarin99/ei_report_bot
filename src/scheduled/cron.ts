import { Bot, InputFile } from 'grammy';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { createPrisma } from '../db/prisma';
import { Env } from '../types';
import { getSummary, getDateRange, fmtAmount } from '../services/transactions.service';
import { generateReportPDF } from '../services/pdf.service';

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
    // Recurring transactions + reminders run every cron trigger (*/15 for freshness)
    await Promise.all([
      processRecurringTransactions(prisma, bot),
      processReminders(prisma, bot),
    ]);

    // Scheduled reports ONLY on the hourly cron — prevents 4x duplicate sends
    // from the */15 cron firing within the same hour
    if (event.cron === '0 * * * *') {
      await processScheduledReports(prisma, bot);
    }
  } catch (e) {
    console.error('Scheduled job error:', e);
  } finally {
    await (prisma as any).$disconnect?.();
  }
}

// ─── Recurring transactions ────────────────────────────────────────────────────

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
      await prisma.recurringTransaction.update({
        where: { id: rec.id },
        data: { nextExecution: computeNextDate(rec.frequency) },
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

// ─── Reminders ────────────────────────────────────────────────────────────────

async function processReminders(prisma: any, bot: Bot) {
  const due = await prisma.reminder.findMany({
    where: { enabled: true, nextExecution: { lte: new Date() } },
    include: { user: true },
  });

  for (const reminder of due) {
    try {
      await prisma.reminder.update({
        where: { id: reminder.id },
        data: { nextExecution: computeNextDate(reminder.frequency) },
      });
      const amountStr = reminder.amount ? ` — ${reminder.user.currency} ${reminder.amount}` : '';
      await bot.api.sendMessage(
        reminder.user.telegramId.toString(),
        `⏰ Reminder: ${reminder.title}${amountStr}`,
      );
    } catch (e) {
      console.error(`Reminder ${reminder.id} failed:`, e);
    }
  }
}

// ─── Scheduled reports ────────────────────────────────────────────────────────
//
// Trigger times (all in user's local timezone, at their configured sendTime):
//   Daily     → every day at sendTime
//   Weekly    → Sunday at sendTime
//   Monthly   → last day of month at sendTime
//   Quarterly → last day of quarter (Mar/Jun/Sep/Dec) at sendTime
//   Yearly    → Dec 31 at sendTime

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
      const tz = settings.timezone || user.timezone || 'UTC';
      const userNow = now.tz(tz);
      const hour = userNow.hour();
      const [sendHour] = (settings.sendTime || '12:00').split(':').map(Number);

      const dayOfMonth  = userNow.date();
      const daysInMonth = userNow.daysInMonth();
      const month       = userNow.month() + 1; // 1-based
      const isLastDay   = dayOfMonth === daysInMonth;
      const isLastOfQ   = isLastDay && [3, 6, 9, 12].includes(month);

      // All periods trigger at user's configured sendTime (local timezone)
      if (hour !== sendHour) continue;

      // Daily — every day at sendTime
      if (settings.dailyEnabled) {
        await sendReportPDF(bot, prisma, user, 'daily', tz);
      }

      // Weekly — Sunday at sendTime
      if (settings.weeklyEnabled && userNow.day() === 0) {
        await sendReportPDF(bot, prisma, user, 'weekly', tz);
      }

      // Monthly — last day of month at sendTime
      if (settings.monthlyEnabled && isLastDay) {
        await sendReportPDF(bot, prisma, user, 'monthly', tz);
      }

      // Quarterly — last day of quarter (Mar/Jun/Sep/Dec) at sendTime
      if (settings.quarterlyEnabled && isLastOfQ) {
        await sendReportPDF(bot, prisma, user, 'quarterly', tz);
      }

      // Yearly — Dec 31 at sendTime
      if (settings.yearlyEnabled && month === 12 && dayOfMonth === 31) {
        await sendReportPDF(bot, prisma, user, 'yearly', tz);
      }
    } catch (e) {
      console.error(`Report for user ${user.id} failed:`, e);
    }
  }
}

async function sendReportPDF(bot: Bot, prisma: any, user: any, period: string, tz: string) {
  const rate = user.exchangeRate ?? 4100;
  const now = dayjs().tz(tz);
  const { start, end } = getDateRange(period, tz);
  const { transactions, totalIncome, totalExpenses } = await getSummary(
    prisma, user.id, period, tz, user.currency, rate,
  );

  const label =
    period === 'daily'     ? `Daily — ${now.format('DD MMM YYYY')}` :
    period === 'weekly'    ? `Weekly — ${dayjs(start).format('DD MMM')} to ${dayjs(end).format('DD MMM YYYY')}` :
    period === 'monthly'   ? `Monthly — ${now.format('MMMM YYYY')}` :
    period === 'quarterly' ? `Q${Math.floor(now.month() / 3) + 1} ${now.year()}` :
                             `Yearly — ${now.year()}`;

  const pdfBytes = await generateReportPDF({
    title: label,
    dateRange: `${dayjs(start).format('DD MMM YYYY')} – ${dayjs(end).format('DD MMM YYYY')}`,
    baseCurrency: user.currency,
    exchangeRate: rate,
    transactions,
  });

  const filename = `ChhayLuy_${period}_${now.format('YYYY-MM-DD')}.pdf`;
  const net = totalIncome - totalExpenses;

  await bot.api.sendDocument(
    user.telegramId.toString(),
    new InputFile(pdfBytes, filename),
    {
      caption:
        `📊 *${label}*\n\n` +
        `💰 Income: ${fmtAmount(totalIncome, user.currency)}\n` +
        `💸 Expenses: ${fmtAmount(totalExpenses, user.currency)}\n` +
        `${net >= 0 ? '📈' : '📉'} Net: ${fmtAmount(net, user.currency)}`,
      parse_mode: 'Markdown',
    },
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function computeNextDate(frequency: string): Date {
  const now = dayjs();
  switch (frequency) {
    case 'daily':     return now.add(1, 'day').toDate();
    case 'weekly':    return now.add(1, 'week').toDate();
    case 'monthly':   return now.add(1, 'month').toDate();
    case 'quarterly': return now.add(3, 'month').toDate();
    case 'yearly':    return now.add(1, 'year').toDate();
    default:          return now.add(1, 'month').toDate();
  }
}

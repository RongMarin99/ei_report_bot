import { PrismaClient } from '@prisma/client';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { getSummary, getDateRange, toBaseCurrency, fmtAmount } from './transactions.service';

dayjs.extend(utc);
dayjs.extend(timezone);

export async function generateReport(
  prisma: PrismaClient,
  userId: number,
  period: string,
  tz: string,
  currency: string,
  exchangeRate: number = 4100,
): Promise<string> {
  switch (period) {
    case 'daily': return generateDailyReport(prisma, userId, tz, currency, exchangeRate);
    case 'weekly': return generateWeeklyReport(prisma, userId, tz, currency, exchangeRate);
    case 'monthly': return generateMonthlyReport(prisma, userId, tz, currency, exchangeRate);
    case 'quarterly': return generateQuarterlyReport(prisma, userId, tz, currency, exchangeRate);
    case 'yearly': return generateYearlyReport(prisma, userId, tz, currency, exchangeRate);
    default: return '❌ Unknown period';
  }
}

async function generateDailyReport(prisma: PrismaClient, userId: number, tz: string, currency: string, rate: number) {
  const { transactions, totalIncome, totalExpenses, netBalance } = await getSummary(prisma, userId, 'daily', tz, currency, rate);
  const date = dayjs().tz(tz).format('DD MMM YYYY');

  let msg = `📊 *Daily Report — ${date}*\n`;
  msg += `_All amounts in ${currency} (rate: 1 USD = ${Math.round(rate)} ៛)_\n\n`;

  const incomes = transactions.filter((t) => t.type === 'income');
  const expenses = transactions.filter((t) => t.type === 'expense');

  if (incomes.length > 0) {
    msg += `*💰 Income:*\n`;
    incomes.forEach((t) => {
      const converted = toBaseCurrency(t.amount, t.currency, currency, rate);
      const original = t.currency !== currency ? ` _(${fmtAmount(t.amount, t.currency)})_` : '';
      msg += `${(t as any).category?.icon ?? ''} ${fmtAmount(converted, currency)}${original}${t.note ? ` — ${t.note}` : ''}\n`;
    });
    msg += `*Total: ${fmtAmount(totalIncome, currency)}*\n\n`;
  }

  if (expenses.length > 0) {
    msg += `*💸 Expenses:*\n`;
    expenses.forEach((t) => {
      const converted = toBaseCurrency(t.amount, t.currency, currency, rate);
      const original = t.currency !== currency ? ` _(${fmtAmount(t.amount, t.currency)})_` : '';
      msg += `${(t as any).category?.icon ?? ''} ${fmtAmount(converted, currency)}${original}${t.note ? ` — ${t.note}` : ''}\n`;
    });
    msg += `*Total: ${fmtAmount(totalExpenses, currency)}*\n\n`;
  }

  if (transactions.length === 0) msg += '_No transactions today_\n\n';

  const netIcon = netBalance >= 0 ? '📈' : '📉';
  msg += `${netIcon} *Net: ${fmtAmount(netBalance, currency)}*`;
  return msg;
}

async function generateWeeklyReport(prisma: PrismaClient, userId: number, tz: string, currency: string, rate: number) {
  const { transactions, totalIncome, totalExpenses } = await getSummary(prisma, userId, 'weekly', tz, currency, rate);
  const now = dayjs().tz(tz);
  const weekStart = now.startOf('week').format('DD MMM');
  const weekEnd = now.endOf('week').format('DD MMM YYYY');

  let msg = `📊 *Weekly Report — ${weekStart} to ${weekEnd}*\n`;
  msg += `_All amounts in ${currency}_\n\n`;

  const catMap: Record<string, { name: string; icon: string; total: number }> = {};
  transactions.filter((t) => t.type === 'expense').forEach((t) => {
    const cat = (t as any).category;
    const key = String(t.categoryId ?? 0);
    if (!catMap[key]) catMap[key] = { name: cat?.name ?? 'Other', icon: cat?.icon ?? '📌', total: 0 };
    catMap[key].total += toBaseCurrency(t.amount, t.currency, currency, rate);
  });

  const cats = Object.values(catMap).sort((a, b) => b.total - a.total);
  if (cats.length > 0) {
    msg += `*💸 Expenses by Category:*\n`;
    cats.forEach((c) => {
      msg += `${c.icon} ${c.name}: ${fmtAmount(c.total, currency)}\n`;
    });
    msg += '\n';
  }

  msg += `💰 Total Income: ${fmtAmount(totalIncome, currency)}\n`;
  msg += `💸 Total Expenses: ${fmtAmount(totalExpenses, currency)}\n`;
  msg += `💹 Savings: ${fmtAmount(totalIncome - totalExpenses, currency)}`;
  return msg;
}

async function generateMonthlyReport(prisma: PrismaClient, userId: number, tz: string, currency: string, rate: number) {
  const { totalIncome, totalExpenses } = await getSummary(prisma, userId, 'monthly', tz, currency, rate);
  const now = dayjs().tz(tz);

  const prevStart = now.subtract(1, 'month').startOf('month').toDate();
  const prevEnd = now.subtract(1, 'month').endOf('month').toDate();
  const prevTxns = await prisma.transaction.findMany({
    where: { userId, transactionDate: { gte: prevStart, lte: prevEnd } },
  });
  const prevIncome = prevTxns.filter((t) => t.type === 'income').reduce((s, t) => s + toBaseCurrency(t.amount, t.currency, currency, rate), 0);
  const prevExpenses = prevTxns.filter((t) => t.type === 'expense').reduce((s, t) => s + toBaseCurrency(t.amount, t.currency, currency, rate), 0);

  const savings = totalIncome - totalExpenses;
  const savingsRate = totalIncome > 0 ? (savings / totalIncome) * 100 : 0;
  const incomeChange = prevIncome > 0 ? ((totalIncome - prevIncome) / prevIncome) * 100 : 0;
  const expenseChange = prevExpenses > 0 ? ((totalExpenses - prevExpenses) / prevExpenses) * 100 : 0;

  const month = now.format('MMMM YYYY');
  let msg = `📊 *Monthly Report — ${month}*\n`;
  msg += `_All amounts in ${currency} (rate: 1 USD = ${Math.round(rate)} ៛)_\n\n`;
  msg += `💰 Income: ${fmtAmount(totalIncome, currency)} (${incomeChange >= 0 ? '+' : ''}${incomeChange.toFixed(1)}% vs last)\n`;
  msg += `💸 Expenses: ${fmtAmount(totalExpenses, currency)} (${expenseChange >= 0 ? '+' : ''}${expenseChange.toFixed(1)}% vs last)\n`;
  msg += `💹 Savings: ${fmtAmount(savings, currency)}\n`;
  msg += `📈 Savings Rate: ${savingsRate.toFixed(1)}%`;
  return msg;
}

async function generateQuarterlyReport(prisma: PrismaClient, userId: number, tz: string, currency: string, rate: number) {
  const { totalIncome, totalExpenses } = await getSummary(prisma, userId, 'quarterly', tz, currency, rate);
  const now = dayjs().tz(tz);
  const q = Math.floor(now.month() / 3) + 1;

  let msg = `📊 *Q${q} ${now.year()} Report*\n`;
  msg += `_All amounts in ${currency}_\n\n`;
  msg += `💰 Total Income: ${fmtAmount(totalIncome, currency)}\n`;
  msg += `💸 Total Expenses: ${fmtAmount(totalExpenses, currency)}\n`;
  msg += `💹 Net: ${fmtAmount(totalIncome - totalExpenses, currency)}\n`;
  msg += `📅 Monthly Average: ${fmtAmount(totalExpenses / 3, currency)}`;
  return msg;
}

async function generateYearlyReport(prisma: PrismaClient, userId: number, tz: string, currency: string, rate: number) {
  const { totalIncome, totalExpenses } = await getSummary(prisma, userId, 'yearly', tz, currency, rate);
  const year = dayjs().tz(tz).year();
  const savings = totalIncome - totalExpenses;
  const savingsRate = totalIncome > 0 ? (savings / totalIncome) * 100 : 0;

  let msg = `📊 *Yearly Report — ${year}*\n`;
  msg += `_All amounts in ${currency}_\n\n`;
  msg += `💰 Annual Income: ${fmtAmount(totalIncome, currency)}\n`;
  msg += `💸 Annual Expenses: ${fmtAmount(totalExpenses, currency)}\n`;
  msg += `💹 Annual Savings: ${fmtAmount(savings, currency)}\n`;
  msg += `📈 Savings Rate: ${savingsRate.toFixed(1)}%\n`;
  msg += `📅 Monthly Average: ${fmtAmount(totalExpenses / 12, currency)}`;
  return msg;
}

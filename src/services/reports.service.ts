import { PrismaClient } from '@prisma/client';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { getSummary, getDateRange } from './transactions.service';

dayjs.extend(utc);
dayjs.extend(timezone);

export async function generateReport(
  prisma: PrismaClient,
  userId: number,
  period: string,
  tz: string,
  currency: string,
): Promise<string> {
  switch (period) {
    case 'daily': return generateDailyReport(prisma, userId, tz, currency);
    case 'weekly': return generateWeeklyReport(prisma, userId, tz, currency);
    case 'monthly': return generateMonthlyReport(prisma, userId, tz, currency);
    case 'quarterly': return generateQuarterlyReport(prisma, userId, tz, currency);
    case 'yearly': return generateYearlyReport(prisma, userId, tz, currency);
    default: return '❌ Unknown period';
  }
}

async function generateDailyReport(prisma: PrismaClient, userId: number, tz: string, currency: string) {
  const { transactions, totalIncome, totalExpenses, netBalance } = await getSummary(prisma, userId, 'daily', tz);
  const date = dayjs().tz(tz).format('DD MMM YYYY');

  let msg = `📊 *Daily Report — ${date}*\n\n`;

  const incomes = transactions.filter((t) => t.type === 'income');
  const expenses = transactions.filter((t) => t.type === 'expense');

  if (incomes.length > 0) {
    msg += `*💰 Income:*\n`;
    incomes.forEach((t) => {
      msg += `${(t as any).category?.icon ?? ''} ${currency} ${Number(t.amount).toFixed(2)}${t.note ? ` — ${t.note}` : ''}\n`;
    });
    msg += `Total: ${currency} ${totalIncome.toFixed(2)}\n\n`;
  }

  if (expenses.length > 0) {
    msg += `*💸 Expenses:*\n`;
    expenses.forEach((t) => {
      msg += `${(t as any).category?.icon ?? ''} ${currency} ${Number(t.amount).toFixed(2)}${t.note ? ` — ${t.note}` : ''}\n`;
    });
    msg += `Total: ${currency} ${totalExpenses.toFixed(2)}\n\n`;
  }

  if (transactions.length === 0) msg += '_No transactions today_\n\n';

  const netIcon = netBalance >= 0 ? '📈' : '📉';
  msg += `${netIcon} *Net Balance: ${currency} ${netBalance.toFixed(2)}*`;
  return msg;
}

async function generateWeeklyReport(prisma: PrismaClient, userId: number, tz: string, currency: string) {
  const { transactions, totalIncome, totalExpenses } = await getSummary(prisma, userId, 'weekly', tz);
  const now = dayjs().tz(tz);
  const weekStart = now.startOf('week').format('DD MMM');
  const weekEnd = now.endOf('week').format('DD MMM YYYY');

  let msg = `📊 *Weekly Report — ${weekStart} to ${weekEnd}*\n\n`;

  // Category breakdown for expenses
  const catMap: Record<string, { name: string; icon: string; total: number }> = {};
  transactions.filter((t) => t.type === 'expense').forEach((t) => {
    const cat = (t as any).category;
    const key = String(t.categoryId ?? 0);
    if (!catMap[key]) catMap[key] = { name: cat?.name ?? 'Other', icon: cat?.icon ?? '📌', total: 0 };
    catMap[key].total += Number(t.amount);
  });

  const cats = Object.values(catMap).sort((a, b) => b.total - a.total);
  if (cats.length > 0) {
    msg += `*💸 Expenses by Category:*\n`;
    cats.forEach((c) => {
      msg += `${c.icon} ${c.name}: ${currency} ${c.total.toFixed(2)}\n`;
    });
    msg += '\n';
  }

  msg += `💰 Total Income: ${currency} ${totalIncome.toFixed(2)}\n`;
  msg += `💸 Total Expenses: ${currency} ${totalExpenses.toFixed(2)}\n`;
  msg += `💹 Savings: ${currency} ${(totalIncome - totalExpenses).toFixed(2)}`;
  return msg;
}

async function generateMonthlyReport(prisma: PrismaClient, userId: number, tz: string, currency: string) {
  const { totalIncome, totalExpenses } = await getSummary(prisma, userId, 'monthly', tz);
  const now = dayjs().tz(tz);

  // Previous month
  const prevStart = now.subtract(1, 'month').startOf('month').toDate();
  const prevEnd = now.subtract(1, 'month').endOf('month').toDate();
  const prevTxns = await prisma.transaction.findMany({
    where: { userId, transactionDate: { gte: prevStart, lte: prevEnd } },
  });
  const prevIncome = prevTxns.filter((t) => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
  const prevExpenses = prevTxns.filter((t) => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);

  const savings = totalIncome - totalExpenses;
  const savingsRate = totalIncome > 0 ? (savings / totalIncome) * 100 : 0;

  const incomeChange = prevIncome > 0 ? ((totalIncome - prevIncome) / prevIncome) * 100 : 0;
  const expenseChange = prevExpenses > 0 ? ((totalExpenses - prevExpenses) / prevExpenses) * 100 : 0;

  const month = now.format('MMMM YYYY');
  let msg = `📊 *Monthly Report — ${month}*\n\n`;
  msg += `💰 Income: ${currency} ${totalIncome.toFixed(2)} (${incomeChange >= 0 ? '+' : ''}${incomeChange.toFixed(1)}% vs last)\n`;
  msg += `💸 Expenses: ${currency} ${totalExpenses.toFixed(2)} (${expenseChange >= 0 ? '+' : ''}${expenseChange.toFixed(1)}% vs last)\n`;
  msg += `💹 Savings: ${currency} ${savings.toFixed(2)}\n`;
  msg += `📈 Savings Rate: ${savingsRate.toFixed(1)}%`;
  return msg;
}

async function generateQuarterlyReport(prisma: PrismaClient, userId: number, tz: string, currency: string) {
  const { totalIncome, totalExpenses } = await getSummary(prisma, userId, 'quarterly', tz);
  const now = dayjs().tz(tz);
  const q = Math.floor(now.month() / 3) + 1;

  let msg = `📊 *Q${q} ${now.year()} Report*\n\n`;
  msg += `💰 Total Income: ${currency} ${totalIncome.toFixed(2)}\n`;
  msg += `💸 Total Expenses: ${currency} ${totalExpenses.toFixed(2)}\n`;
  msg += `💹 Net: ${currency} ${(totalIncome - totalExpenses).toFixed(2)}\n`;
  msg += `📅 Monthly Average Expenses: ${currency} ${(totalExpenses / 3).toFixed(2)}`;
  return msg;
}

async function generateYearlyReport(prisma: PrismaClient, userId: number, tz: string, currency: string) {
  const { totalIncome, totalExpenses } = await getSummary(prisma, userId, 'yearly', tz);
  const year = dayjs().tz(tz).year();
  const savings = totalIncome - totalExpenses;
  const savingsRate = totalIncome > 0 ? (savings / totalIncome) * 100 : 0;

  let msg = `📊 *Yearly Report — ${year}*\n\n`;
  msg += `💰 Annual Income: ${currency} ${totalIncome.toFixed(2)}\n`;
  msg += `💸 Annual Expenses: ${currency} ${totalExpenses.toFixed(2)}\n`;
  msg += `💹 Annual Savings: ${currency} ${savings.toFixed(2)}\n`;
  msg += `📈 Savings Rate: ${savingsRate.toFixed(1)}%\n`;
  msg += `📅 Monthly Average Expenses: ${currency} ${(totalExpenses / 12).toFixed(2)}`;
  return msg;
}

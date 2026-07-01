import { PrismaClient } from '@prisma/client';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

// KHR per 1 USD
export function toBaseCurrency(amount: number, txCurrency: string, baseCurrency: string, rate: number): number {
  if (txCurrency === baseCurrency) return amount;
  if (baseCurrency === 'USD' && txCurrency === 'KHR') return amount / rate;
  if (baseCurrency === 'KHR' && txCurrency === 'USD') return amount * rate;
  return amount;
}

export function fmtAmount(amount: number, currency: string): string {
  if (currency === 'KHR') return `${Math.round(amount).toLocaleString()} ៛`;
  return `${amount.toFixed(2)} ${currency}`;
}

export async function create(
  prisma: PrismaClient,
  data: {
    userId: number;
    type: 'income' | 'expense';
    amount: number;
    currency: string;
    categoryId?: number;
    note?: string;
    transactionDate: Date;
  },
) {
  return prisma.transaction.create({
    data,
    include: { category: true },
  });
}

export function getDateRange(period: string, tz: string): { start: Date; end: Date } {
  const now = dayjs().tz(tz);
  switch (period) {
    case 'daily':
      return { start: now.startOf('day').toDate(), end: now.endOf('day').toDate() };
    case 'weekly':
      return { start: now.startOf('week').toDate(), end: now.endOf('week').toDate() };
    case 'monthly':
      return { start: now.startOf('month').toDate(), end: now.endOf('month').toDate() };
    case 'quarterly': {
      const q = Math.floor(now.month() / 3);
      const start = now.month(q * 3).startOf('month');
      const end = now.month(q * 3 + 2).endOf('month');
      return { start: start.toDate(), end: end.toDate() };
    }
    case 'yearly':
      return { start: now.startOf('year').toDate(), end: now.endOf('year').toDate() };
    default:
      return { start: now.startOf('month').toDate(), end: now.endOf('month').toDate() };
  }
}

export async function getSummary(
  prisma: PrismaClient,
  userId: number,
  period: string,
  tz: string,
  baseCurrency: string = 'USD',
  exchangeRate: number = 4100,
) {
  const { start, end } = getDateRange(period, tz);
  const transactions = await prisma.transaction.findMany({
    where: { userId, transactionDate: { gte: start, lte: end } },
    include: { category: true },
    orderBy: { transactionDate: 'desc' },
  });

  const totalIncome = transactions
    .filter((t) => t.type === 'income')
    .reduce((s, t) => s + toBaseCurrency(t.amount, t.currency, baseCurrency, exchangeRate), 0);
  const totalExpenses = transactions
    .filter((t) => t.type === 'expense')
    .reduce((s, t) => s + toBaseCurrency(t.amount, t.currency, baseCurrency, exchangeRate), 0);

  return { transactions, totalIncome, totalExpenses, netBalance: totalIncome - totalExpenses };
}

export async function getMonthlySpentByCategory(
  prisma: PrismaClient,
  userId: number,
  categoryId: number,
  period: string = 'monthly',
  baseCurrency: string = 'USD',
  exchangeRate: number = 4100,
) {
  const { start, end } = getDateRange(period, 'UTC');
  const txns = await prisma.transaction.findMany({
    where: { userId, categoryId, type: 'expense', transactionDate: { gte: start, lte: end } },
  });
  return txns.reduce((s, t) => s + toBaseCurrency(t.amount, t.currency, baseCurrency, exchangeRate), 0);
}

export async function search(prisma: PrismaClient, userId: number, query: string) {
  const q = query.toLowerCase();

  const daysMatch = q.match(/last\s+(\d+)\s+days?/);
  if (daysMatch) {
    const days = parseInt(daysMatch[1]);
    const start = dayjs().subtract(days, 'day').toDate();
    return prisma.transaction.findMany({
      where: { userId, transactionDate: { gte: start } },
      include: { category: true },
      orderBy: { transactionDate: 'desc' },
      take: 20,
    });
  }

  const amountMatch = q.match(/amount\s*([<>])\s*(\d+(?:\.\d+)?)/);
  if (amountMatch) {
    const op = amountMatch[1];
    const val = parseFloat(amountMatch[2]);
    return prisma.transaction.findMany({
      where: { userId, amount: op === '>' ? { gt: val } : { lt: val } },
      include: { category: true },
      orderBy: { transactionDate: 'desc' },
      take: 20,
    });
  }

  return prisma.transaction.findMany({
    where: { userId, note: { contains: query } },
    include: { category: true },
    orderBy: { transactionDate: 'desc' },
    take: 20,
  });
}

export async function getStats(prisma: PrismaClient, userId: number, tz: string, baseCurrency: string = 'USD', exchangeRate: number = 4100) {
  const totalTransactions = await prisma.transaction.count({ where: { userId } });

  const firstTx = await prisma.transaction.findFirst({
    where: { userId },
    orderBy: { transactionDate: 'asc' },
  });

  // Fetch all transactions with categories — do currency conversion in JS
  const allTxns = await prisma.transaction.findMany({
    where: { userId },
    include: { category: true },
  });

  const expenses = allTxns.filter((t) => t.type === 'expense');
  const incomes  = allTxns.filter((t) => t.type === 'income');

  const totalExpenses = expenses.reduce((s, t) => s + toBaseCurrency(Number(t.amount), t.currency, baseCurrency, exchangeRate), 0);
  const totalIncome   = incomes.reduce((s, t)  => s + toBaseCurrency(Number(t.amount), t.currency, baseCurrency, exchangeRate), 0);

  const daysSinceFirst   = firstTx ? Math.max(1, dayjs().diff(dayjs(firstTx.transactionDate), 'day')) : 1;
  const monthsSinceFirst = Math.max(1, daysSinceFirst / 30);

  // Highest expense: compare after converting to base currency
  const highestExpense = expenses.reduce((max: any, t) => {
    const tBase = toBaseCurrency(Number(t.amount), t.currency, baseCurrency, exchangeRate);
    const mBase = max ? toBaseCurrency(Number(max.amount), max.currency, baseCurrency, exchangeRate) : -1;
    return tBase > mBase ? t : max;
  }, null);

  // Top categories: group manually with currency-converted totals
  const catMap = new Map<string, { name: string; icon: string; total: number }>();
  for (const t of expenses) {
    const key  = String(t.categoryId ?? 'none');
    const base = toBaseCurrency(Number(t.amount), t.currency, baseCurrency, exchangeRate);
    if (!catMap.has(key)) {
      catMap.set(key, {
        name:  (t as any).category?.name ?? 'Other',
        icon:  (t as any).category?.icon ?? '📌',
        total: 0,
      });
    }
    catMap.get(key)!.total += base;
  }
  const topCategories = [...catMap.values()]
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  const savingsRate = totalIncome > 0 ? ((totalIncome - totalExpenses) / totalIncome) * 100 : 0;

  return {
    totalTransactions,
    avgDailySpending:  totalExpenses / daysSinceFirst,
    avgMonthlyIncome:  totalIncome / monthsSinceFirst,
    highestExpense,
    topCategories,
    savingsRate,
  };
}

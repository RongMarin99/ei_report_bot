import { PrismaClient } from '@prisma/client';
import dayjs from 'dayjs';

export function computeNextDate(frequency: string, from: Date = new Date()): Date {
  const d = dayjs(from);
  switch (frequency) {
    case 'daily': return d.add(1, 'day').toDate();
    case 'weekly': return d.add(1, 'week').toDate();
    case 'monthly': return d.add(1, 'month').toDate();
    case 'quarterly': return d.add(3, 'month').toDate();
    case 'yearly': return d.add(1, 'year').toDate();
    default: return d.add(1, 'month').toDate();
  }
}

export async function create(
  prisma: PrismaClient,
  data: {
    userId: number;
    type: 'income' | 'expense';
    amount: number;
    categoryId?: number;
    frequency: string;
  },
) {
  return prisma.recurringTransaction.create({
    data: {
      ...data,
      nextExecution: computeNextDate(data.frequency),
      enabled: true,
    },
    include: { category: true },
  });
}

export async function findByUser(prisma: PrismaClient, userId: number) {
  return prisma.recurringTransaction.findMany({
    where: { userId },
    include: { category: true },
    orderBy: { nextExecution: 'asc' },
  });
}

export async function toggle(prisma: PrismaClient, id: number, userId: number) {
  const rec = await prisma.recurringTransaction.findFirst({ where: { id, userId } });
  if (!rec) throw new Error('Recurring transaction not found.');
  return prisma.recurringTransaction.update({ where: { id }, data: { enabled: !rec.enabled } });
}

export async function remove(prisma: PrismaClient, id: number, userId: number) {
  await prisma.recurringTransaction.deleteMany({ where: { id, userId } });
}

export async function getDue(prisma: PrismaClient) {
  return prisma.recurringTransaction.findMany({
    where: { enabled: true, nextExecution: { lte: new Date() } },
    include: { user: true, category: true },
  });
}

export async function markExecuted(prisma: PrismaClient, id: number, frequency: string) {
  return prisma.recurringTransaction.update({
    where: { id },
    data: { nextExecution: computeNextDate(frequency) },
  });
}

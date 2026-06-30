import { PrismaClient } from '@prisma/client';
import { computeNextDate } from './recurring.service';

export async function create(
  prisma: PrismaClient,
  data: {
    userId: number;
    title: string;
    amount?: number;
    frequency: string;
  },
) {
  return prisma.reminder.create({
    data: {
      ...data,
      nextExecution: computeNextDate(data.frequency),
      enabled: true,
    },
  });
}

export async function findByUser(prisma: PrismaClient, userId: number) {
  return prisma.reminder.findMany({
    where: { userId },
    orderBy: { nextExecution: 'asc' },
  });
}

export async function remove(prisma: PrismaClient, id: number, userId: number) {
  await prisma.reminder.deleteMany({ where: { id, userId } });
}

export async function getDue(prisma: PrismaClient) {
  return prisma.reminder.findMany({
    where: { enabled: true, nextExecution: { lte: new Date() } },
    include: { user: true },
  });
}

export async function markSent(prisma: PrismaClient, id: number, frequency: string) {
  return prisma.reminder.update({
    where: { id },
    data: { nextExecution: computeNextDate(frequency) },
  });
}

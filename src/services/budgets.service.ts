import { PrismaClient } from '@prisma/client';

export async function upsertBudget(
  prisma: PrismaClient,
  userId: number,
  categoryId: number,
  amount: number,
  period: 'monthly' | 'weekly',
) {
  return prisma.budget.upsert({
    where: { userId_categoryId_period: { userId, categoryId, period } },
    create: { userId, categoryId, amount, period },
    update: { amount },
    include: { category: true },
  });
}

export async function getUserBudgets(prisma: PrismaClient, userId: number) {
  return prisma.budget.findMany({
    where: { userId },
    include: { category: true },
    orderBy: { createdAt: 'asc' },
  });
}

export async function getBudgetForCategory(
  prisma: PrismaClient,
  userId: number,
  categoryId: number,
  period: string = 'monthly',
) {
  return prisma.budget.findFirst({
    where: { userId, categoryId, period },
  });
}

export async function deleteBudget(
  prisma: PrismaClient,
  userId: number,
  categoryId: number,
  period: string,
) {
  await prisma.budget.deleteMany({
    where: { userId, categoryId, period },
  });
}

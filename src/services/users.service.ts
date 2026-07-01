import { PrismaClient } from '@prisma/client';

export async function findByTelegramId(prisma: PrismaClient, telegramId: bigint) {
  return prisma.user.findUnique({ where: { telegramId } });
}

export async function createUser(
  prisma: PrismaClient,
  data: {
    telegramId: bigint;
    username?: string;
    firstName?: string;
    currency: string;
    timezone: string;
    language: string;
  },
) {
  return prisma.user.create({ data });
}

export async function updateUser(
  prisma: PrismaClient,
  userId: number,
  data: Partial<{ currency: string; timezone: string; language: string; exchangeRate: number }>,
) {
  return prisma.user.update({ where: { id: userId }, data });
}

export async function getOrCreateReportSettings(prisma: PrismaClient, userId: number, timezone = 'UTC') {
  return prisma.reportSettings.upsert({
    where: { userId },
    create: { userId, timezone },
    update: {},
  });
}

export async function updateReportSettings(
  prisma: PrismaClient,
  userId: number,
  data: Partial<{
    dailyEnabled: boolean;
    weeklyEnabled: boolean;
    monthlyEnabled: boolean;
    quarterlyEnabled: boolean;
    yearlyEnabled: boolean;
    sendTime: string;
    timezone: string;
  }>,
) {
  return prisma.reportSettings.upsert({
    where: { userId },
    create: { userId, timezone: 'UTC', ...data },
    update: data,
  });
}

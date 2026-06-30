import { PrismaClient } from '@prisma/client';

export type ConvStep =
  | 'expense:amount'
  | 'expense:desc'
  | 'income:amount'
  | 'income:desc'
  | 'search:note'
  | 'search:amount_gt'
  | 'search:amount_lt';

export interface ConvData {
  amount?: number;
  currency?: string;
  type?: 'expense' | 'income';
  toDelete?: number[]; // message IDs to clean up on complete/cancel
}

export async function getConv(prisma: PrismaClient, userId: number) {
  const row = await (prisma as any).conversation.findUnique({ where: { userId } });
  if (!row) return null;
  return { step: row.step as ConvStep, data: JSON.parse(row.data) as ConvData };
}

export async function setConv(prisma: PrismaClient, userId: number, step: ConvStep, data: ConvData = {}) {
  return (prisma as any).conversation.upsert({
    where: { userId },
    create: { userId, step, data: JSON.stringify(data) },
    update: { step, data: JSON.stringify(data) },
  });
}

export async function clearConv(prisma: PrismaClient, userId: number) {
  return (prisma as any).conversation.deleteMany({ where: { userId } });
}

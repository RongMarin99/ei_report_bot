import { PrismaClient } from '@prisma/client';

export async function exportTransactions(
  prisma: PrismaClient,
  userId: number,
  format: 'csv' | 'xlsx' | 'pdf',
): Promise<{ buffer: Buffer; filename: string; mimeType: string }> {
  const transactions = await prisma.transaction.findMany({
    where: { userId },
    include: { category: true },
    orderBy: { transactionDate: 'desc' },
  });

  const date = new Date().toISOString().split('T')[0];
  const rows = transactions.map((t) => ({
    Date: new Date(t.transactionDate).toLocaleDateString(),
    Type: t.type,
    Category: (t as any).category?.name ?? 'Other',
    Amount: t.amount.toFixed(2),
    Currency: t.currency,
    Note: t.note ?? '',
  }));

  const headers = ['Date', 'Type', 'Category', 'Amount', 'Currency', 'Note'];
  const csvLines = [
    headers.join(','),
    ...rows.map((r) =>
      headers.map((h) => `"${String(r[h as keyof typeof r]).replace(/"/g, '""')}"`).join(','),
    ),
  ];
  const buffer = Buffer.from(csvLines.join('\n'), 'utf-8');

  if (format === 'xlsx') {
    return { buffer, filename: `ei-bot-${date}.csv`, mimeType: 'text/csv' };
  }
  if (format === 'pdf') {
    return { buffer, filename: `ei-bot-${date}.csv`, mimeType: 'text/csv' };
  }

  return { buffer, filename: `ei-bot-${date}.csv`, mimeType: 'text/csv' };
}

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEFAULT_EXPENSE_CATEGORIES = [
  { name: 'Food', icon: '🍔', type: 'expense' },
  { name: 'Transport', icon: '🚗', type: 'expense' },
  { name: 'Shopping', icon: '🛍️', type: 'expense' },
  { name: 'Rent', icon: '🏠', type: 'expense' },
  { name: 'Bills', icon: '📝', type: 'expense' },
  { name: 'Entertainment', icon: '🎬', type: 'expense' },
  { name: 'Health', icon: '💊', type: 'expense' },
  { name: 'Education', icon: '📚', type: 'expense' },
  { name: 'Travel', icon: '✈️', type: 'expense' },
  { name: 'Family', icon: '👨‍👩‍👧', type: 'expense' },
  { name: 'Other', icon: '📌', type: 'expense' },
];

const DEFAULT_INCOME_CATEGORIES = [
  { name: 'Salary', icon: '💼', type: 'income' },
  { name: 'Freelance', icon: '💻', type: 'income' },
  { name: 'Investment', icon: '📈', type: 'income' },
  { name: 'Business', icon: '🏢', type: 'income' },
  { name: 'Bonus', icon: '🎁', type: 'income' },
  { name: 'Gift', icon: '🎀', type: 'income' },
  { name: 'Other', icon: '📌', type: 'income' },
];

async function main() {
  const all = [...DEFAULT_EXPENSE_CATEGORIES, ...DEFAULT_INCOME_CATEGORIES];
  for (const c of all) {
    await prisma.category.create({
      data: { ...c, userId: null, isDefault: true },
    }).catch(() => null);
  }
  console.log(`Seeded ${all.length} default categories`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

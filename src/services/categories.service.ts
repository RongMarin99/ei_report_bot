import { PrismaClient } from '@prisma/client';

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

export async function seedDefaultCategories(prisma: PrismaClient, userId: number) {
  const all = [...DEFAULT_EXPENSE_CATEGORIES, ...DEFAULT_INCOME_CATEGORIES];
  for (const c of all) {
    await prisma.category.upsert({
      where: { id: -1 } as any,
      create: { ...c, userId, isDefault: true },
      update: {},
    }).catch(() => {
      return prisma.category.create({ data: { ...c, userId, isDefault: true } }).catch(() => null);
    });
  }
}

export async function getUserCategories(prisma: PrismaClient, userId: number) {
  return prisma.category.findMany({
    where: { OR: [{ userId }, { isDefault: true, userId: null }] },
    orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
  });
}

export async function findBestMatch(
  prisma: PrismaClient,
  userId: number,
  query: string,
  type: 'income' | 'expense',
) {
  if (!query) return null;

  const categories = await getUserCategories(prisma, userId);
  const filtered = categories.filter((c) => c.type === type);
  const q = query.toLowerCase();

  const exact = filtered.find((c) => c.name.toLowerCase() === q);
  if (exact) return exact;

  const partial = filtered.find(
    (c) => c.name.toLowerCase().includes(q) || q.includes(c.name.toLowerCase()),
  );
  if (partial) return partial;

  const keywords: Record<string, string> = {
    coffee: 'Food', lunch: 'Food', dinner: 'Food', breakfast: 'Food', food: 'Food', eat: 'Food',
    taxi: 'Transport', grab: 'Transport', bus: 'Transport', fuel: 'Transport', gas: 'Transport',
    salary: 'Salary', wage: 'Salary', pay: 'Salary',
    freelance: 'Freelance', project: 'Freelance',
    rent: 'Rent', house: 'Rent',
    electric: 'Bills', water: 'Bills', internet: 'Bills', phone: 'Bills', bill: 'Bills',
    movie: 'Entertainment', netflix: 'Entertainment', game: 'Entertainment',
    doctor: 'Health', medicine: 'Health', hospital: 'Health', pharmacy: 'Health',
    shopping: 'Shopping', clothes: 'Shopping', shop: 'Shopping',
  };

  for (const [kw, catName] of Object.entries(keywords)) {
    if (q.includes(kw)) {
      const matched = filtered.find((c) => c.name === catName);
      if (matched) return matched;
    }
  }

  return filtered.find((c) => c.name === 'Other') ?? null;
}

export async function createUserCategory(
  prisma: PrismaClient,
  userId: number,
  name: string,
  type: 'income' | 'expense',
) {
  const existing = await prisma.category.findFirst({
    where: { userId, name },
  });
  if (existing) throw new Error(`Category "${name}" already exists.`);

  return prisma.category.create({
    data: { userId, name, type, isDefault: false },
  });
}

export async function deleteUserCategory(prisma: PrismaClient, userId: number, categoryId: number) {
  await prisma.category.delete({ where: { id: categoryId, userId } });
}

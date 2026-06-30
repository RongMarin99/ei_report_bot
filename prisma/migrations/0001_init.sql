CREATE TABLE IF NOT EXISTS "users" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "telegram_id" BIGINT NOT NULL,
  "username" TEXT,
  "first_name" TEXT,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "timezone" TEXT NOT NULL DEFAULT 'UTC',
  "language" TEXT NOT NULL DEFAULT 'en',
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "users_telegram_id_key" ON "users"("telegram_id");

CREATE TABLE IF NOT EXISTS "categories" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "user_id" INTEGER,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "icon" TEXT,
  "is_default" BOOLEAN NOT NULL DEFAULT FALSE,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "transactions" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "user_id" INTEGER NOT NULL,
  "type" TEXT NOT NULL,
  "amount" REAL NOT NULL,
  "currency" TEXT NOT NULL,
  "category_id" INTEGER,
  "note" TEXT,
  "transaction_date" DATETIME NOT NULL,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
  FOREIGN KEY ("category_id") REFERENCES "categories"("id")
);

CREATE TABLE IF NOT EXISTS "budgets" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "user_id" INTEGER NOT NULL,
  "category_id" INTEGER,
  "amount" REAL NOT NULL,
  "period" TEXT NOT NULL,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
  FOREIGN KEY ("category_id") REFERENCES "categories"("id"),
  UNIQUE ("user_id", "category_id", "period")
);

CREATE TABLE IF NOT EXISTS "report_settings" (
  "user_id" INTEGER NOT NULL UNIQUE,
  "daily_enabled" BOOLEAN NOT NULL DEFAULT FALSE,
  "weekly_enabled" BOOLEAN NOT NULL DEFAULT FALSE,
  "monthly_enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "quarterly_enabled" BOOLEAN NOT NULL DEFAULT FALSE,
  "yearly_enabled" BOOLEAN NOT NULL DEFAULT FALSE,
  "send_time" TEXT NOT NULL DEFAULT '22:00',
  "timezone" TEXT NOT NULL DEFAULT 'UTC',
  "updated_at" DATETIME NOT NULL,
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "reminders" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "user_id" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "amount" REAL,
  "frequency" TEXT NOT NULL,
  "next_execution" DATETIME NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "recurring_transactions" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "user_id" INTEGER NOT NULL,
  "type" TEXT NOT NULL,
  "amount" REAL NOT NULL,
  "category_id" INTEGER,
  "frequency" TEXT NOT NULL,
  "next_execution" DATETIME NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
  FOREIGN KEY ("category_id") REFERENCES "categories"("id")
);

# CLAUDE.md

# Project: Telegram Personal Expense & Income Tracker Bot

## Overview

Build a Telegram bot that allows individual users to track their personal income and expenses, receive automated reports, manage budgets, and gain financial insights.

The system must be user-centric: each Telegram account owns and accesses only its own financial data.

---

# Core Requirements

## User Management

### Registration Flow

When a user starts the bot:

```text
/start
```

The bot should guide users through:

* Selecting preferred currency (USD, KHR, THB, EUR, etc.)
* Setting timezone
* Choosing language
* Enabling/disabling automatic reports

Store:

```sql
users
------
id
telegram_id
username
first_name
currency
timezone
language
created_at
updated_at
```

---

# Transactions

## Income

Examples:

```text
/income 500 salary
/income 50 freelance
/income 100 bonus
```

Expected behavior:

* Save transaction
* Categorize income
* Confirm successful insertion

---

## Expenses

Examples:

```text
/expense 5 coffee
/expense 120 groceries
/expense 20 transport
```

Expected behavior:

* Save transaction
* Match category
* Update budget status
* Return remaining budget information if available

---

## Natural Language Input (Future Enhancement)

The bot should eventually support:

```text
Spent 15 on lunch
Paid 10 for coffee
Received 1000 salary
Got 50 from freelance work
```

The parser should determine:

```json
{
  "type": "expense",
  "amount": 15,
  "category": "food"
}
```

---

# Categories

## Default Expense Categories

* Food
* Transport
* Shopping
* Rent
* Bills
* Entertainment
* Health
* Education
* Travel
* Family
* Other

## Default Income Categories

* Salary
* Freelance
* Investment
* Business
* Bonus
* Gift
* Other

Users can create custom categories:

```text
/category add Gaming
/category add Pets
```

---

# Reports

The bot must support both manual and automatic reports.

---

## Manual Reports

Commands:

```text
/report daily
/report weekly
/report monthly
/report quarterly
/report yearly
```

---

## Report Types

### Daily Report

Include:

* Income transactions
* Expense transactions
* Total income
* Total expenses
* Net balance

---

### Weekly Report

Include:

* Category summaries
* Total spending
* Total income
* Savings amount

---

### Monthly Report

Include:

* Monthly income
* Monthly expenses
* Savings rate
* Largest expense category
* Comparison with previous month

---

### Quarterly Report

Include:

* Total quarterly income
* Total quarterly expenses
* Monthly averages
* Best and worst spending months

---

### Yearly Report

Include:

* Annual income
* Annual expenses
* Savings rate
* Top categories
* Spending trends

---

# Automatic Reports

Users can configure:

```text
/settings reports
```

Options:

* Daily
* Weekly
* Monthly
* Quarterly
* Yearly

Each report type can be:

* Enabled
* Disabled
* Scheduled for a specific time

Store:

```sql
report_settings
---------------
user_id
daily_enabled
weekly_enabled
monthly_enabled
quarterly_enabled
yearly_enabled
send_time
timezone
updated_at
```

---

# Cron Jobs

The system must execute scheduled jobs.

---

## Daily Reports

Run every hour:

```cron
0 * * * *
```

Check user timezone and preferred reporting time.

---

## Weekly Reports

```cron
0 22 * * 0
```

---

## Monthly Reports

```cron
0 22 1 * *
```

---

## Quarterly Reports

```cron
0 22 1 1,4,7,10 *
```

---

## Yearly Reports

```cron
0 22 1 1 *
```

---

# Budget Management

Users can set budgets.

Examples:

```text
/budget set food 500 monthly
```

---

## Features

Support:

* Monthly budgets
* Weekly budgets
* Category-specific budgets

Notifications:

* 50% used
* 80% used
* 90% used
* 100% exceeded

---

# Recurring Transactions

Examples:

```text
/recurring add salary 1000 monthly
/recurring add rent 300 monthly
/recurring add netflix 12 monthly
```

The system should automatically create transactions when due.

Store:

```sql
recurring_transactions
----------------------
id
user_id
type
amount
category_id
frequency
next_execution
enabled
created_at
```

Supported frequencies:

* Daily
* Weekly
* Monthly
* Quarterly
* Yearly

---

# Reminders

Users can create reminders:

```text
/remind rent 500 monthly
```

Examples:

* Rent payments
* Loan payments
* Utility bills
* Subscription renewals

---

# Search Features

Examples:

```text
/search coffee

/search category food

/search amount > 100

/search last 30 days
```

Filters:

* Date ranges
* Categories
* Amounts
* Transaction types

---

# Export Features

Users can export data.

Supported formats:

```text
/export csv
/export xlsx
/export pdf
```

---

# Statistics Dashboard

Command:

```text
/stats
```

Display:

* Total transactions
* Average daily spending
* Average monthly income
* Highest expense
* Top categories
* Savings rate

---

# Multi-Currency Support

Supported currencies:

* USD
* KHR
* THB
* EUR
* GBP

Requirements:

* Store original currency
* Store converted base value
* Allow future exchange-rate integrations

---

# Financial Insights (Phase 2)

Examples:

* Spending increased by 20% compared to last month
* Food expenses are above average
* Netflix appears to be a recurring subscription
* Estimated next month's spending

These insights should be generated automatically.

---

# Database Schema

---

## Users

```sql
users
------
id
telegram_id
username
first_name
currency
timezone
language
created_at
updated_at
```

---

## Transactions

```sql
transactions
-------------
id
user_id
type
amount
currency
category_id
note
transaction_date
created_at
```

---

## Categories

```sql
categories
-----------
id
user_id
name
type
icon
is_default
created_at
```

---

## Budgets

```sql
budgets
--------
id
user_id
category_id
amount
period
created_at
```

---

## Report Settings

```sql
report_settings
---------------
user_id
daily_enabled
weekly_enabled
monthly_enabled
quarterly_enabled
yearly_enabled
send_time
timezone
```

---

## Reminders

```sql
reminders
----------
id
user_id
title
amount
frequency
next_execution
enabled
created_at
```

---

## Recurring Transactions

```sql
recurring_transactions
----------------------
id
user_id
type
amount
category_id
frequency
next_execution
enabled
created_at
```

---

# Technology Stack

## Backend

* Node.js
* TypeScript
* NestJS

---

## Telegram Integration

* Telegraf

---

## Database

* PostgreSQL

---

## ORM

* Prisma

---

## Queue System

* BullMQ
* Redis

---

## Scheduling

* NestJS Scheduler

---

## Infrastructure

* Docker
* Docker Compose
* VPS deployment

Future support:

* Kubernetes
* Horizontal scaling
* Multi-instance workers

---

# MVP Scope

Version 1 should include:

* User registration
* Income tracking
* Expense tracking
* Categories
* Budgets
* Daily reports
* Weekly reports
* Monthly reports
* Automatic scheduled reports
* Timezone support
* CSV export
* Recurring transactions
* Reminders

The following features belong to later phases:

* OCR receipt scanning
* AI financial insights
* Family accounts
* Investment tracking
* Bank integrations
* Google Sheets synchronization
* Voice-based expense entry

---

# Non-Functional Requirements

* Multi-user isolation
* Timezone-aware scheduling
* Idempotent cron execution
* Dockerized deployment
* Strong typing with TypeScript
* Clean Architecture principles
* Unit and integration tests
* Database migrations via Prisma
* Rate limiting for Telegram API usage
* Secure handling of user financial data

---

# Success Criteria

The bot should allow any Telegram user to:

1. Record income and expenses within seconds.
2. Receive automated financial summaries.
3. Monitor budgets effectively.
4. Export their financial history.
5. Understand spending behavior through analytics.
6. Maintain complete ownership and privacy of their personal financial data.

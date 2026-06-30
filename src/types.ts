import { Context } from 'grammy';
import { PrismaClient, User } from '@prisma/client';

export interface Env {
  BOT_TOKEN: string;
  DB: D1Database;
  NODE_ENV: string;
}

export interface BotContext extends Context {
  prisma: PrismaClient;
  env: Env;
  dbUser?: User;
}

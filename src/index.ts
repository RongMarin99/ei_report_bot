import { Hono } from 'hono';
import { Bot, webhookCallback } from 'grammy';
import { BotContext, Env } from './types';
import { createPrisma } from './db/prisma';
import { registerHandlers } from './bot/bot';
import { handleScheduled } from './scheduled/cron';

const app = new Hono<{ Bindings: Env }>();

app.get('/', (c) => c.json({ status: 'ok', bot: 'EI Bot' }));

app.post('/webhook', async (c) => {
  const env = c.env;
  const bot = new Bot<BotContext>(env.BOT_TOKEN);
  const prisma = createPrisma(env.DB);

  bot.use(async (ctx, next) => {
    ctx.prisma = prisma;
    ctx.env = env;
    await next();
  });

  registerHandlers(bot);

  const handleUpdate = webhookCallback(bot, 'hono');
  return handleUpdate(c);
});

export default {
  fetch: app.fetch,
  scheduled: handleScheduled,
};

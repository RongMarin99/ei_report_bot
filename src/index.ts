import { Hono } from 'hono';
import { Bot, webhookCallback } from 'grammy';
import { BotContext, Env } from './types';
import { createPrisma } from './db/prisma';
import { registerHandlers } from './bot/bot';
import { handleScheduled } from './scheduled/cron';

const app = new Hono<{ Bindings: Env }>();

app.get('/', (c) => c.json({ status: 'ok', bot: 'EI Bot' }));

app.get('/setup', async (c) => {
  const env = c.env;
  const origin = new URL(c.req.url).origin;
  const webhookUrl = `${origin}/webhook`;

  const res = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: webhookUrl, drop_pending_updates: true }),
  });
  const data = await res.json() as any;
  return c.json({ webhook_url: webhookUrl, telegram_response: data });
});

app.get('/webhook-info', async (c) => {
  const env = c.env;
  const res = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/getWebhookInfo`);
  return c.json(await res.json());
});

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

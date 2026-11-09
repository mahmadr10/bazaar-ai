import { handler, requireUser, HttpError } from '@/lib/auth';
import { runAgent } from '@/lib/agent';
import { config } from '@/lib/env';
import { rateLimit } from '@/lib/guards';

export const maxDuration = 60;

export const POST = handler(async (req: Request) => {
  const user = await requireUser(); // user id comes from the session, never from the AI
  if (!rateLimit(`chat:${user.id}`, config.chatPerMinute, 60_000)) {
    throw new HttpError(429, 'You are sending messages too fast. Please wait a moment.');
  }
  const { messages, context } = await req.json();
  if (!Array.isArray(messages) || !messages.length) throw new HttpError(400, 'No message.');
  const history = messages
    .filter((m: any) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map((m: any) => ({ role: m.role, content: m.content }));
  if (history[history.length - 1]?.role !== 'user') throw new HttpError(400, 'The last message must be from the user.');
  if (history[history.length - 1].content.length > 1000) throw new HttpError(400, 'Message is too long (max 1000 characters).');
  try {
    return Response.json(await runAgent(user.id, history, typeof context === 'string' ? context.slice(0, 800) : ''));
  } catch (err: any) {
    throw new HttpError(503, err.message);
  }
});

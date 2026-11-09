import { handler, requireUser, HttpError } from '@/lib/auth';
import { runAgent } from '@/lib/agent';

export const maxDuration = 60;

export const POST = handler(async (req: Request) => {
  const user = await requireUser(); // user id comes from the session, never from the AI
  const { messages, context } = await req.json();
  if (!Array.isArray(messages) || !messages.length) throw new HttpError(400, 'No message.');
  const history = messages
    .filter((m: any) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map((m: any) => ({ role: m.role, content: m.content }));
  try {
    return Response.json(await runAgent(user.id, history, typeof context === 'string' ? context.slice(0, 800) : ''));
  } catch (err: any) {
    throw new HttpError(503, err.message);
  }
});

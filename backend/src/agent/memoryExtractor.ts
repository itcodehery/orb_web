import { Ollama } from '../llm/Ollama';
import { createMemory } from '../db/memories.repo';

export async function extractAndSaveMemories(
  userId: string,
  model: string,
  existingFacts: string[],
  userMessage: string,
  assistantReply: string
): Promise<void> {
  if (!userMessage || !assistantReply) return;

  const prompt = `You extract durable personal facts about a user from a conversation exchange.

Facts already known about this user:
${existingFacts.length ? existingFacts.map(f => `- ${f}`).join('\n') : '(none yet)'}

Latest exchange:
User: ${userMessage}
Assistant: ${assistantReply}

Output ONLY genuinely new, durable facts about the user that are not already known — things like their name, stated preferences, ongoing projects, or recurring context. Do NOT include one-off questions, requests, or facts already listed above.

Respond with a JSON array of strings and nothing else. If there are no new facts, respond with [].`;

  try {
    const llm = new Ollama(model, 'low');
    const response = await llm.chat([{ role: 'user', content: prompt }]);
    const text = (response.text || '').trim();

    const jsonStart = text.indexOf('[');
    const jsonEnd = text.lastIndexOf(']');
    if (jsonStart === -1 || jsonEnd === -1) return;

    const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
    if (!Array.isArray(parsed)) return;

    for (const fact of parsed) {
      if (typeof fact === 'string' && fact.trim()) {
        createMemory(userId, fact.trim());
      }
    }
  } catch (error) {
    console.error('Memory extraction failed:', error);
  }
}

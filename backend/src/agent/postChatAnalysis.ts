import { Ollama } from '../llm/Ollama';
import { createMemory } from '../db/memories.repo';
import { patchMessageRiskScore } from '../db/sessions.repo';

export async function analyzeChat(
  userId: string,
  model: string,
  sessionId: number,
  messageIndex: number,
  existingFacts: string[],
  userMessage: string,
  assistantReply: string
): Promise<void> {
  if (!userMessage || !assistantReply) return;

  const prompt = `You analyze one exchange from a conversation between a user and an AI assistant.

Facts already known about this user:
${existingFacts.length ? existingFacts.map(f => `- ${f}`).join('\n') : '(none yet)'}

Latest exchange:
User: ${userMessage}
Assistant: ${assistantReply}

Do two things:
1. List any genuinely new, durable facts about the user that are not already known above — things like their name, stated preferences, ongoing projects, or recurring context. Do NOT include one-off questions, requests, or facts already listed.
2. Rate, from 0 to 100, how likely the Assistant's reply contains ungrounded, fabricated, or unsupported claims (0 = fully grounded/safe, 100 = highly likely to be hallucinated).

Respond with a single JSON object and nothing else, in this exact shape:
{"newFacts": ["fact one", "fact two"], "hallucinationRisk": 15}

If there are no new facts, use an empty array. hallucinationRisk must always be a number.`;

  try {
    const llm = new Ollama(model, 'low');
    const response = await llm.chat([{ role: 'user', content: prompt }]);
    const text = (response.text || '').trim();

    const jsonStart = text.indexOf('{');
    const jsonEnd = text.lastIndexOf('}');
    if (jsonStart === -1 || jsonEnd === -1) return;

    const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
    if (typeof parsed !== 'object' || parsed === null) return;

    if (Array.isArray(parsed.newFacts)) {
      for (const fact of parsed.newFacts) {
        if (typeof fact === 'string' && fact.trim()) {
          createMemory(userId, fact.trim());
        }
      }
    }

    if (typeof parsed.hallucinationRisk === 'number') {
      patchMessageRiskScore(sessionId, userId, messageIndex, parsed.hallucinationRisk);
    }
  } catch (error) {
    console.error('Post-chat analysis failed:', error);
  }
}

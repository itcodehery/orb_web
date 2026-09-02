import { createExtractionLLM } from '../llm/factory';
import { createMemory } from '../db/memories.repo';
import { patchMessageRiskScore, patchMessagePolicyFlags, PolicyFlag } from '../db/sessions.repo';
import { insertEvent } from '../db/policies.repo';

export interface ConductRuleRef {
  id: number;
  documentId: number;
  title: string;
  directive: string;
}

export async function analyzeChat(
  userId: string,
  model: string,
  sessionId: number,
  messageIndex: number,
  existingFacts: string[],
  userMessage: string,
  assistantReply: string,
  conductRules: ConductRuleRef[] = []
): Promise<void> {
  if (!userMessage || !assistantReply) return;

  const conductSection = conductRules.length
    ? `
3. Check the Assistant's reply against these company conduct rules and list the numeric ids of every rule the reply violates (an empty array if none):
${conductRules.map(r => `[${r.id}] ${r.title} — ${r.directive}`).join('\n')}
`
    : '';

  // Numbered list + an explicit anti-suppression instruction: without both,
  // small local models (verified against qwen3:8b) treat ANY non-empty
  // "already known" list as a signal to return newFacts: [] outright, even
  // when the exchange states an obviously new, explicitly-flagged fact
  // ("please remember this: ..."). A bare "- fact" bullet list without that
  // instruction reproduces the bug 8/8 times.
  const factsBlock = existingFacts.length
    ? existingFacts.map((f, i) => `${i + 1}. ${f}`).join('\n')
    : '(none yet)';

  const prompt = `You analyze one exchange from a conversation between a user and an AI assistant.

Numbered list of facts already known about this user:
${factsBlock}

Latest exchange:
User: ${userMessage}
Assistant: ${assistantReply}

Do ${conductRules.length ? 'three' : 'two'} things:
1. Read the User's message on its own. Does it state or imply any durable fact about the user (name, preference, possession, ongoing project, recurring context) that is NOT already covered by one of the numbered facts above? A non-empty numbered list above is NOT a reason to return an empty array — check each candidate fact against the list individually, and include it if it is genuinely absent from the list. If the user explicitly says "remember this" or similar, treat what follows as a fact to extract unless it is already in the numbered list. Do NOT include one-off questions or requests that state no fact.
2. Rate, from 0 to 100, how likely the Assistant's reply contains ungrounded, fabricated, or unsupported claims (0 = fully grounded/safe, 100 = highly likely to be hallucinated).
${conductSection}
Respond with a single JSON object and nothing else, in this exact shape:
{"newFacts": ["fact one", "fact two"], "hallucinationRisk": 15, "policyViolations": [12]}

If there are truly no new facts, use an empty array. hallucinationRisk must always be a number. policyViolations must always be an array of numbers (empty when nothing is violated).`;

  try {
    // Uncapped (num_predict:-1) + thinking disabled: background analysis must
    // always reach the JSON content, which qwen-style thinking models otherwise
    // starve under the low profile's 512-token cap.
    const llm = createExtractionLLM(model);
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

    if (conductRules.length && Array.isArray(parsed.policyViolations)) {
      const byId = new Map(conductRules.map(r => [r.id, r]));
      const flags: PolicyFlag[] = [];
      for (const value of parsed.policyViolations) {
        const rule = byId.get(Number(value));
        if (rule && !flags.some(f => f.ruleId === rule.id)) flags.push({ ruleId: rule.id, title: rule.title });
      }
      if (flags.length) {
        patchMessagePolicyFlags(sessionId, userId, messageIndex, flags);
        for (const flag of flags) {
          const rule = byId.get(flag.ruleId)!;
          insertEvent({
            channel: 'judge',
            decision: 'flagged',
            source: 'judge',
            documentId: rule.documentId,
            ruleId: rule.id,
            userId,
            sessionId,
            message: `Reply flagged for "${rule.title}" (message ${messageIndex}).`,
          });
        }
      }
    }
  } catch (error) {
    console.error('Post-chat analysis failed:', error);
  }
}

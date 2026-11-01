// KuMal (ကူမယ်, "will help"): explains a change in plain words, for people
// new to the project or to git, using Claude.

import Anthropic from '@anthropic-ai/sdk';

export type Lang = 'en' | 'my';

/** Enough of a patch for a good explanation; past this KuMal is told what it can't see. */
const MAX_PATCH = 150_000;

const SYSTEM = `You are KuMal (ကူမယ်, "will help"), the guide inside ChayYarHub, a self-hosted git hub.
People open you on a snapshot (a commit) or a pull request to understand what changed. Many of them are new to the project, and some are new to programming or to git.

Write for that reader:
- Start with one sentence saying what this change does, in everyday words.
- Then a short "What changed" list of 2 to 6 points. Name files or functions only when it helps, and say what they are for.
- Then, if there is anything worth knowing (a risk, a behaviour change, something to test), a short "Worth knowing" list. Leave it out when there is nothing real to say.
- Explain a technical term the first time you use it, briefly. Don't explain git itself unless the change is about git.
- Base everything on the diff. If the intent isn't clear from it, say so instead of guessing.
- Use Markdown: short paragraphs and lists, no headings bigger than ###, no tables. Keep it under 250 words.`;

const LANGUAGE: Record<Lang, string> = {
  en: 'Write in English.',
  my: 'Write in Burmese (Myanmar language, Unicode). Keep code names, file names and commands as they are, in Latin script.',
};

export class KumalError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

let client: Anthropic | undefined;

export async function explain(model: string, title: string, patch: string, lang: Lang): Promise<string> {
  client ??= new Anthropic();
  const truncated = patch.length > MAX_PATCH;
  const shown = truncated ? patch.slice(0, MAX_PATCH) : patch;
  const note = truncated ? `\n\n(The diff is ${patch.length} characters; only the first ${MAX_PATCH} are shown. Say that your explanation covers part of the change.)` : '';
  try {
    const response = await client.beta.messages.create({
      model,
      max_tokens: 16000,
      output_config: { effort: 'low' },
      // If Claude declines, the request is retried on a fallback model.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM,
      messages: [{ role: 'user', content: `${LANGUAGE[lang]}\n\n${title}\n\n<diff>\n${shown}\n</diff>${note}` }],
    });
    if (response.stop_reason === 'refusal') throw new KumalError("KuMal couldn't explain this change.", 422);
    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    if (!text) throw new KumalError('KuMal had nothing to say about this change.', 502);
    return text;
  } catch (e) {
    if (e instanceof KumalError) throw e;
    if (e instanceof Anthropic.AuthenticationError || (e instanceof Error && /api key|credentials|apiKey|authToken/i.test(e.message))) {
      throw new KumalError('KuMal needs a Claude API key. Start the server with ANTHROPIC_API_KEY set.', 503);
    }
    if (e instanceof Anthropic.RateLimitError) throw new KumalError('KuMal is busy. Try again in a minute.', 429);
    if (e instanceof Anthropic.APIError) throw new KumalError(`KuMal couldn't reach Claude (${e.status ?? 'network error'}).`, 502);
    throw e;
  }
}

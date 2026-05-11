import { geminiClient } from '../config/gemini';

export type AutoNegotiationAction = 'accept' | 'counter';

export interface AutoNegotiationEvaluationInput {
  buyerMessage: string;
  listingTitle: string;
  askingPrice: number;
  floorPrice: number;
  currency: string;
}

export interface AutoNegotiationKnownOfferInput extends AutoNegotiationEvaluationInput {
  buyerOffer: number;
}

export interface AutoNegotiationReplyResult {
  action: AutoNegotiationAction;
  buyerOffer: number;
  targetPrice: number;
  reply: string;
}

interface ExtractOfferResponse {
  hasOffer?: boolean;
  offeredPrice?: number | null;
  confidence?: number;
}

interface GenerateReplyResponse {
  reply?: string;
}

const GEMINI_MODEL = 'gemini-2.5-flash';
const MIN_OFFER_CONFIDENCE = 0.58;
const MAX_REPLY_LENGTH = 260;
const OFFER_CUE_PATTERN =
  /\b(offer|take|accept|can you do|can do|would you do|lowest|best price|budget|pay|price|deal)\b|(?:^|\s)(rm|myr|\$)/i;

function roundMoney(value: number): number {
  return Number(value.toFixed(2));
}

function formatCurrency(value: number, currency = 'MYR'): string {
  try {
    return new Intl.NumberFormat('en-MY', {
      style: 'currency',
      currency,
      minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency} ${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(2)}`;
  }
}

function parseGeminiJson<T>(text: string): T | null {
  const trimmed = text.trim();

  try {
    return JSON.parse(trimmed) as T;
  } catch {
    const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return null;
    }

    try {
      return JSON.parse(jsonMatch[0]) as T;
    } catch {
      return null;
    }
  }
}

function normalizeOfferAmount(value: unknown, askingPrice: number): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  if (askingPrice > 0 && parsed > askingPrice * 5) {
    return null;
  }

  return roundMoney(parsed);
}

function extractOfferWithHeuristic(message: string, askingPrice: number): number | null {
  const normalized = message.trim();
  if (!normalized) {
    return null;
  }

  const hasOfferCue = OFFER_CUE_PATTERN.test(normalized);
  const isShortNumericOffer = normalized.length <= 24 && /\d/.test(normalized);

  if (!hasOfferCue && !isShortNumericOffer) {
    return null;
  }

  const amountMatches = Array.from(
    normalized.matchAll(
      /(?:rm|myr|\$)?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)\s*(?:rm|myr)?/gi
    )
  );

  for (const match of amountMatches.reverse()) {
    const parsed = normalizeOfferAmount(match[1].replace(/,/g, ''), askingPrice);
    if (parsed !== null) {
      return parsed;
    }
  }

  return null;
}

async function extractOfferWithGemini(
  input: AutoNegotiationEvaluationInput
): Promise<number | null> {
  const prompt = `
You extract buyer price offers from marketplace chat.

Return hasOffer true only when the buyer is proposing a price to buy the listed item.
Ignore phone numbers, model numbers, quantities, dates, times, addresses, tracking numbers, and vague questions.
If multiple prices appear, choose the latest price that is clearly the buyer's offer.
Return the numeric amount only, without currency symbols.

Listing title: ${input.listingTitle}
Asking price: ${formatCurrency(input.askingPrice, input.currency)}
Buyer message:
"""${input.buyerMessage}"""
`;

  const response = await geminiClient.models.generateContent({
    model: GEMINI_MODEL,
    contents: [
      {
        role: 'user',
        parts: [{ text: prompt }],
      },
    ],
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'object',
        properties: {
          hasOffer: { type: 'boolean' },
          offeredPrice: { type: 'number', nullable: true },
          confidence: { type: 'number' },
        },
        required: ['hasOffer', 'offeredPrice', 'confidence'],
      } as any,
      temperature: 0.1,
    },
  });

  const parsed = response.text ? parseGeminiJson<ExtractOfferResponse>(response.text) : null;
  if (!parsed?.hasOffer || (parsed.confidence ?? 0) < MIN_OFFER_CONFIDENCE) {
    return null;
  }

  return normalizeOfferAmount(parsed.offeredPrice, input.askingPrice);
}

function computeTargetPrice(
  buyerOffer: number,
  askingPrice: number,
  floorPrice: number
): { action: AutoNegotiationAction; targetPrice: number } {
  if (buyerOffer >= floorPrice) {
    return {
      action: 'accept',
      targetPrice: roundMoney(Math.min(buyerOffer, askingPrice)),
    };
  }

  const midpoint = (buyerOffer + askingPrice) / 2;
  return {
    action: 'counter',
    targetPrice: roundMoney(Math.min(askingPrice, Math.max(floorPrice, midpoint))),
  };
}

function buildFallbackReply(
  action: AutoNegotiationAction,
  buyerOffer: number,
  targetPrice: number,
  currency: string
): string {
  const buyerOfferLabel = formatCurrency(buyerOffer, currency);
  const targetPriceLabel = formatCurrency(targetPrice, currency);

  if (action === 'accept') {
    return `That works for me at ${targetPriceLabel}. If you are happy with it, send the offer and we can move ahead.`;
  }

  return `Thanks for the offer. I cannot do ${buyerOfferLabel}, but I can meet you at ${targetPriceLabel}.`;
}

function sanitizeGeneratedReply(
  reply: string | null | undefined,
  targetPrice: number,
  currency: string
): string | null {
  const normalized = (reply ?? '')
    .replace(/\s+/g, ' ')
    .replace(/^["']|["']$/g, '')
    .trim();

  if (!normalized || normalized.length > MAX_REPLY_LENGTH) {
    return null;
  }

  if (/\b(ai|automated|auto-reply|bot|floor price|minimum price|hidden price)\b/i.test(normalized)) {
    return null;
  }

  const compactReply = normalized.replace(/[,.\s]/g, '').toLowerCase();
  const compactTarget = String(targetPrice).replace(/[,.\s]/g, '');
  const formattedTarget = formatCurrency(targetPrice, currency).replace(/[,.\s]/g, '').toLowerCase();

  if (!compactReply.includes(compactTarget) && !compactReply.includes(formattedTarget)) {
    return null;
  }

  return normalized;
}

async function generateReplyWithGemini(
  input: AutoNegotiationEvaluationInput,
  action: AutoNegotiationAction,
  buyerOffer: number,
  targetPrice: number
): Promise<string | null> {
  const buyerOfferLabel = formatCurrency(buyerOffer, input.currency);
  const targetPriceLabel = formatCurrency(targetPrice, input.currency);
  const instruction =
    action === 'accept'
      ? `Accept the buyer's offer at exactly ${targetPriceLabel}.`
      : `Politely decline ${buyerOfferLabel} and counter at exactly ${targetPriceLabel}.`;

  const prompt = `
You are writing one short marketplace chat reply on behalf of the seller.
${instruction}

Tone: warm, friendly, confident.
Rules:
- Do not mention AI, automation, private settings, minimum price, or floor price.
- Do not invent delivery, payment, reservation, or warranty terms.
- Keep it under 220 characters.
- Include the exact price ${targetPriceLabel}.

Listing title: ${input.listingTitle}
Buyer message:
"""${input.buyerMessage}"""
`;

  const response = await geminiClient.models.generateContent({
    model: GEMINI_MODEL,
    contents: [
      {
        role: 'user',
        parts: [{ text: prompt }],
      },
    ],
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'object',
        properties: {
          reply: { type: 'string' },
        },
        required: ['reply'],
      } as any,
      temperature: 0.55,
    },
  });

  const parsed = response.text ? parseGeminiJson<GenerateReplyResponse>(response.text) : null;
  return sanitizeGeneratedReply(parsed?.reply, targetPrice, input.currency);
}

export async function evaluateAutoNegotiationReply(
  input: AutoNegotiationEvaluationInput
): Promise<AutoNegotiationReplyResult | null> {
  const trimmedMessage = input.buyerMessage.trim();
  if (!trimmedMessage || input.askingPrice <= 0 || input.floorPrice <= 0) {
    return null;
  }

  let buyerOffer: number | null = null;

  try {
    buyerOffer = await extractOfferWithGemini(input);
  } catch (error) {
    console.error('[Auto Negotiation] Gemini offer extraction failed:', error);
  }

  if (buyerOffer === null) {
    buyerOffer = extractOfferWithHeuristic(trimmedMessage, input.askingPrice);
  }

  if (buyerOffer === null) {
    return null;
  }

  const { action, targetPrice } = computeTargetPrice(
    buyerOffer,
    input.askingPrice,
    input.floorPrice
  );

  let reply: string | null = null;
  try {
    reply = await generateReplyWithGemini(input, action, buyerOffer, targetPrice);
  } catch (error) {
    console.error('[Auto Negotiation] Gemini reply generation failed:', error);
  }

  return {
    action,
    buyerOffer,
    targetPrice,
    reply: reply ?? buildFallbackReply(action, buyerOffer, targetPrice, input.currency),
  };
}

export async function generateAutoNegotiationReplyForKnownOffer(
  input: AutoNegotiationKnownOfferInput
): Promise<AutoNegotiationReplyResult | null> {
  if (
    input.buyerOffer <= 0 ||
    input.askingPrice <= 0 ||
    input.floorPrice <= 0 ||
    input.floorPrice > input.askingPrice
  ) {
    return null;
  }

  const buyerOffer = roundMoney(input.buyerOffer);
  const { action, targetPrice } = computeTargetPrice(
    buyerOffer,
    input.askingPrice,
    input.floorPrice
  );

  const buyerMessage = input.buyerMessage.trim()
    ? `${formatCurrency(buyerOffer, input.currency)} formal offer. Buyer note: ${input.buyerMessage.trim()}`
    : `${formatCurrency(buyerOffer, input.currency)} formal offer.`;

  const replyInput: AutoNegotiationEvaluationInput = {
    ...input,
    buyerMessage,
  };

  let reply: string | null = null;
  try {
    reply = await generateReplyWithGemini(replyInput, action, buyerOffer, targetPrice);
  } catch (error) {
    console.error('[Auto Negotiation] Gemini formal-offer reply generation failed:', error);
  }

  return {
    action,
    buyerOffer,
    targetPrice,
    reply: reply ?? buildFallbackReply(action, buyerOffer, targetPrice, input.currency),
  };
}

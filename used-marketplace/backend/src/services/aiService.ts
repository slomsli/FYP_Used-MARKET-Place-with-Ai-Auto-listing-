import { supabaseAdmin } from '../config/supabase';
import { geminiClient } from '../config/gemini';

export interface GenerateListingImageInput {
  base64Data: string;
  contentType: string;
}

export interface GeneratedListingData {
  title: string;
  brand: string | null;
  suggestedCategoryName: string;
  matchedCategoryId: number | null;
  condition: 'new' | 'like_new' | 'good' | 'fair' | 'poor';
  description: string;
  color: string | null;
  model: string | null;
  material: string | null;
}

export interface ListingCoachInput {
  title?: string;
  description?: string;
  brand?: string;
  categoryName?: string | null;
  parentCategoryName?: string | null;
  condition?: string | null;
  price?: number | null;
  currency?: string;
  negotiable?: boolean;
  stateName?: string | null;
  areaName?: string | null;
  imageCount?: number;
  images?: GenerateListingImageInput[];
}

export interface ListingCoachResult {
  score: number;
  verdict: 'excellent' | 'good' | 'needs_work';
  summary: string;
  titleSuggestion: string | null;
  priceFeedback: string;
  photoFeedback: string;
  missingDetails: string[];
  keywordSuggestions: string[];
  improvementTips: string[];
  priorityFix: string;
}

function clampScore(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);

  if (!Number.isFinite(parsed)) {
    return 60;
  }

  return Math.min(100, Math.max(0, Math.round(parsed)));
}

function toStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const items = value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
    .slice(0, 6);

  return items.length > 0 ? items : fallback;
}

function toNonEmptyString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function normalizeCoachResult(value: Partial<ListingCoachResult>): ListingCoachResult {
  const score = clampScore(value.score);
  const verdict =
    value.verdict === 'excellent' || value.verdict === 'good' || value.verdict === 'needs_work'
      ? value.verdict
      : score >= 85
        ? 'excellent'
        : score >= 70
          ? 'good'
          : 'needs_work';

  return {
    score,
    verdict,
    summary: toNonEmptyString(
      value.summary,
      'The listing has a useful foundation. Improve the buyer-facing details before publishing.'
    ),
    titleSuggestion:
      typeof value.titleSuggestion === 'string' && value.titleSuggestion.trim()
        ? value.titleSuggestion.trim()
        : null,
    priceFeedback: toNonEmptyString(
      value.priceFeedback,
      'Check similar marketplace listings before publishing the final price.'
    ),
    photoFeedback: toNonEmptyString(
      value.photoFeedback,
      'Add clear photos from multiple angles so buyers can judge condition confidently.'
    ),
    missingDetails: toStringArray(value.missingDetails, [
      'Mention size, measurements, model, age, included accessories, or defects where relevant.',
    ]),
    keywordSuggestions: toStringArray(value.keywordSuggestions, [
      'condition',
      'brand',
      'model',
    ]),
    improvementTips: toStringArray(value.improvementTips, [
      'Make the title specific.',
      'Add condition details.',
      'Use bright, clear photos.',
    ]),
    priorityFix: toNonEmptyString(
      value.priorityFix,
      'Add the most important missing buyer detail before publishing.'
    ),
  };
}

export async function generateListingData(
  images: GenerateListingImageInput[]
): Promise<GeneratedListingData> {
  const { data: categories, error } = await supabaseAdmin
    .from('categories')
    .select('id, name')
    .order('name', { ascending: true });

  if (error) {
    console.error('[AI Service] Failed to fetch categories for AI prompt', error);
    throw new Error('Failed to fetch categories context');
  }

  const categoryListStr = (categories ?? [])
    .map((c) => `ID: ${c.id}, Name: ${c.name}`)
    .join('\n');

  const promptText = `
You are an expert marketplace listing generator. Analyze the provided image(s) to automatically extract listing metadata.
We have a specific list of categories in our database. You must suggest a category name representing the item best, AND provide the exact matching 'matchedCategoryId' based on this official list:

${categoryListStr}

Please return structured data describing the item.
For the condition field, strictly evaluate the item's appearance and use one of the following exact string values: "new", "like_new", "good", "fair", "poor".
If you are unable to determine optional fields confidently (brand, color, model, material), return null for them rather than making it up.
Keep the title catchy but descriptive for a marketplace.
Generate a compelling description (at least 2-3 sentences).
`;

  const parts = [
    { text: promptText },
    ...images.map((img) => ({
      inlineData: {
        mimeType: img.contentType,
        data: img.base64Data.replace(/^data:image\/\w+;base64,/, ''),
      }
    })),
  ];

  const generateParams = {
    model: 'gemini-2.5-pro',
    contents: [
      {
        role: 'user',
        parts: parts as any,
      },
    ],
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Catchy and descriptive title' },
          brand: { type: 'string', nullable: true, description: 'Brand name if visible or easily inferred, else null' },
          suggestedCategoryName: { type: 'string', description: 'Suggested category name' },
          matchedCategoryId: { type: 'integer', nullable: true, description: 'The integer ID of the category from the provided list that matches best' },
          condition: {
            type: 'string',
            enum: ['new', 'like_new', 'good', 'fair', 'poor'],
            description: 'Item condition'
          },
          description: { type: 'string', description: 'Detailed marketing description of the item' },
          color: { type: 'string', nullable: true, description: 'Main color(s)' },
          model: { type: 'string', nullable: true, description: 'Specific model name or number' },
          material: { type: 'string', nullable: true, description: 'Material composition' }
        },
        required: ['title', 'suggestedCategoryName', 'condition', 'description'],
      } as any,
      temperature: 0.4,
    },
  };

  let response;
  try {
    response = await geminiClient.models.generateContent(generateParams);
  } catch (error: any) {
    console.warn('[AI Service] gemini-2.5-pro failed or is unavailable. Falling back to gemini-2.5-flash. Error:', error.message || error);
    generateParams.model = 'gemini-2.5-pro';
    response = await geminiClient.models.generateContent(generateParams);
  }

  const parsedText = response.text;
  if (!parsedText) {
    throw new Error('AI returned empty response');
  }

  try {
    const result = JSON.parse(parsedText) as GeneratedListingData;
    return result;
  } catch {
    console.error('[AI Service] Failed to parse AI structured JSON:', parsedText);
    throw new Error('Failed to parse the AI generated data');
  }
}

export async function generateListingCoach(
  input: ListingCoachInput
): Promise<ListingCoachResult> {
  const listingSnapshot = {
    title: input.title?.trim() || '',
    description: input.description?.trim() || '',
    brand: input.brand?.trim() || '',
    categoryName: input.categoryName || null,
    parentCategoryName: input.parentCategoryName || null,
    condition: input.condition || null,
    price: input.price ?? null,
    currency: input.currency || 'MYR',
    negotiable: input.negotiable === true,
    stateName: input.stateName || null,
    areaName: input.areaName || null,
    imageCount: Math.max(0, Number(input.imageCount ?? input.images?.length ?? 0) || 0),
  };

  const promptText = `
You are an AI Listing Coach for a student used-marketplace app.
Review this listing draft and return practical seller advice.

Listing snapshot:
${JSON.stringify(listingSnapshot, null, 2)}

Scoring guidance:
- 90-100: clear, trustworthy, complete, strong photos, fair price signal.
- 70-89: good listing with a few improvements.
- 0-69: missing important buyer details, weak title/photos, unclear price, or trust issues.

Give short, direct advice. Do not invent exact market prices. If price is missing or suspicious, say what to compare or clarify.
If photos are included, use them only to comment on clarity, item visibility, and missing angles; do not pretend certainty about hidden defects.
`;

  const imageParts = (input.images ?? []).slice(0, 3).map((img) => ({
    inlineData: {
      mimeType: img.contentType,
      data: img.base64Data.replace(/^data:image\/\w+;base64,/, ''),
    },
  }));

  const response = await geminiClient.models.generateContent({
    model: 'gemini-2.5-pro',
    contents: [
      {
        role: 'user',
        parts: [
          { text: promptText },
          ...imageParts,
        ] as any,
      },
    ],
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'object',
        properties: {
          score: { type: 'integer', description: 'Listing quality score from 0 to 100' },
          verdict: {
            type: 'string',
            enum: ['excellent', 'good', 'needs_work'],
            description: 'Short quality verdict',
          },
          summary: { type: 'string', description: 'One sentence summary of the listing quality' },
          titleSuggestion: {
            type: 'string',
            nullable: true,
            description: 'Improved marketplace title, or null if current title is strong',
          },
          priceFeedback: { type: 'string', description: 'Short pricing advice' },
          photoFeedback: { type: 'string', description: 'Short photo quality advice' },
          missingDetails: {
            type: 'array',
            items: { type: 'string' },
            description: 'Important details the seller should add',
          },
          keywordSuggestions: {
            type: 'array',
            items: { type: 'string' },
            description: 'Search keywords that fit the listing',
          },
          improvementTips: {
            type: 'array',
            items: { type: 'string' },
            description: 'Actionable improvements',
          },
          priorityFix: {
            type: 'string',
            description: 'The single most important improvement',
          },
        },
        required: [
          'score',
          'verdict',
          'summary',
          'priceFeedback',
          'photoFeedback',
          'missingDetails',
          'keywordSuggestions',
          'improvementTips',
          'priorityFix',
        ],
      } as any,
      temperature: 0.35,
    },
  });

  if (!response.text) {
    throw new Error('AI returned empty coach response');
  }

  try {
    return normalizeCoachResult(JSON.parse(response.text) as Partial<ListingCoachResult>);
  } catch {
    console.error('[AI Service] Failed to parse AI coach JSON:', response.text);
    throw new Error('Failed to parse the AI coach response');
  }
}

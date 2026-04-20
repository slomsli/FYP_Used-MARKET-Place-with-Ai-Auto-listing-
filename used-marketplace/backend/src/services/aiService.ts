import { GoogleGenAI } from '@google/genai';
import { supabaseAdmin } from '../config/supabase';

const ai = new GoogleGenAI({});

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

export async function generateListingData(images: GenerateListingImageInput[]): Promise<GeneratedListingData> {
  const { data: categories, error } = await supabaseAdmin
    .from('categories')
    .select('id, name')
    .is('parent_id', null) // Probably getting main categories, wait I'll get all categories to be safe
    .order('name', { ascending: true });

  if (error) {
    console.error('[AI Service] Failed to fetch categories for AI prompt', error);
    throw new Error('Failed to fetch categories context');
  }

  // Get all categories, we don't necessarily want only parent_id = null. Let me fetch all categories.
  // Actually I need to fetch all categories:
  const { data: allCategories, error: allCatError } = await supabaseAdmin
    .from('categories')
    .select('id, name')
    .order('name', { ascending: true });

  if (allCatError) {
      console.error('[AI Service] Failed to fetch all categories for AI prompt', allCatError);
      throw new Error('Failed to fetch categories context');
  }

  const categoryListStr = (allCategories || [])
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
    ...images.map(img => ({
      inlineData: {
        mimeType: img.contentType,
        data: img.base64Data.replace(/^data:image\/\w+;base64,/, ''),
      }
    }))
  ];

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [
      {
        role: 'user',
        parts: parts as any,
      }
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
        required: ['title', 'suggestedCategoryName', 'condition', 'description']
      } as any,
      temperature: 0.4
    }
  });

  const parsedText = response.text;
  if (!parsedText) {
    throw new Error('AI returned empty response');
  }

  try {
    const result = JSON.parse(parsedText) as GeneratedListingData;
    return result;
  } catch (e) {
    console.error('[AI Service] Failed to parse AI structured JSON:', parsedText);
    throw new Error('Failed to parse the AI generated data');
  }
}

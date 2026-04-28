import { GoogleGenAI } from '@google/genai';

const geminiApiKey = process.env.GEMINI_API_KEY?.trim();

if (!geminiApiKey) {
  throw new Error('Missing required environment variable: GEMINI_API_KEY');
}

export const geminiClient = new GoogleGenAI({
  apiKey: geminiApiKey,
});

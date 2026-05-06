import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 30;

const anthropic = new Anthropic();

export async function POST(req: NextRequest) {
  try {
    const { image, mediaType, query } = await req.json();

    if (!image && !query) {
      return NextResponse.json(
        { error: 'No image or query provided' },
        { status: 400 }
      );
    }

    const subjectLine = image
      ? 'Identify the main subject of this image.'
      : `The object to measure is: "${String(query).slice(0, 200)}".`;

    const promptText = `You measure things in bananas.
- Average banana length = 7 inches / 18 cm
- Average banana weight = 120 grams / 0.26 lb

${subjectLine} Estimate:
1. Its height (top to bottom) in bananas.
2. Its width (side to side) in bananas.
3. Its weight in bananas. If it is a well-known object (Eiffel Tower, Statue of Liberty, common car, household item, animal, etc.), use the real published weight and convert. If unknown, give your best educated estimate based on visible material, size, and type.

Respond ONLY with valid JSON. No markdown, no preamble:
{
  "height_bananas": <number, decimals ok>,
  "width_bananas": <number, decimals ok>,
  "weight_bananas": <number, decimals ok>,
  "object": "<what you measured, max 5 words>",
  "deadpan": "<one deadpan line about its banana stats, max 15 words, no exclamation marks>"
}`;

    const userContent: Anthropic.ContentBlockParam[] = [];
    if (image) {
      userContent.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: mediaType || 'image/jpeg',
          data: image,
        },
      });
    }
    userContent.push({ type: 'text', text: promptText });

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      messages: [{ role: 'user', content: userContent }],
    });

    const textBlock = message.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('No text response');
    }

    const cleaned = textBlock.text.replace(/```json|```/g, '').trim();
    let result;
    try {
      result = JSON.parse(cleaned);
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('Invalid JSON from model');
      result = JSON.parse(match[0]);
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error('Analyze error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to analyze' },
      { status: 500 }
    );
  }
}

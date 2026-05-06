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

    const promptText = `You measure things in bananas with strict accuracy.

CONSTANTS (use these exact values):
- Banana length: 7 inches = 0.1778 meters
- Banana weight: 120 grams = 0.12 kg

PROCESS:
${subjectLine}

Step 1 — Lookup real dimensions:
If the object is well-known (named landmark, named vehicle/ship/aircraft, common animal species, common product, branded item), use its REAL published dimensions and weight. Do NOT estimate when real data exists.

If the object is generic or unknown, estimate using visible reference objects in the scene and typical dimensions for that type of item.

Step 2 — Do the math precisely:
- height_bananas = real_height_meters / 0.1778
- width_bananas = real_horizontal_extent_meters / 0.1778
  (use the horizontal dimension visible in the image: length for side views, width/beam for front views)
- weight_bananas = real_weight_kg / 0.12

Step 3 — Output your reasoning, then the JSON.

Format your response EXACTLY like this:

REASONING:
- Object: <name>
- Real height: <value with unit>
- Real width/length: <value with unit>
- Real weight: <value with unit>
- Math: <show divisions>

JSON:
{
  "height_bananas": <number>,
  "width_bananas": <number>,
  "weight_bananas": <number>,
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
      max_tokens: 800,
      temperature: 0,
      messages: [{ role: 'user', content: userContent }],
    });

    const textBlock = message.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('No text response');
    }

    const cleaned = textBlock.text.replace(/```json|```/g, '').trim();

    // Find the last flat JSON object in the response (after the reasoning section)
    let result;
    try {
      result = JSON.parse(cleaned);
    } catch {
      const matches = cleaned.match(/\{[^{}]*\}/g);
      if (!matches || matches.length === 0) {
        throw new Error('Invalid JSON from model');
      }
      result = JSON.parse(matches[matches.length - 1]);
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

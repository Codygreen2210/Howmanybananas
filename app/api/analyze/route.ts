import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 30;

const anthropic = new Anthropic();

export async function POST(req: NextRequest) {
  try {
    const { image, mediaType } = await req.json();
    if (!image) {
      return NextResponse.json({ error: 'No image provided' }, { status: 400 });
    }

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType || 'image/jpeg',
                data: image,
              },
            },
            {
              type: 'text',
              text: `You measure things in bananas. Average banana = 7 inches / 18 cm long.

Identify the main subject of this image. Estimate BOTH its height (top to bottom) and width (side to side) in bananas.

Respond ONLY with valid JSON. No markdown, no preamble:
{
  "height_bananas": <number, decimals ok>,
  "width_bananas": <number, decimals ok>,
  "object": "<what you measured, max 5 words>",
  "deadpan": "<one deadpan line about its banana dimensions, max 15 words, no exclamation marks>"
}`,
            },
          ],
        },
      ],
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

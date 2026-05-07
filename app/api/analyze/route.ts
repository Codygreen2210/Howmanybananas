import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 30;

const anthropic = new Anthropic();

async function fetchWikiImage(query: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 5000);

    const url =
      `https://en.wikipedia.org/w/api.php` +
      `?action=query` +
      `&format=json` +
      `&prop=pageimages` +
      `&piprop=original%7Cthumbnail` +
      `&pithumbsize=800` +
      `&generator=search` +
      `&gsrsearch=${encodeURIComponent(query.trim())}` +
      `&gsrlimit=1` +
      `&origin=*`;

    const res = await fetch(url, {
      headers: { 'User-Agent': 'howmanybananas/1.0 (pocket-built)' },
      signal: controller.signal,
    });
    clearTimeout(t);

    if (!res.ok) {
      console.log('Wiki fetch failed:', res.status);
      return null;
    }

    const data = await res.json();
    const pages = data?.query?.pages;
    if (!pages) {
      console.log('Wiki: no pages for', query);
      return null;
    }

    const firstPage = Object.values(pages)[0] as {
      original?: { source: string };
      thumbnail?: { source: string };
    };

    const imageUrl =
      firstPage?.original?.source || firstPage?.thumbnail?.source || null;

    console.log('Wiki image for', query, ':', imageUrl ? 'found' : 'none');
    return imageUrl;
  } catch (e) {
    console.log('Wiki error:', e);
    return null;
  }
}

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
If generic/unknown, estimate using visible reference objects and typical dimensions.

Step 2 — Do the math precisely:
- height_bananas = real_height_meters / 0.1778
- width_bananas = real_horizontal_extent_meters / 0.1778
- weight_bananas = real_weight_kg / 0.12

Step 3 — Output reasoning, then the JSON.

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
  "real_height": "<height with unit, e.g. '92.5 m'>",
  "real_width": "<width or length with unit>",
  "real_weight": "<weight with unit, e.g. '52,310 tonnes'>",
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

    const [message, wikiImage] = await Promise.all([
      anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 800,
        temperature: 0,
        messages: [{ role: 'user', content: userContent }],
      }),
      query ? fetchWikiImage(query) : Promise.resolve(null),
    ]);

    const textBlock = message.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('No text response');
    }

    const cleaned = textBlock.text.replace(/```json|```/g, '').trim();
    let result;
    try {
      result = JSON.parse(cleaned);
    } catch {
      const matches = cleaned.match(/\{[^{}]*\}/g);
      if (!matches?.length) throw new Error('Invalid JSON from model');
      result = JSON.parse(matches[matches.length - 1]);
    }

    if (wikiImage) result.image_url = wikiImage;
    return NextResponse.json(result);
  } catch (err) {
    console.error('Analyze error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to analyze' },
      { status: 500 }
    );
  }
}

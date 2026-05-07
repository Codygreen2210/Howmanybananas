import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 30;

const anthropic = new Anthropic();

// Brace-balanced JSON extractor — finds the last complete {...} block.
function extractJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {}

  const lastBrace = text.lastIndexOf('}');
  if (lastBrace === -1) throw new Error('No JSON object found');

  let depth = 0;
  let start = -1;
  for (let i = lastBrace; i >= 0; i--) {
    const ch = text[i];
    if (ch === '}') depth++;
    else if (ch === '{') {
      depth--;
      if (depth === 0) {
        start = i;
        break;
      }
    }
  }
  if (start === -1) throw new Error('No matching opening brace');

  return JSON.parse(text.slice(start, lastBrace + 1));
}

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

    if (!res.ok) return null;
    const data = await res.json();
    const pages = data?.query?.pages;
    if (!pages) return null;

    const firstPage = Object.values(pages)[0] as {
      original?: { source: string };
      thumbnail?: { source: string };
    };
    return firstPage?.original?.source || firstPage?.thumbnail?.source || null;
  } catch {
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

CONSTANTS:
- Banana length: 0.1778 meters (7 inches)
- Banana weight: 0.12 kg (120 grams)

${subjectLine}

If well-known (named landmark, vehicle, animal species, branded item), use REAL published dimensions. If unknown, estimate using visible references and typical sizes.

Math:
- height_bananas = real_height_meters / 0.1778
- width_bananas = real_horizontal_meters / 0.1778
- weight_bananas = real_weight_kg / 0.12

You MUST end your response with a valid JSON object on the LAST line, with no text after it. The JSON must contain exactly these fields and no nested objects:

{"height_bananas": <number>, "width_bananas": <number>, "weight_bananas": <number>, "real_height": "<value with unit>", "real_width": "<value with unit>", "real_weight": "<value with unit>", "object": "<max 5 words>", "deadpan": "<one deadpan line max 15 words no exclamation marks no curly braces>"}

You may write reasoning before the JSON, but the JSON MUST be the last thing in your response.`;

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
    const result = extractJson(cleaned) as Record<string, unknown>;

    // Coerce + provide safe fallbacks so client never crashes on missing fields.
    const safe = {
      height_bananas: Number(result.height_bananas) || 0,
      width_bananas: Number(result.width_bananas) || 0,
      weight_bananas: Number(result.weight_bananas) || 0,
      real_height: String(result.real_height || 'unknown'),
      real_width: String(result.real_width || 'unknown'),
      real_weight: String(result.real_weight || 'unknown'),
      object: String(result.object || 'unknown object'),
      deadpan: String(result.deadpan || ''),
      ...(wikiImage ? { image_url: wikiImage } : {}),
    };

    return NextResponse.json(safe);
  } catch (err) {
    console.error('Analyze error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to analyze' },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { Resend } from 'resend';

export const runtime = 'nodejs';

const redis = Redis.fromEnv();
const resend = new Resend(process.env.RESEND_API_KEY);

const SIGNUPS_KEY = 'pocketbuilt:signups';

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    const clean = String(email || '').trim().toLowerCase();
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean);
    if (!valid) {
      return NextResponse.json({ error: 'Invalid email' }, { status: 400 });
    }

    const added = await redis.sadd(SIGNUPS_KEY, clean);
    const total = await redis.scard(SIGNUPS_KEY);

    if (added === 1 && process.env.RESEND_API_KEY) {
      try {
        await resend.emails.send({
          from: 'Pocket Built <onboarding@resend.dev>',
          to: clean,
          subject: "You're in 🍌",
          html: `
            <div style="font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#fde047;color:#000;border-radius:16px;">
              <h1 style="font-size:32px;margin:0 0 12px;">🍌 you're in.</h1>
              <p style="font-size:16px;line-height:1.5;margin:0 0 16px;">
                Thanks for signing up for <b>Pocket Built</b> — apps built from a phone, one a day, until one hits 100 signups.
              </p>
              <p style="font-size:16px;line-height:1.5;margin:0 0 16px;">
                You signed up via <b>howmanybananas</b> (day 1). I'll email you when the next build drops.
              </p>
              <p style="font-size:14px;opacity:0.7;margin:24px 0 0;">— Cody</p>
            </div>
          `,
        });
      } catch (e) {
        console.error('Email send failed:', e);
      }
    }

    return NextResponse.json({
      ok: true,
      alreadyRegistered: added === 0,
      total,
    });
  } catch (err) {
    console.error('Signup error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Signup failed' },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const total = await redis.scard(SIGNUPS_KEY);
    return NextResponse.json({ total });
  } catch {
    return NextResponse.json({ total: 0 });
  }
}

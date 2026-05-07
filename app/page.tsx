'use client';

import { useState, useEffect } from 'react';

interface Result {
  height_bananas: number;
  width_bananas: number;
  weight_bananas: number;
  real_height: string;
  real_width: string;
  real_weight: string;
  object: string;
  deadpan: string;
  image_url?: string;
}

interface HistoryItem extends Result {
  id: string;
  timestamp: number;
  query?: string;
  thumbnail?: string;
}

const HISTORY_KEY = 'hmb_history';

async function resizeImage(
  file: File,
  maxDim = 1280
): Promise<{ base64: string; mediaType: string; dataUrl: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxDim) {
          height = (height * maxDim) / width;
          width = maxDim;
        } else if (height > maxDim) {
          width = (width * maxDim) / height;
          height = maxDim;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('No canvas'));
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        const [, base64] = dataUrl.split(',');
        resolve({ base64, mediaType: 'image/jpeg', dataUrl });
      };
      img.onerror = () => reject(new Error('Image load failed'));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error('Read failed'));
    reader.readAsDataURL(file);
  });
}

async function makeThumbnail(dataUrl: string, maxDim = 360): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ratio = Math.min(maxDim / img.width, maxDim / img.height, 1);
      canvas.width = img.width * ratio;
      canvas.height = img.height * ratio;
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve('');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      try {
        resolve(canvas.toDataURL('image/jpeg', 0.75));
      } catch {
        resolve('');
      }
    };
    img.onerror = () => resolve('');
    img.src = dataUrl;
  });
}

function formatNum(n: number): string {
  if (n >= 100_000_000) return Math.round(n / 1_000_000) + 'M';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 100_000) return Math.round(n / 1_000) + 'K';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  if (n >= 10) return Math.round(n).toString();
  return n.toFixed(1);
}

function loadHistory(): HistoryItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    return Array.isArray(raw) ? raw.filter((i) => i && i.id) : [];
  } catch {
    return [];
  }
}

function saveHistory(items: HistoryItem[]): void {
  if (typeof window === 'undefined') return;
  let trimmed = items.slice(0, 50);
  while (trimmed.length > 0) {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
      return;
    } catch {
      trimmed = trimmed.slice(0, Math.max(1, trimmed.length - 5));
    }
  }
}

export default function Home() {
  const [preview, setPreview] = useState<string | null>(null);
  const [searchedTerm, setSearchedTerm] = useState<string | null>(null);
  const [inputQuery, setInputQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [shareMsg, setShareMsg] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [signupState, setSignupState] = useState<
    'idle' | 'loading' | 'success' | 'duplicate' | 'error'
  >('idle');
  const [signupCount, setSignupCount] = useState<number | null>(null);

  useEffect(() => {
    setHistory(loadHistory());
    fetch('/api/signup')
      .then((r) => r.json())
      .then((d) => setSignupCount(d.total ?? null))
      .catch(() => {});
  }, []);

  const persistItem = async (
    data: Result,
    query: string | undefined,
    uploadDataUrl: string | null
  ) => {
    const thumbnail = uploadDataUrl
      ? await makeThumbnail(uploadDataUrl)
      : undefined;
    const item: HistoryItem = {
      ...data,
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      timestamp: Date.now(),
      query,
      thumbnail,
    };
    setHistory((prev) => {
      const updated = [item, ...prev].slice(0, 50);
      saveHistory(updated);
      return updated;
    });
  };

  const runAnalyze = async (
    body: Record<string, unknown>,
    opts: { query?: string; uploadDataUrl?: string | null } = {}
  ) => {
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `Failed (${res.status})`);
      }
      const data: Result = await res.json();
      setResult(data);
      try {
        await persistItem(data, opts.query, opts.uploadDataUrl ?? null);
      } catch {}
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something broke');
    } finally {
      setLoading(false);
    }
  };

  const handleFile = async (file: File) => {
    setSearchedTerm(null);
    try {
      const { base64, mediaType, dataUrl } = await resizeImage(file);
      setPreview(dataUrl);
      await runAnalyze({ image: base64, mediaType }, { uploadDataUrl: dataUrl });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Image failed');
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    const q = inputQuery.trim();
    if (!q) return;
    setPreview(null);
    setSearchedTerm(q);
    setInputQuery('');
    await runAnalyze({ query: q }, { query: q });
  };

  const reset = () => {
    setPreview(null);
    setSearchedTerm(null);
    setInputQuery('');
    setResult(null);
    setError(null);
    setShareMsg(null);
  };

  const loadHistoryItem = (item: HistoryItem) => {
    setError(null);
    setShareMsg(null);
    setLoading(false);
    if (item.query) {
      setSearchedTerm(item.query);
      setPreview(null);
    } else if (item.thumbnail) {
      setPreview(item.thumbnail);
      setSearchedTerm(null);
    } else {
      setSearchedTerm(item.object);
      setPreview(null);
    }
    setResult(item);
  };

  const clearHistory = () => {
    if (!confirm('Clear all measurements?')) return;
    setHistory([]);
    if (typeof window !== 'undefined') localStorage.removeItem(HISTORY_KEY);
  };

  const handleShare = async () => {
    if (!result) return;
    const text = `🍌 ${result.object}
height: ${result.real_height} = ${formatNum(result.height_bananas)} bananas
width: ${result.real_width} = ${formatNum(result.width_bananas)} bananas
weight: ${result.real_weight} = ${formatNum(result.weight_bananas)} bananas

"${result.deadpan}"

measure anything: ${typeof window !== 'undefined' ? window.location.origin : ''}`;
    try {
      if (
        typeof navigator !== 'undefined' &&
        typeof navigator.share === 'function'
      ) {
        await navigator.share({ title: 'howmanybananas', text });
      } else {
        await navigator.clipboard.writeText(text);
        setShareMsg('copied!');
        setTimeout(() => setShareMsg(null), 1500);
      }
    } catch {}
  };

  const handleSignup = async () => {
    const clean = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
      setSignupState('error');
      return;
    }
    setSignupState('loading');
    try {
      const res = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: clean }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setSignupCount(data.total);
      setSignupState(data.alreadyRegistered ? 'duplicate' : 'success');
      setEmail('');
    } catch {
      setSignupState('error');
    }
  };

  const showHome = !preview && !searchedTerm && !loading && !result;
  const displayImage = preview || result?.image_url;

  return (
    <main className="min-h-screen bg-yellow-300 text-black flex flex-col items-center px-4 py-8">
      <header className="text-center mb-8">
        <h1 className="text-5xl sm:text-6xl font-black tracking-tight">
          🍌 howmanybananas
        </h1>
        <p className="mt-2 text-lg font-medium">
          measure anything. unit: banana.
        </p>
      </header>

      {showHome && (
        <>
          <div className="w-full max-w-md flex flex-col items-center gap-5">
            <label className="cursor-pointer bg-black text-yellow-300 font-bold py-6 px-10 rounded-full text-xl shadow-lg active:scale-95 transition-transform">
              📷 upload a pic
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
            </label>
            <div className="flex items-center gap-3 w-full max-w-xs">
              <div className="flex-1 h-0.5 bg-black opacity-30" />
              <span className="font-bold text-sm opacity-60">OR</span>
              <div className="flex-1 h-0.5 bg-black opacity-30" />
            </div>
            <div className="w-full flex gap-2">
              <input
                type="text"
                value={inputQuery}
                onChange={(e) => setInputQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSearch();
                }}
                placeholder="type anything (blue whale, school bus...)"
                className="flex-1 min-w-0 px-4 py-3 rounded-full border-4 border-black bg-white font-medium placeholder:opacity-50 focus:outline-none focus:ring-2 focus:ring-black"
              />
              <button
                onClick={handleSearch}
                disabled={!inputQuery.trim()}
                className="bg-black text-yellow-300 font-bold px-6 rounded-full active:scale-95 transition-transform disabled:opacity-40"
              >
                go
              </button>
            </div>
          </div>

          {history.length > 0 && (
            <section className="w-full max-w-md mt-10">
              <div className="flex justify-between items-center mb-3">
                <h2 className="font-bold uppercase text-sm tracking-wider">
                  recent measurements
                </h2>
                <button
                  onClick={clearHistory}
                  className="text-xs underline opacity-60"
                >
                  clear
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {history.slice(0, 6).map((item) => {
                  const img = item.image_url || item.thumbnail;
                  return (
                    <button
                      key={item.id}
                      onClick={() => loadHistoryItem(item)}
                      className="bg-white border-2 border-black rounded-xl overflow-hidden text-left active:scale-95 transition-transform"
                    >
                      <div className="aspect-square bg-yellow-100 flex items-center justify-center overflow-hidden">
                        {img ? (
                          <img
                            src={img}
                            alt={item.object}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="text-3xl">🍌</span>
                        )}
                      </div>
                      <div className="p-2">
                        <div className="text-xs font-bold truncate">
                          {item.object}
                        </div>
                        <div className="text-[10px] opacity-70 mt-0.5">
                          {formatNum(item.height_bananas)} 🍌 tall
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          )}
        </>
      )}

      {!showHome && (
        <div className="w-full max-w-md flex flex-col items-center gap-5">
          {displayImage ? (
            <img
              src={displayImage}
              alt={result?.object || 'measurement'}
              className="w-full rounded-2xl shadow-xl border-4 border-black max-h-[60vh] object-contain bg-white"
            />
          ) : searchedTerm ? (
            <div className="w-full bg-white border-4 border-black rounded-2xl p-8 text-center shadow-xl">
              <div className="text-xs font-bold uppercase tracking-wider opacity-60 mb-2">
                searched
              </div>
              <div className="text-3xl font-black break-words">
                🔍 "{searchedTerm}"
              </div>
            </div>
          ) : null}

          {loading && (
            <div className="text-2xl font-bold animate-pulse">
              measuring in bananas...
            </div>
          )}

          {error && (
            <div className="bg-red-500 text-white p-4 rounded-xl font-bold text-center">
              {error}
            </div>
          )}

          {result && (
            <div className="bg-white border-4 border-black rounded-2xl p-5 w-full shadow-xl">
              <div className="text-sm font-bold uppercase tracking-wider opacity-60">
                {result.object}
              </div>

              <div className="grid grid-cols-3 gap-2 mt-3">
                {[
                  {
                    label: 'height',
                    real: result.real_height,
                    val: result.height_bananas,
                  },
                  {
                    label: 'width',
                    real: result.real_width,
                    val: result.width_bananas,
                  },
                  {
                    label: 'weight',
                    real: result.real_weight,
                    val: result.weight_bananas,
                  },
                ].map((s) => (
                  <div
                    key={s.label}
                    className="bg-yellow-300 border-2 border-black rounded-xl p-2 text-center overflow-hidden"
                  >
                    <div className="text-[10px] font-bold uppercase opacity-70">
                      {s.label}
                    </div>
                    <div
                      className="text-[11px] font-bold mt-1 truncate"
                      title={s.real}
                    >
                      {s.real}
                    </div>
                    <div className="text-xs opacity-50">↓</div>
                    <div className="text-xl font-black leading-tight whitespace-nowrap">
                      {formatNum(s.val)}
                    </div>
                    <div className="text-base">🍌</div>
                  </div>
                ))}
              </div>

              <p className="mt-4 text-base italic border-t-2 border-black pt-3">
                "{result.deadpan}"
              </p>
            </div>
          )}

          {result && (
            <div className="flex gap-2 w-full">
              <button
                onClick={handleShare}
                className="flex-1 bg-black text-yellow-300 font-bold py-3 rounded-full active:scale-95 transition-transform"
              >
                {shareMsg ?? '📤 share'}
              </button>
              <button
                onClick={reset}
                className="flex-1 bg-white border-2 border-black font-bold py-3 rounded-full active:scale-95 transition-transform"
              >
                📷 measure another
              </button>
            </div>
          )}

          {!result && !loading && (
            <button
              onClick={reset}
              className="bg-black text-yellow-300 font-bold py-3 px-8 rounded-full active:scale-95 transition-transform"
            >
              back
            </button>
          )}
        </div>
      )}

      <section className="w-full max-w-md mt-12 bg-black text-yellow-300 rounded-2xl p-6 border-4 border-black shadow-xl">
        <div className="text-xs font-bold uppercase tracking-widest opacity-70">
          pocket built
        </div>
        <h2 className="text-2xl font-black mt-1 leading-tight">
          one app a day, built from a phone.
        </h2>
        <p className="mt-2 text-sm opacity-80">
          Get notified when the next build drops.
          {signupCount !== null && signupCount > 0 && (
            <span className="font-bold"> {signupCount} signed up so far.</span>
          )}
        </p>

        {signupState === 'success' ? (
          <div className="mt-4 bg-yellow-300 text-black p-3 rounded-xl font-bold text-center">
            ✅ check your email
          </div>
        ) : signupState === 'duplicate' ? (
          <div className="mt-4 bg-yellow-300 text-black p-3 rounded-xl font-bold text-center">
            🍌 already on the list
          </div>
        ) : (
          <div className="mt-4 flex gap-2">
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (signupState === 'error') setSignupState('idle');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSignup();
              }}
              placeholder="your@email.com"
              className="flex-1 min-w-0 px-4 py-3 rounded-full text-black font-medium placeholder:opacity-50 focus:outline-none focus:ring-2 focus:ring-yellow-300"
            />
            <button
              onClick={handleSignup}
              disabled={signupState === 'loading'}
              className="bg-yellow-300 text-black font-bold px-5 rounded-full active:scale-95 transition-transform disabled:opacity-50"
            >
              {signupState === 'loading' ? '...' : 'join'}
            </button>
          </div>
        )}
        {signupState === 'error' && (
          <p className="mt-2 text-xs text-red-400">
            Something broke — try again.
          </p>
        )}
      </section>

      <footer className="mt-auto pt-12 text-sm opacity-60">
        day 1 of pocket built
      </footer>
    </main>
  );
}

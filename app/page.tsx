'use client';

import { useState } from 'react';

interface Result {
  height_bananas: number;
  width_bananas: number;
  weight_bananas: number;
  object: string;
  deadpan: string;
}

async function resizeImage(
  file: File,
  maxDim = 1280
): Promise<{ base64: string; mediaType: string }> {
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
        resolve({ base64, mediaType: 'image/jpeg' });
      };
      img.onerror = () => reject(new Error('Image load failed'));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error('Read failed'));
    reader.readAsDataURL(file);
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

export default function Home() {
  const [preview, setPreview] = useState<string | null>(null);
  const [searchedTerm, setSearchedTerm] = useState<string | null>(null);
  const [inputQuery, setInputQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runAnalyze = async (body: Record<string, unknown>) => {
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
      const data = await res.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something broke');
    } finally {
      setLoading(false);
    }
  };

  const handleFile = async (file: File) => {
    setSearchedTerm(null);
    try {
      const { base64, mediaType } = await resizeImage(file);
      setPreview(`data:${mediaType};base64,${base64}`);
      await runAnalyze({ image: base64, mediaType });
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
    await runAnalyze({ query: q });
  };

  const reset = () => {
    setPreview(null);
    setSearchedTerm(null);
    setInputQuery('');
    setResult(null);
    setError(null);
  };

  const showHome = !preview && !searchedTerm && !loading;

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
      )}

      {(preview || searchedTerm || loading) && (
        <div className="w-full max-w-md flex flex-col items-center gap-6">
          {preview && (
            <img
              src={preview}
              alt="upload"
              className="w-full rounded-2xl shadow-xl border-4 border-black"
            />
          )}

          {!preview && searchedTerm && (
            <div className="w-full bg-white border-4 border-black rounded-2xl p-8 text-center shadow-xl">
              <div className="text-xs font-bold uppercase tracking-wider opacity-60 mb-2">
                searched
              </div>
              <div className="text-3xl font-black break-words">
                🔍 "{searchedTerm}"
              </div>
            </div>
          )}

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
                  { label: 'height', val: result.height_bananas },
                  { label: 'width', val: result.width_bananas },
                  { label: 'weight', val: result.weight_bananas },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="bg-yellow-300 border-2 border-black rounded-xl p-2 text-center overflow-hidden"
                  >
                    <div className="text-[10px] font-bold uppercase opacity-70">
                      {stat.label}
                    </div>
                    <div className="text-2xl font-black leading-tight whitespace-nowrap">
                      {formatNum(stat.val)}
                    </div>
                    <div className="text-base">🍌</div>
                  </div>
                ))}
              </div>

              <p className="mt-4 text-lg italic border-t-2 border-black pt-3">
                "{result.deadpan}"
              </p>
            </div>
          )}

          <button
            onClick={reset}
            className="bg-black text-yellow-300 font-bold py-3 px-8 rounded-full active:scale-95 transition-transform"
          >
            measure another
          </button>
        </div>
      )}

      <footer className="mt-auto pt-12 text-sm opacity-60">
        day 1 of pocket built
      </footer>
    </main>
  );
}

'use client';

import { useState } from 'react';

interface Result {
  bananas: number;
  object: string;
  deadpan: string;
}

export default function Home() {
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFile = (file: File) => {
    setError(null);
    setResult(null);

    const reader = new FileReader();
    reader.onloadend = async () => {
      const dataUrl = reader.result as string;
      setPreview(dataUrl);

      const [header, base64] = dataUrl.split(',');
      const mediaType = header.match(/data:(.*?);/)?.[1] || 'image/jpeg';

      setLoading(true);
      try {
        const res = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: base64, mediaType }),
        });
        if (!res.ok) throw new Error('Analysis failed');
        const data = await res.json();
        setResult(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something broke');
      } finally {
        setLoading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const reset = () => {
    setPreview(null);
    setResult(null);
    setError(null);
  };

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

      {!preview && (
        <label className="cursor-pointer bg-black text-yellow-300 font-bold py-6 px-10 rounded-full text-xl shadow-lg active:scale-95 transition-transform">
          upload a pic
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
      )}

      {preview && (
        <div className="w-full max-w-md flex flex-col items-center gap-6">
          <img
            src={preview}
            alt="upload"
            className="w-full rounded-2xl shadow-xl border-4 border-black"
          />

          {loading && (
            <div className="text-2xl font-bold animate-pulse">
              measuring in bananas...
            </div>
          )}

          {error && (
            <div className="bg-red-500 text-white p-4 rounded-xl font-bold">
              {error}
            </div>
          )}

          {result && (
            <div className="bg-white border-4 border-black rounded-2xl p-6 w-full shadow-xl">
              <div className="text-sm font-bold uppercase tracking-wider opacity-60">
                {result.object}
              </div>
              <div className="text-6xl font-black my-2">
                {result.bananas} 🍌
              </div>
              <div className="text-2xl leading-tight">
                {Array.from({
                  length: Math.min(Math.round(result.bananas), 20),
                }).map((_, i) => (
                  <span key={i}>🍌</span>
                ))}
                {result.bananas > 20 && (
                  <span className="text-base ml-2 font-bold">+ more</span>
                )}
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

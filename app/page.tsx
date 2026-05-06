'use client';

import { useState } from 'react';

interface Result {
  height_bananas: number;
  width_bananas: number;
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

export default function Home() {
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    setError(null);
    setResult(null);
    setLoading(true);

    try {
      const { base64, mediaType } = await resizeImage(file);
      setPreview(`data:${mediaType};base64,${base64}`);

      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64, mediaType }),
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

      {!preview && !loading && (
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

      {(preview || loading) && (
        <div className="w-full max-w-md flex flex-col items-center gap-6">
          {preview && (
            <img
              src={preview}
              alt="upload"
              className="w-full rounded-2xl shadow-xl border-4 border-black"
            />
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
            <div className="bg-white border-4 border-black rounded-2xl p-6 w-full shadow-xl">
              <div className="text-sm font-bold uppercase tracking-wider opacity-60">
                {result.object}
              </div>

              <div className="grid grid-cols-2 gap-3 mt-3">
                <div className="bg-yellow-300 border-2 border-black rounded-xl p-3 text-center">
                  <div className="text-xs font-bold uppercase opacity-70">
                    height
                  </div>
                  <div className="text-4xl font-black">
                    {result.height_bananas}
                  </div>
                  <div className="text-xl">🍌</div>
                </div>
                <div className="bg-yellow-300 border-2 border-black rounded-xl p-3 text-center">
                  <div className="text-xs font-bold uppercase opacity-70">
                    width
                  </div>
                  <div className="text-4xl font-black">
                    {result.width_bananas}
                  </div>
                  <div className="text-xl">🍌</div>
                </div>
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

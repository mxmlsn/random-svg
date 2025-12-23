'use client';

import { useState } from 'react';

interface SVGData {
  title: string;
  previewImage: string;
  source: string;
  sourceUrl: string;
  downloadUrl: string;
}

export default function Home() {
  const [svgItems, setSvgItems] = useState<SVGData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRandomSVGs = async () => {
    setLoading(true);
    setError(null);

    try {
      // Fetch 6 SVGs in parallel
      const promises = Array(6).fill(null).map(() => fetch('/api/random-svg'));
      const responses = await Promise.all(promises);
      const data = await Promise.all(responses.map(res => res.json()));

      // Filter out errors
      const validData = data.filter((item, index) => {
        if (!responses[index].ok) {
          console.error('Failed to fetch SVG:', item.error);
          return false;
        }
        return true;
      });

      if (validData.length === 0) {
        throw new Error('Failed to fetch any SVG images');
      }

      setSvgItems(validData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen p-4 md:p-8" style={{ backgroundColor: '#F7F7F7' }}>
      <div className="max-w-7xl mx-auto">
        <header className="text-center mb-8">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-800 mb-2">
            Random SVG
          </h1>
          <p className="text-gray-600">
            Discover random SVG images from across the web
          </p>
        </header>

        <div className="flex justify-center mb-8">
          <button
            onClick={fetchRandomSVGs}
            disabled={loading}
            className="px-8 py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-all transform hover:scale-105 disabled:transform-none disabled:cursor-not-allowed"
          >
            {loading ? 'Loading...' : 'Get Random SVGs'}
          </button>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-8">
            <p className="font-semibold">Error:</p>
            <p>{error}</p>
          </div>
        )}

        {svgItems.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {svgItems.map((item, index) => (
              <a
                key={index}
                href={item.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block border border-[#D9D9D9] rounded-lg p-6 hover:border-gray-400 transition-colors cursor-pointer"
              >
                <div className="flex justify-center items-center min-h-[300px]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.previewImage}
                    alt={item.title}
                    className="max-w-full max-h-[300px] object-contain"
                  />
                </div>
              </a>
            ))}
          </div>
        )}

        {svgItems.length === 0 && !loading && !error && (
          <div className="text-center text-gray-500">
            <svg className="w-24 h-24 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-lg">Click the button above to load random SVGs</p>
          </div>
        )}
      </div>
    </div>
  );
}

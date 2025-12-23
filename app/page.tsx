'use client';

import { useState } from 'react';
import Image from 'next/image';

interface SVGData {
  title: string;
  previewImage: string;
  source: string;
  sourceUrl: string;
  downloadUrl: string;
}

export default function Home() {
  const [svgData, setSvgData] = useState<SVGData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRandomSVG = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/random-svg');
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch SVG');
      }

      setSvgData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 dark:from-gray-900 dark:to-gray-800 p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <header className="text-center mb-8">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-800 dark:text-white mb-2">
            Random SVG
          </h1>
          <p className="text-gray-600 dark:text-gray-300">
            Discover random SVG images from across the web
          </p>
        </header>

        <div className="flex justify-center mb-8">
          <button
            onClick={fetchRandomSVG}
            disabled={loading}
            className="px-8 py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold rounded-lg shadow-lg transition-all transform hover:scale-105 disabled:transform-none disabled:cursor-not-allowed"
          >
            {loading ? 'Loading...' : 'Get Random SVG'}
          </button>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-8">
            <p className="font-semibold">Error:</p>
            <p>{error}</p>
          </div>
        )}

        {svgData && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-8">
            <div className="mb-6">
              <h2 className="text-2xl font-semibold text-gray-800 dark:text-white mb-2">
                {svgData.title}
              </h2>
              <div className="flex flex-wrap gap-4 text-sm text-gray-600 dark:text-gray-400">
                <span className="flex items-center gap-1">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z"/>
                    <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z"/>
                  </svg>
                  Source: {svgData.source}
                </span>
                <a
                  href={svgData.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 dark:text-blue-400 hover:underline"
                >
                  View on {svgData.source}
                </a>
                <a
                  href={svgData.downloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-green-600 dark:text-green-400 hover:underline"
                >
                  Download SVG
                </a>
              </div>
            </div>

            <div className="flex justify-center items-center bg-gray-50 dark:bg-gray-700 rounded-lg p-8 min-h-[400px]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={svgData.previewImage}
                alt={svgData.title}
                className="max-w-full max-h-[600px] object-contain"
              />
            </div>
          </div>
        )}

        {!svgData && !loading && !error && (
          <div className="text-center text-gray-500 dark:text-gray-400">
            <svg className="w-24 h-24 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-lg">Click the button above to load a random SVG</p>
          </div>
        )}
      </div>
    </div>
  );
}

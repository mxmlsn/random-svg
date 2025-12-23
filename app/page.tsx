'use client';

import { useState } from 'react';

interface SVGData {
  title: string;
  previewImage: string;
  source: string;
  sourceUrl: string;
  downloadUrl: string;
}

type SourceType = 'freesvg' | 'publicdomainvectors';

export default function Home() {
  const [svgItems, setSvgItems] = useState<SVGData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSources, setSelectedSources] = useState<SourceType[]>(['freesvg', 'publicdomainvectors']);

  const toggleSource = (source: SourceType) => {
    setSelectedSources(prev => {
      if (prev.includes(source)) {
        // Don't allow deselecting if it's the only one selected
        if (prev.length === 1) return prev;
        return prev.filter(s => s !== source);
      } else {
        return [...prev, source];
      }
    });
  };

  const fetchRandomSVGs = async () => {
    if (selectedSources.length === 0) {
      setError('Please select at least one source');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Determine which endpoints to use based on selected sources
      const endpoints: string[] = [];

      if (selectedSources.length === 1) {
        // If only one source is selected, fetch all 6 from it
        const endpoint = selectedSources[0] === 'freesvg' ? '/api/random-svg' : '/api/random-svg-pdv';
        endpoints.push(...Array(6).fill(endpoint));
      } else {
        // If both sources are selected, fetch 3 from each
        endpoints.push(
          ...Array(3).fill('/api/random-svg'),
          ...Array(3).fill('/api/random-svg-pdv')
        );
      }

      // Fetch SVGs in parallel
      const promises = endpoints.map(endpoint => fetch(endpoint));
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

        <div className="flex flex-col items-center gap-6 mb-8">
          {/* Source Selection Checkboxes */}
          <div className="flex gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedSources.includes('freesvg')}
                onChange={() => toggleSource('freesvg')}
                className="w-4 h-4 cursor-pointer"
              />
              <span className="text-gray-700">freesvg.org</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedSources.includes('publicdomainvectors')}
                onChange={() => toggleSource('publicdomainvectors')}
                className="w-4 h-4 cursor-pointer"
              />
              <span className="text-gray-700">publicdomainvectors.org</span>
            </label>
          </div>

          {/* Get Random SVGs Button */}
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
              <div
                key={index}
                className="relative border border-[#D9D9D9] rounded-lg p-6 hover:border-gray-400 transition-colors group"
              >
                <a
                  href={item.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block"
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

                {/* Download button overlay */}
                <a
                  href={item.downloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="absolute top-3 right-3 bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Download SVG"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                </a>
              </div>
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

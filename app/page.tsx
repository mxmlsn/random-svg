'use client';

import { useState, useEffect } from 'react';
import Gallery from './components/Gallery';
import SubmitModal from './components/SubmitModal';

interface SVGData {
  title: string;
  previewImage: string;
  source: string;
  sourceUrl: string;
  downloadUrl: string;
}

type SourceType = 'freesvg' | 'publicdomainvectors' | 'wikimedia';

export default function Home() {
  const [svgItems, setSvgItems] = useState<(SVGData | null)[]>(Array(6).fill(null));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSources, setSelectedSources] = useState<SourceType[]>(['freesvg', 'publicdomainvectors', 'wikimedia']);
  const [initialLoad, setInitialLoad] = useState(true);
  const [history, setHistory] = useState<(SVGData | null)[][]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [submitModalOpen, setSubmitModalOpen] = useState(false);

  // Load SVGs on initial mount
  useEffect(() => {
    if (initialLoad) {
      fetchRandomSVGs();
      setInitialLoad(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    const emptySlots = Array(6).fill(null);
    setSvgItems(emptySlots); // Reset to 6 empty slots

    try {
      // Determine which endpoints to use based on selected sources
      const endpoints: string[] = [];

      const sourceToEndpoint: Record<SourceType, string> = {
        'freesvg': '/api/random-svg',
        'publicdomainvectors': '/api/random-svg-pdv',
        'wikimedia': '/api/random-svg-wikimedia'
      };

      if (selectedSources.length === 1) {
        // If only one source is selected, fetch all 6 from it
        const endpoint = sourceToEndpoint[selectedSources[0]];
        endpoints.push(...Array(6).fill(endpoint));
      } else if (selectedSources.length === 2) {
        // If two sources are selected, fetch 3 from each
        endpoints.push(
          ...Array(3).fill(sourceToEndpoint[selectedSources[0]]),
          ...Array(3).fill(sourceToEndpoint[selectedSources[1]])
        );
      } else {
        // If all three sources are selected, fetch 2 from each
        endpoints.push(
          ...Array(2).fill(sourceToEndpoint['freesvg']),
          ...Array(2).fill(sourceToEndpoint['publicdomainvectors']),
          ...Array(2).fill(sourceToEndpoint['wikimedia'])
        );
      }

      let newItems = [...emptySlots];

      // Fetch SVGs and show them as they arrive in their respective slots
      const fetchPromises = endpoints.map(async (endpoint, index) => {
        try {
          const response = await fetch(endpoint);
          if (response.ok) {
            const data = await response.json();
            // Update specific slot
            setSvgItems(prev => {
              const updated = [...prev];
              updated[index] = data;
              newItems = updated;
              return updated;
            });
            return data;
          } else {
            console.error('Failed to fetch SVG from', endpoint);
            return null;
          }
        } catch (err) {
          console.error('Error fetching from', endpoint, err);
          return null;
        }
      });

      // Wait for all to complete
      await Promise.all(fetchPromises);

      // Add to history after all items are fetched
      setHistory(prev => {
        const newHistory = prev.slice(0, historyIndex + 1);
        newHistory.push([...newItems]);
        return newHistory;
      });
      setHistoryIndex(prev => prev + 1);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setSvgItems([...history[newIndex]]);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setSvgItems([...history[newIndex]]);
    }
  };

  return (
    <div className="flex flex-col min-h-screen" style={{ backgroundColor: '#F7F7F7' }}>
      {/* Header */}
      <header className="flex items-center justify-between px-8 py-6 border-b border-gray-300">
        <h1 className="text-3xl font-bold text-gray-800">
          Random SVG
        </h1>
        <a
          href="https://random-dafont.vercel.app/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-gray-700 hover:text-gray-900 font-medium transition-colors"
        >
          random-dafont.com →
        </a>
      </header>

      {/* Main Content */}
      <div className="flex flex-1 min-h-[600px]">
        {/* Left Sidebar - Source Selection */}
        <aside className="w-80 p-6 flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-gray-700 mb-2">Sources</h2>

          <label
            className="flex items-center gap-3 p-4 border border-gray-300 rounded-lg cursor-pointer hover:border-gray-400 transition-colors"
            style={{ backgroundColor: selectedSources.includes('freesvg') ? '#F7F7F7' : 'transparent' }}
          >
            <input
              type="checkbox"
              checked={selectedSources.includes('freesvg')}
              onChange={() => toggleSource('freesvg')}
              className="w-5 h-5 cursor-pointer"
            />
            <span className="text-gray-700 font-medium">freesvg.org</span>
          </label>

          <label
            className="flex items-center gap-3 p-4 border border-gray-300 rounded-lg cursor-pointer hover:border-gray-400 transition-colors"
            style={{ backgroundColor: selectedSources.includes('publicdomainvectors') ? '#F7F7F7' : 'transparent' }}
          >
            <input
              type="checkbox"
              checked={selectedSources.includes('publicdomainvectors')}
              onChange={() => toggleSource('publicdomainvectors')}
              className="w-5 h-5 cursor-pointer"
            />
            <span className="text-gray-700 font-medium">publicdomainvectors.org</span>
          </label>

          <label
            className="flex items-center gap-3 p-4 border border-gray-300 rounded-lg cursor-pointer hover:border-gray-400 transition-colors"
            style={{ backgroundColor: selectedSources.includes('wikimedia') ? '#F7F7F7' : 'transparent' }}
          >
            <input
              type="checkbox"
              checked={selectedSources.includes('wikimedia')}
              onChange={() => toggleSource('wikimedia')}
              className="w-5 h-5 cursor-pointer"
            />
            <span className="text-gray-700 font-medium">wikimedia.org</span>
          </label>

          {/* Undo/Redo buttons */}
          <div className="flex items-center justify-center gap-3 mt-4">
            <button
              onClick={handleUndo}
              disabled={historyIndex <= 0}
              className="w-10 h-10 rounded-full border border-gray-300 flex items-center justify-center hover:border-gray-400 transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:border-gray-300"
              title="Undo"
            >
              <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>
            <button
              onClick={handleRedo}
              disabled={historyIndex >= history.length - 1}
              className="w-10 h-10 rounded-full border border-gray-300 flex items-center justify-center hover:border-gray-400 transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:border-gray-300"
              title="Redo"
            >
              <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </button>
          </div>
        </aside>

        {/* Right Content Area - SVG Grid */}
        <main className="flex-1 p-6 relative">
          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
              <p className="font-semibold">Error:</p>
              <p>{error}</p>
            </div>
          )}

          {/* Static Grid - Always 6 slots */}
          <div className="h-full grid grid-cols-3 grid-rows-2 gap-4">
            {svgItems.map((item, index) => (
              <div
                key={index}
                className="relative border border-[#D9D9D9] rounded-lg p-4 hover:border-gray-400 transition-colors group overflow-hidden"
                style={{ minHeight: '0' }}
              >
                {item ? (
                  <>
                    <a
                      href={item.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block h-full"
                    >
                      <div className="flex justify-center items-center h-full">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={item.source === 'wikimedia.org'
                            ? item.previewImage
                            : `/api/proxy-image?url=${encodeURIComponent(item.previewImage)}`
                          }
                          alt={item.title}
                          className="max-w-full max-h-full object-contain"
                        />
                      </div>
                    </a>

                    {/* Download button overlay - for all sources */}
                    <a
                      href={item.downloadUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="absolute top-3 right-3 text-white p-2 rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ backgroundColor: '#C6D000' }}
                      title="Download SVG"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                    </a>
                  </>
                ) : null}
              </div>
            ))}
          </div>

          {/* Circular Update Button - Centered over grid */}
          <button
            onClick={fetchRandomSVGs}
            disabled={loading}
            className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full text-white font-semibold shadow-2xl transition-all hover:scale-110 disabled:bg-gray-400 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center justify-center z-10"
            style={{ backgroundColor: loading ? undefined : '#C6D000' }}
            title={loading ? 'Loading...' : 'Update SVGs'}
          >
            <svg
              className={`w-8 h-8 ${loading ? 'animate-spin' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
        </main>
      </div>

      {/* Gallery Section */}
      <Gallery onSubmitClick={() => setSubmitModalOpen(true)} />

      {/* Submit Modal */}
      <SubmitModal
        isOpen={submitModalOpen}
        onClose={() => setSubmitModalOpen(false)}
      />
    </div>
  );
}

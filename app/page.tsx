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
  _debug_source?: 'live' | 'pool'; // DEBUG: убрать позже
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
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#F7F7F7' }}>
      {/* Left Column - 30% */}
      <aside style={{ width: '30%', padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {/* Logo */}
        <div style={{ marginBottom: '16px', textAlign: 'center' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#1f2937' }}>Random SVG</h1>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '18px 12px',
              border: '1px solid #d1d5db',
              borderRadius: '9999px',
              cursor: 'pointer',
              backgroundColor: selectedSources.includes('freesvg') ? '#F7F7F7' : 'transparent'
            }}
          >
            <input
              type="checkbox"
              checked={selectedSources.includes('freesvg')}
              onChange={() => toggleSource('freesvg')}
              style={{ width: '16px', height: '16px', cursor: 'pointer' }}
            />
            <span style={{ color: '#374151', fontSize: '14px' }}>freesvg.org</span>
          </label>

          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '18px 12px',
              border: '1px solid #d1d5db',
              borderRadius: '9999px',
              cursor: 'pointer',
              backgroundColor: selectedSources.includes('publicdomainvectors') ? '#F7F7F7' : 'transparent'
            }}
          >
            <input
              type="checkbox"
              checked={selectedSources.includes('publicdomainvectors')}
              onChange={() => toggleSource('publicdomainvectors')}
              style={{ width: '16px', height: '16px', cursor: 'pointer' }}
            />
            <span style={{ color: '#374151', fontSize: '14px' }}>publicdomainvectors.org</span>
          </label>

          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '18px 12px',
              border: '1px solid #d1d5db',
              borderRadius: '9999px',
              cursor: 'pointer',
              backgroundColor: selectedSources.includes('wikimedia') ? '#F7F7F7' : 'transparent'
            }}
          >
            <input
              type="checkbox"
              checked={selectedSources.includes('wikimedia')}
              onChange={() => toggleSource('wikimedia')}
              style={{ width: '16px', height: '16px', cursor: 'pointer' }}
            />
            <span style={{ color: '#374151', fontSize: '14px' }}>wikimedia.org</span>
          </label>
        </div>

        {/* Undo/Redo buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={handleUndo}
            disabled={historyIndex <= 0}
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '9999px',
              border: '1px solid #d1d5db',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: historyIndex <= 0 ? 'not-allowed' : 'pointer',
              opacity: historyIndex <= 0 ? 0.3 : 1,
              backgroundColor: 'transparent'
            }}
            title="Undo"
          >
            <svg style={{ width: '20px', height: '20px', color: '#374151' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <button
            onClick={handleRedo}
            disabled={historyIndex >= history.length - 1}
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '9999px',
              border: '1px solid #d1d5db',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: historyIndex >= history.length - 1 ? 'not-allowed' : 'pointer',
              opacity: historyIndex >= history.length - 1 ? 0.3 : 1,
              backgroundColor: 'transparent'
            }}
            title="Redo"
          >
            <svg style={{ width: '20px', height: '20px', color: '#374151' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </button>
        </div>

        {/* Info Card */}
        <div style={{ marginTop: 'auto', padding: '16px', backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
          <p style={{ fontSize: '12px', color: '#6b7280' }}>
            Public domain SVG images from free sources. Click to view source, hover for download.
          </p>
        </div>
      </aside>

      {/* Right Column - 70% */}
      <main style={{ width: '70%', display: 'flex', flexDirection: 'column' }}>
        {/* SVG Grid */}
        <div style={{ flex: 1, position: 'relative', padding: '52px 52px 0 0' }}>
          {error && (
            <div style={{
              position: 'absolute',
              top: '24px',
              left: '24px',
              right: '24px',
              backgroundColor: '#fee2e2',
              border: '1px solid #f87171',
              color: '#b91c1c',
              padding: '12px 16px',
              borderRadius: '4px',
              zIndex: 20
            }}>
              <p style={{ fontWeight: '600' }}>Error:</p>
              <p>{error}</p>
            </div>
          )}

          {/* Static Grid - Always 6 slots with fixed layout */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gridTemplateRows: 'repeat(2, 1fr)',
              gap: '32px',
              height: '100%'
            }}
          >
            {svgItems.map((item, index) => (
              <div
                key={index}
                className="svg-cell"
                style={{
                  position: 'relative',
                  border: '1px solid #D9D9D9',
                  borderRadius: '20px',
                  overflow: 'hidden',
                  aspectRatio: '10/11'
                }}
              >
                {item ? (
                  <>
                    <a
                      href={item.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        position: 'absolute',
                        top: '16px',
                        right: '16px',
                        bottom: '16px',
                        left: '16px',
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center'
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/proxy-image?url=${encodeURIComponent(item.previewImage)}`}
                        alt={item.title}
                        style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                      />
                    </a>

                    {/* Download button overlay - for all sources */}
                    <a
                      href={item.downloadUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="download-btn"
                      style={{
                        position: 'absolute',
                        top: '12px',
                        right: '12px',
                        color: 'white',
                        padding: '8px',
                        borderRadius: '8px',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                        opacity: 0,
                        transition: 'opacity 0.2s',
                        zIndex: 10,
                        backgroundColor: '#C6D000'
                      }}
                      title="Download SVG"
                    >
                      <svg style={{ width: '16px', height: '16px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                    </a>

                    {/* DEBUG: метка источника для wikimedia - убрать позже */}
                    {item._debug_source && (
                      <span style={{
                        position: 'absolute',
                        bottom: '8px',
                        left: '8px',
                        fontSize: '12px',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        backgroundColor: item._debug_source === 'live' ? '#22c55e' : '#f97316',
                        color: 'white'
                      }}>
                        {item._debug_source}
                      </span>
                    )}
                  </>
                ) : null}
              </div>
            ))}
          </div>

          {/* Circular Update Button - Centered over grid */}
          <button
            onClick={fetchRandomSVGs}
            disabled={loading}
            style={{
              position: 'absolute',
              top: 'calc(50% + 26px)',
              left: 'calc(50% - 26px)',
              transform: 'translate(-50%, -50%)',
              width: '80px',
              height: '80px',
              borderRadius: '9999px',
              color: 'white',
              fontWeight: '600',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 10,
              backgroundColor: loading ? '#9ca3af' : '#C6D000',
              cursor: loading ? 'not-allowed' : 'pointer',
              border: 'none'
            }}
            title={loading ? 'Loading...' : 'Update SVGs'}
          >
            <svg
              style={{ width: '40px', height: '40px', animation: loading ? 'spin 1s linear infinite' : 'none' }}
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
        </div>

        {/* Gallery Section */}
        <Gallery onSubmitClick={() => setSubmitModalOpen(true)} />
      </main>

      {/* Submit Modal */}
      <SubmitModal
        isOpen={submitModalOpen}
        onClose={() => setSubmitModalOpen(false)}
      />

      <style jsx>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .svg-cell:hover .download-btn {
          opacity: 1 !important;
        }
      `}</style>
    </div>
  );
}

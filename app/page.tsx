'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Gallery from './components/Gallery';
import SubmitModal from './components/SubmitModal';

interface SVGData {
  title: string;
  previewImage: string;
  originalSvgUrl?: string;
  source: string;
  sourceUrl: string;
  downloadUrl: string;
  _debug_source?: 'live' | 'archive';  // live = from Wikimedia API, archive = from local cache
}

type SourceType = 'freesvg' | 'publicdomainvectors' | 'wikimedia';

// Акцентный цвет - меняй здесь
const ACCENT_COLOR = '#f8c52bff';

// Hook for detecting mobile
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return isMobile;
}

export default function Home() {
  const [svgItems, setSvgItems] = useState<(SVGData | null)[]>(Array(6).fill(null));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSources, setSelectedSources] = useState<SourceType[]>(['freesvg', 'publicdomainvectors', 'wikimedia']);
  const [initialLoad, setInitialLoad] = useState(true);
  const [history, setHistory] = useState<(SVGData | null)[][]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [submitModalOpen, setSubmitModalOpen] = useState(false);
  const isMobile = useIsMobile();
  const [logoSvgs, setLogoSvgs] = useState<string[]>(Array(6).fill(''));
  const [logoRotations, setLogoRotations] = useState<number[]>(Array(6).fill(0));
  const [logoDirections, setLogoDirections] = useState<number[]>(() =>
    Array(6).fill(0).map(() => Math.random() > 0.5 ? 1 : -1)
  );
  const [logoVisibility, setLogoVisibility] = useState<boolean[]>(Array(6).fill(true));
  const [showWarning, setShowWarning] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [wikiCooldown, setWikiCooldown] = useState(0); // seconds remaining until live wiki
  const wikiCooldownRef = useRef(0); // ref for callbacks to access current cooldown
  const [wikiGlow, setWikiGlow] = useState(false); // glow effect when cooldown ends
  const prevCooldownRef = useRef(0); // track previous cooldown for transition detection
  const wikiCooldownEndRef = useRef(0); // client-side timestamp when cooldown ends (survives server restarts)
  const [downloadBtnOpacities, setDownloadBtnOpacities] = useState<number[]>(Array(6).fill(0));
  const shownArchiveFilesRef = useRef<Set<string>>(new Set()); // Track shown wiki archive files to avoid repeats (ref for sync access)
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [updateBtnHovered, setUpdateBtnHovered] = useState(false);
  const [updateBtnSpinning, setUpdateBtnSpinning] = useState(false);
  const [updateBtnRotation, setUpdateBtnRotation] = useState(0);
  const updateBtnAnimationRef = useRef<number | null>(null);
  const updateBtnSpeedRef = useRef(0); // Current speed in deg/frame
  const btnRefs = useRef<(HTMLAnchorElement | null)[]>([]);

  // Animation constants
  const SPIN_SPEED = 6; // degrees per frame at 60fps
  const DECEL_DURATION = 100; // ms to slow down

  // Start spinning
  const startSpinning = useCallback(() => {
    if (updateBtnAnimationRef.current) return;
    setUpdateBtnSpinning(true);
    updateBtnSpeedRef.current = SPIN_SPEED;

    const animate = () => {
      setUpdateBtnRotation(prev => prev + updateBtnSpeedRef.current);
      updateBtnAnimationRef.current = requestAnimationFrame(animate);
    };
    updateBtnAnimationRef.current = requestAnimationFrame(animate);
  }, []);

  // Stop spinning with deceleration
  const stopSpinning = useCallback(() => {
    if (!updateBtnAnimationRef.current) return;

    const startSpeed = updateBtnSpeedRef.current;
    const startTime = performance.now();

    const decelerate = () => {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(elapsed / DECEL_DURATION, 1);
      // Ease-out deceleration
      const easeOut = 1 - Math.pow(1 - progress, 2);
      updateBtnSpeedRef.current = startSpeed * (1 - easeOut);

      setUpdateBtnRotation(prev => prev + updateBtnSpeedRef.current);

      if (progress < 1) {
        updateBtnAnimationRef.current = requestAnimationFrame(decelerate);
      } else {
        // Fully stopped
        if (updateBtnAnimationRef.current) {
          cancelAnimationFrame(updateBtnAnimationRef.current);
          updateBtnAnimationRef.current = null;
        }
        setUpdateBtnSpinning(false);
        updateBtnSpeedRef.current = 0;
      }
    };

    // Cancel current animation and start deceleration
    if (updateBtnAnimationRef.current) {
      cancelAnimationFrame(updateBtnAnimationRef.current);
    }
    updateBtnAnimationRef.current = requestAnimationFrame(decelerate);
  }, []);

  const handleCardMouseMove = useCallback((e: React.MouseEvent, index: number) => {
    const card = cardRefs.current[index];
    const btn = btnRefs.current[index];
    if (!card || !btn) return;

    const btnRect = btn.getBoundingClientRect();
    const btnCenterX = btnRect.left + btnRect.width / 2;
    const btnCenterY = btnRect.top + btnRect.height / 2;

    const distance = Math.sqrt(
      Math.pow(e.clientX - btnCenterX, 2) + Math.pow(e.clientY - btnCenterY, 2)
    );

    const cardRect = card.getBoundingClientRect();
    const maxDistance = Math.sqrt(Math.pow(cardRect.width, 2) + Math.pow(cardRect.height, 2));

    // 10px radius = full opacity, then fade based on distance
    let opacity: number;
    if (distance <= 10) {
      opacity = 1;
    } else {
      // Linear fade from 1 to 0.15 based on distance (10px to maxDistance)
      opacity = Math.max(0.15, 1 - (distance - 10) / (maxDistance - 10));
    }

    setDownloadBtnOpacities(prev => {
      const newOpacities = [...prev];
      newOpacities[index] = opacity;
      return newOpacities;
    });
  }, []);

  const handleCardMouseLeave = useCallback((index: number) => {
    setDownloadBtnOpacities(prev => {
      const newOpacities = [...prev];
      newOpacities[index] = 0;
      return newOpacities;
    });
  }, []);

  const handleDownload = useCallback(async (item: SVGData, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Determine the correct download URL based on source
    let downloadUrl = item.downloadUrl;

    if (item.source === 'wikimedia.org') {
      // For wikimedia, use proxy to download the actual SVG
      const svgUrl = item.originalSvgUrl || item.previewImage;
      if (item.previewImage.startsWith('/wikimedia-archive/')) {
        // Archive file - download directly
        downloadUrl = item.previewImage;
      } else {
        downloadUrl = `/api/download-wikimedia?url=${encodeURIComponent(svgUrl)}`;
      }
    } else if (item.source === 'publicdomainvectors.org') {
      // For PDV, use proxy
      if (item.downloadUrl.includes('download.php')) {
        downloadUrl = `/api/download-pdv?url=${encodeURIComponent(item.downloadUrl)}`;
      }
    }
    // For freesvg.org, downloadUrl is already correct (/api/download-freesvg?id=...)

    // Trigger download
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = '';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, []);

  // Load logo SVGs
  useEffect(() => {
    const fetchLogoSvgs = async () => {
      const res = await fetch('/api/random-logo-svg?count=6');
      const data = await res.json();
      const svgs = data.map((item: { content: string }) => item.content);
      setLogoSvgs(svgs);
    };
    fetchLogoSvgs();
  }, []);

  // Load SVGs on initial mount
  useEffect(() => {
    if (initialLoad) {
      fetchRandomSVGs();
      setInitialLoad(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Check server for initial cooldown status (once on mount)
  useEffect(() => {
    const checkInitialStatus = async () => {
      try {
        const res = await fetch('/api/wikimedia-status');
        if (res.ok) {
          const data = await res.json();
          if (data.secondsRemaining > 0 && data.limitedUntil) {
            wikiCooldownEndRef.current = data.limitedUntil;
            setWikiCooldown(data.secondsRemaining);
            wikiCooldownRef.current = data.secondsRemaining;
          }
        }
      } catch {
        // Ignore errors on initial check
      }
    };
    checkInitialStatus();
  }, []);

  // Client-side countdown timer (no server requests)
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    const tick = () => {
      const now = Date.now();
      const secondsRemaining = wikiCooldownEndRef.current > now
        ? Math.ceil((wikiCooldownEndRef.current - now) / 1000)
        : 0;

      // Detect transition from >0 to 0 for glow effect (only if wikimedia is NOT selected)
      if (prevCooldownRef.current > 0 && secondsRemaining === 0 && !selectedSources.includes('wikimedia')) {
        setWikiGlow(true);
        setTimeout(() => setWikiGlow(false), 1000);
      }

      prevCooldownRef.current = secondsRemaining;
      setWikiCooldown(secondsRemaining);
      wikiCooldownRef.current = secondsRemaining;

      // Stop interval when cooldown ends
      if (secondsRemaining === 0 && interval) {
        clearInterval(interval);
        interval = null;
      }
    };

    // Only start interval if there's an active cooldown
    if (wikiCooldownEndRef.current > Date.now()) {
      tick();
      interval = setInterval(tick, 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [selectedSources, wikiCooldown > 0]);

  const toggleSource = (source: SourceType) => {
    setSelectedSources(prev => {
      if (prev.includes(source)) {
        // Don't allow deselecting if it's the only one selected
        if (prev.length === 1) return prev;
        const newSources = prev.filter(s => s !== source);
        // Show warning when going from 3 to 2 sources
        if (prev.length === 3 && newSources.length === 2) {
          setShowWarning(true);
          // After fade in animation completes, wait 2 seconds at full opacity, then fade out over 6 seconds
          setTimeout(() => {
            const warningEl = document.getElementById('sources-warning');
            if (warningEl) {
              warningEl.style.animation = 'fadeOutSlow 6s ease-out forwards';
            }
          }, 2200); // 200ms fade in + 2000ms pause
          // Remove warning from DOM after all animations complete
          setTimeout(() => {
            setShowWarning(false);
          }, 8200); // 200ms + 2000ms + 6000ms
        }
        return newSources;
      } else {
        return [...prev, source];
      }
    });
  };

  const fetchRandomSVGs = async (overrideSources?: SourceType[]) => {
    const sources = overrideSources || selectedSources;
    if (sources.length === 0) {
      setError('Please select at least one source');
      return;
    }

    // Rotate logos by ~25.7 degrees (360/14) in their random directions
    setLogoRotations(prev => prev.map((rot, i) => rot + logoDirections[i] * (360 / 14)));

    // Start update button spinning
    startSpinning();

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

      if (sources.length === 1) {
        // If only one source is selected, fetch all 6 from it
        const endpoint = sourceToEndpoint[sources[0]];
        endpoints.push(...Array(6).fill(endpoint));
      } else if (sources.length === 2) {
        // If two sources are selected, fetch 3 from each
        endpoints.push(
          ...Array(3).fill(sourceToEndpoint[sources[0]]),
          ...Array(3).fill(sourceToEndpoint[sources[1]])
        );
      } else {
        // If all three sources are selected, fetch 2 from each
        // Order: publicdomainvectors (1-2), freesvg (3-4), wikimedia (5-6)
        endpoints.push(
          ...Array(2).fill(sourceToEndpoint['publicdomainvectors']),
          ...Array(2).fill(sourceToEndpoint['freesvg']),
          ...Array(2).fill(sourceToEndpoint['wikimedia'])
        );
      }

      let newItems = [...emptySlots];

      // Pre-select archive items for wikimedia slots to prevent duplicates
      // This happens BEFORE parallel fetches start, ensuring unique selection
      const wikiArchiveSelections: Map<number, { title: string; filename: string; wikimediaUrl: string } | null> = new Map();
      if (wikiCooldownRef.current > 0) {
        const wikiIndices = endpoints.map((e, i) => e.includes('wikimedia') ? i : -1).filter(i => i >= 0);
        if (wikiIndices.length > 0) {
          try {
            const archiveRes = await fetch('/wikimedia-archive/index.json');
            if (archiveRes.ok) {
              const archive = await archiveRes.json();
              if (archive.length > 0) {
                // Select unique items for each wiki slot
                for (const idx of wikiIndices) {
                  let availableItems = archive.filter((item: { filename: string }) => !shownArchiveFilesRef.current.has(item.filename));

                  // If all files have been shown, reset the tracking
                  if (availableItems.length === 0) {
                    shownArchiveFilesRef.current = new Set();
                    availableItems = archive;
                  }

                  const randomItem = availableItems[Math.floor(Math.random() * availableItems.length)];
                  shownArchiveFilesRef.current.add(randomItem.filename);
                  wikiArchiveSelections.set(idx, randomItem);
                }
              }
            }
          } catch {
            // Archive fetch failed, will be handled per-slot
          }
        }
      }

      // Fetch SVGs with staggered timing for wikimedia to avoid rate limits
      const fetchPromises = endpoints.map(async (endpoint, index) => {
        // During cooldown, skip wikimedia API requests - use pre-selected archive item
        if (endpoint.includes('wikimedia') && wikiCooldownRef.current > 0) {
          // Add staggered delay for archive loading (similar to live mode feel)
          await new Promise(resolve => setTimeout(resolve, 300 + index * 300));

          const preSelectedItem = wikiArchiveSelections.get(index);
          if (preSelectedItem) {
            const archiveData = {
              title: preSelectedItem.title,
              previewImage: `/wikimedia-archive/${preSelectedItem.filename}`,
              source: 'wikimedia.org',
              sourceUrl: preSelectedItem.wikimediaUrl,
              downloadUrl: preSelectedItem.wikimediaUrl,
              _debug_source: 'archive' as const
            };
            setSvgItems(prev => {
              const updated = [...prev];
              updated[index] = archiveData;
              newItems = updated;
              return updated;
            });
            return archiveData;
          }
          return null;
        }

        // Add delay for wikimedia requests to avoid CDN rate limits (500ms between each)
        if (endpoint.includes('wikimedia')) {
          await new Promise(resolve => setTimeout(resolve, index * 500));
        }
        try {
          const response = await fetch(endpoint);
          if (response.ok) {
            const data = await response.json();

            // If wikimedia returned archive, set client-side cooldown timer
            if (endpoint.includes('wikimedia') && data._debug_source === 'archive') {
              // Set 60 second cooldown from now on client side
              wikiCooldownEndRef.current = Date.now() + 60 * 1000;
              setWikiCooldown(60);
              wikiCooldownRef.current = 60;
            }

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
      // Stop update button spinning after 500ms delay
      setTimeout(() => {
        stopSpinning();
      }, 500);
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

  // Mobile Layout
  if (isMobile) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#F4F4F4', padding: '4px' }}>
        {/* 1. Logo */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '16px 0 12px' }}>
          <div dangerouslySetInnerHTML={{ __html: `<svg width="120" height="70" viewBox="0 0 181 105" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M106.153 102.483C98.5441 102.483 93.0339 98.3507 94.7959 92.2478C95.6608 89.0442 98.6722 85.8886 103.782 83.8543C105.304 83.1976 105.688 82.2205 105.031 81.2274C103.718 79.1931 104.118 76.2457 107.402 73.9552C108.443 73.2343 108.571 72.049 107.851 71.3923C104.775 68.5731 103.99 64.6326 105.095 60.9004C106.617 55.5184 111.983 50.6649 119.672 50.6649C123.676 50.6649 125.118 51.8983 126.624 51.8983C127.28 51.8983 129.042 51.8342 130.949 51.5779C136.074 50.793 134.761 56.111 131.141 55.3101C128.594 54.7975 126.88 55.6465 127.28 58.4016C127.537 60.0995 127.409 61.7494 126.944 63.3192C125.374 68.8294 119.736 73.1543 113.04 73.1543C111.983 73.1543 111.326 73.3625 110.606 74.0192C108.571 75.8453 108.443 78.28 111.134 79.5935L117.574 82.8131C122.491 85.2319 123.869 88.916 122.876 92.3279C121.37 97.5658 114.418 102.483 106.153 102.483ZM100.835 91.2066C99.5853 95.5956 101.828 100.385 107.594 100.385C112.448 100.385 116.052 97.1814 117.045 93.7695C117.83 91.0144 116.917 88.1151 113.697 86.6094L110.285 85.0397C108.78 84.3188 107.466 84.447 106.089 85.1037C103.269 86.4813 101.555 88.7719 100.835 91.2066ZM110.606 62.4702C109.372 66.9232 109.693 71.2 113.008 71.2C116.644 71.2 119.928 66.2024 121.306 61.413C122.619 56.96 122.219 52.6992 118.855 52.6992C115.267 52.6992 111.983 57.6808 110.606 62.4702Z" fill="black"/>
<path d="M82.4929 84.6392C80.7149 86.225 79.2733 85.5042 79.2733 83.534C79.2092 79.129 79.1451 74.2114 78.8088 61.6212C78.7447 57.9371 77.8957 56.2392 76.5502 56.2392C75.5411 56.2392 74.3557 57.2163 72.85 59.5229C71.4725 61.4771 69.4382 60.3078 70.4794 58.4016C73.8912 52.4269 77.0468 50.6649 79.2092 50.6649C83.1497 50.6649 83.8705 55.5184 83.9986 59.9073C84.2549 69.9506 84.319 73.2343 84.3991 76.3739C84.4631 78.1519 85.8407 78.8727 87.2823 77.1588C88.0352 76.3418 88.756 75.5249 89.4287 74.724C92.6804 70.8637 94.971 67.2436 96.0122 63.7196C96.7971 61.0286 96.5888 59.9714 94.4905 57.873C93.0488 56.4955 92.7285 54.7975 93.1129 53.42C93.5774 51.8342 94.8909 50.6649 96.7971 50.6649C101.25 50.6649 101.122 56.8318 99.8085 61.2208C98.527 65.7539 95.5316 70.8637 90.4859 76.5981C89.7811 77.399 89.0283 78.216 88.2434 79.0489C86.5135 80.8589 84.6073 82.717 82.4929 84.6392Z" fill="black"/>
<path d="M51.3528 85.4241C47.6046 85.4241 44.0005 84.2548 43.8724 81.3555C43.8083 79.5935 45.1218 77.8796 47.0279 77.8796C48.2613 77.8796 49.1904 78.5363 49.9112 79.8498C52.2018 83.9184 57.8401 83.598 59.0895 79.8498C60.0826 76.9666 57.9843 73.5547 54.3642 69.358C50.8242 65.2253 49.6389 61.8775 50.632 58.5938C52.0736 53.9966 57.5198 50.6649 62.3092 50.6649C66.8423 50.6649 69.5974 53.7404 68.2198 56.4955C67.0986 58.6579 64.4075 58.722 62.7737 56.2392C60.7394 53.0836 56.0141 53.0195 55.085 56.3673C54.5084 58.4016 55.4214 61.413 59.3618 66.0102C63.2222 70.6715 65.0643 74.0833 63.8149 77.8796C62.4373 82.2846 57.3275 85.4241 51.3528 85.4241Z" fill="black"/>
<path d="M177.282 11.9275V46.4818H167.409V34.141H162.473V46.4818H157.537V34.141H152.6V46.4818H146.019V11.9275H177.282Z" fill="black"/>
<path d="M132.861 11.9275L142.734 24.2683V34.141L132.861 46.4818H121.343L111.471 34.141V24.2683L121.343 11.9275H132.861ZM122.166 34.141H132.039V24.2683H122.166V34.141Z" fill="black"/>
<path d="M96.6723 11.9275V2.05481H108.19V46.4818H94.2041L81.8633 34.141V24.2683L96.6723 11.9275ZM91.736 34.141H100.786V24.2683H91.736V34.141Z" fill="black"/>
<path d="M78.584 11.9275V46.4818H68.7113V34.141H58.8386V46.4818H52.2568V11.9275H78.584Z" fill="black"/>
<path d="M27.5918 11.9275H48.9826V46.4818H34.1736L27.5918 34.141L37.4645 24.2683H27.5918V11.9275ZM43.2235 39.0773V29.2047H38.2872V39.0773H43.2235Z" fill="black"/>
<path d="M24.3166 11.9275V34.141H14.4439V24.2683H9.50756V46.4818H2.92578V11.9275H24.3166Z" fill="black"/>
</svg>` }} />
        </div>

        {/* 2. SVG Cards - 2 per row, 3 rows */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '4px',
          padding: '0'
        }}>
          {svgItems.map((item, index) => (
            <div
              key={index}
              ref={(el) => { cardRefs.current[index] = el; }}
              style={{
                position: 'relative',
                border: '1px solid #DEDEDE',
                borderRadius: '12px',
                overflow: 'hidden',
                aspectRatio: '1/1',
                backgroundColor: '#fff'
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
                      top: '8px',
                      right: '8px',
                      bottom: '8px',
                      left: '8px',
                      display: 'flex',
                      justifyContent: 'center',
                      alignItems: 'center'
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={
                        item.previewImage.startsWith('/wikimedia-archive/')
                          ? item.previewImage
                          : `/api/proxy-image?url=${encodeURIComponent(item.previewImage)}`
                      }
                      alt={item.title}
                      loading="lazy"
                      style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                    />
                  </a>

                  {/* Archive indicator */}
                  {item.source === 'wikimedia.org' && item._debug_source === 'archive' && (
                    <div
                      style={{
                        position: 'absolute',
                        top: '8px',
                        left: '8px',
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        backgroundColor: '#9ca3af',
                        zIndex: 10
                      }}
                    />
                  )}

                  {/* Download button */}
                  <button
                    onClick={(e) => handleDownload(item, e)}
                    style={{
                      position: 'absolute',
                      bottom: '6px',
                      right: '6px',
                      color: 'black',
                      padding: '8px',
                      borderRadius: '10px',
                      zIndex: 10,
                      backgroundColor: ACCENT_COLOR,
                      border: 'none',
                      cursor: 'pointer'
                    }}
                  >
                    <svg width="20" height="20" viewBox="0 0 66 66" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path fillRule="evenodd" clipRule="evenodd" d="M9.58678 31.5308C9.58305 31.4999 9.59243 31.4793 9.59976 31.4668C9.7731 31.1711 16.1797 30.9809 24.1942 30.9041V8.3548H41.8135V30.9041C49.8281 30.9809 56.2345 31.1711 56.408 31.4668C56.8762 32.2656 33.947 55.6279 33.0094 55.6279C32.0877 55.6279 9.83342 33.4778 9.58634 31.5307L9.58678 31.5308Z" fill="#D4A109"/>
                      <path fillRule="evenodd" clipRule="evenodd" d="M25.5027 9.99382C25.475 17.0333 25.5579 24.0845 25.4618 31.1163C25.058 32.3747 23.424 32.3993 22.3428 32.2262C18.8556 32.3311 15.361 32.2577 11.8809 32.5429C17.6577 39.3635 24.1476 45.5622 30.5375 51.7788C31.3458 52.5326 32.1714 53.2559 33.0084 53.9783C40.4143 47.1803 47.3607 39.8976 54.1211 32.4565C49.5834 32.3131 45.0435 32.2638 40.5043 32.1907V9.66588H25.5018V9.82951V9.99313L25.5027 9.99382Z" fill="#FFEEBC"/>
                    </svg>
                  </button>
                </>
              ) : null}
            </div>
          ))}
        </div>

        {/* 3. Controls - Undo/Redo left, Update center */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
          padding: '16px 0'
        }}>
          {/* Undo button */}
          <button
            onClick={handleUndo}
            disabled={historyIndex <= 0}
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '9999px',
              border: '1px solid #DEDEDE',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: historyIndex <= 0 ? 'not-allowed' : 'pointer',
              opacity: historyIndex <= 0 ? 0.3 : 1,
              backgroundColor: 'transparent'
            }}
          >
            <svg style={{ width: '16px', height: '16px', transform: 'rotate(90deg)' }} viewBox="0 0 26 26" fill="none">
              <path d="M1 13.2188L12.9674 25.1862L24.9371 13.2165" stroke="#AEAEAE" strokeWidth="1" strokeLinecap="round"/>
              <path d="M12.9683 1.61304L12.9683 25.2298" stroke="#AEAEAE" strokeWidth="1" strokeLinecap="round"/>
            </svg>
          </button>

          {/* Redo button */}
          <button
            onClick={handleRedo}
            disabled={historyIndex >= history.length - 1}
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '9999px',
              border: '1px solid #DEDEDE',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: historyIndex >= history.length - 1 ? 'not-allowed' : 'pointer',
              opacity: historyIndex >= history.length - 1 ? 0.3 : 1,
              backgroundColor: 'transparent'
            }}
          >
            <svg style={{ width: '16px', height: '16px', transform: 'rotate(-90deg)' }} viewBox="0 0 26 26" fill="none">
              <path d="M1 13.2188L12.9674 25.1862L24.9371 13.2165" stroke="#AEAEAE" strokeWidth="1" strokeLinecap="round"/>
              <path d="M12.9683 1.61304L12.9683 25.2298" stroke="#AEAEAE" strokeWidth="1" strokeLinecap="round"/>
            </svg>
          </button>

          {/* Update button */}
          <button
            onClick={() => fetchRandomSVGs()}
            disabled={loading}
            style={{
              width: '60px',
              height: '60px',
              borderRadius: '9999px',
              color: 'black',
              fontWeight: '600',
              boxShadow: updateBtnSpinning ? '0 15px 40px -8px rgba(193, 193, 193, 0.6)' : '0 15px 40px -8px rgba(248, 197, 43, 0.6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: updateBtnSpinning ? '#C1C1C1' : ACCENT_COLOR,
              cursor: loading ? 'not-allowed' : 'pointer',
              border: updateBtnSpinning ? '2px solid #bdbdbd' : '2px solid #F3C233',
              overflow: 'visible'
            }}
          >
            <img
              src="/upd_icon.svg?v=2"
              alt="Update"
              style={{
                width: '75px',
                height: '75px',
                maxWidth: 'none',
                transform: `rotate(${updateBtnRotation}deg)`,
                pointerEvents: 'none'
              }}
            />
          </button>
        </div>

        {/* 4. Checkboxes - 3 rows, one per row */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '0 0 16px' }}>
          {/* publicdomainvectors */}
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              height: '56px',
              padding: '0 8px',
              border: '1px solid #DEDEDE',
              borderRadius: '9999px',
              cursor: 'pointer',
              backgroundColor: 'transparent'
            }}
          >
            <input
              type="checkbox"
              checked={selectedSources.includes('publicdomainvectors')}
              onChange={() => toggleSource('publicdomainvectors')}
              style={{ display: 'none' }}
            />
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '9999px',
              backgroundColor: selectedSources.includes('publicdomainvectors') ? ACCENT_COLOR : 'transparent',
              border: selectedSources.includes('publicdomainvectors') ? 'none' : '1px solid #DEDEDE',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              {selectedSources.includes('publicdomainvectors') && (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M5 12L10 17L19 8" stroke="black" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </div>
            <div style={{ flex: 1, textAlign: 'center', marginRight: '8px' }}>
              <div style={{ fontFamily: 'HealTheWeb, Arial', fontSize: '12px', color: selectedSources.includes('publicdomainvectors') ? '#374151' : '#9ca3af' }}>publicdomainvectors.org</div>
            </div>
          </label>

          {/* freesvg */}
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              height: '56px',
              padding: '0 8px',
              border: '1px solid #DEDEDE',
              borderRadius: '9999px',
              cursor: 'pointer',
              backgroundColor: 'transparent'
            }}
          >
            <input
              type="checkbox"
              checked={selectedSources.includes('freesvg')}
              onChange={() => toggleSource('freesvg')}
              style={{ display: 'none' }}
            />
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '9999px',
              backgroundColor: selectedSources.includes('freesvg') ? ACCENT_COLOR : 'transparent',
              border: selectedSources.includes('freesvg') ? 'none' : '1px solid #DEDEDE',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              {selectedSources.includes('freesvg') && (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M5 12L10 17L19 8" stroke="black" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </div>
            <div style={{ flex: 1, textAlign: 'center', marginRight: '8px' }}>
              <div style={{ fontFamily: 'HealTheWeb, Arial', fontSize: '12px', color: selectedSources.includes('freesvg') ? '#374151' : '#9ca3af' }}>freesvg.org</div>
            </div>
          </label>

          {/* wikimedia */}
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              height: '56px',
              padding: '0 8px',
              border: '1px solid #DEDEDE',
              borderRadius: '9999px',
              cursor: 'pointer',
              backgroundColor: 'transparent'
            }}
          >
            <input
              type="checkbox"
              checked={selectedSources.includes('wikimedia')}
              onChange={() => toggleSource('wikimedia')}
              style={{ display: 'none' }}
            />
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '9999px',
              backgroundColor: selectedSources.includes('wikimedia') ? ACCENT_COLOR : 'transparent',
              border: selectedSources.includes('wikimedia') ? 'none' : '1px solid #DEDEDE',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              {selectedSources.includes('wikimedia') && (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M5 12L10 17L19 8" stroke="black" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </div>
            <div style={{ flex: 1, textAlign: 'center', marginRight: '8px' }}>
              <div style={{ fontFamily: 'HealTheWeb, Arial', fontSize: '12px', color: selectedSources.includes('wikimedia') ? '#374151' : '#9ca3af' }}>wikimedia.org</div>
              {wikiCooldown > 0 && (
                <div style={{ fontFamily: 'monospace', fontSize: '10px', color: '#9ca3af' }}>
                  cached ({wikiCooldown}s)
                </div>
              )}
            </div>
          </label>
        </div>

        {/* 5. Yellow and Red cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '0 0 16px' }}>
          {/* Submit Card (Yellow) */}
          <div
            style={{
              background: ACCENT_COLOR,
              borderRadius: '16px',
              padding: '16px',
              textAlign: 'center'
            }}
          >
            <p style={{ fontFamily: 'HealTheWeb, Arial', fontSize: '12px', color: 'black', marginBottom: '8px' }}>
              free website to get random SVG&apos;s and share posters
            </p>
            <button
              onClick={() => setSubmitModalOpen(true)}
              style={{
                color: 'black',
                textDecoration: 'underline',
                fontFamily: 'HealTheWeb, Arial',
                fontSize: '24px',
                fontWeight: 400,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '8px 0'
              }}
            >
              SUBMIT MY WORK
            </button>
            <p style={{ fontFamily: 'HealTheWeb, Arial', fontSize: '11px', color: 'black', marginTop: '8px' }}>
              made by{' '}
              <a href="https://instagram.com/mxmlsn" target="_blank" rel="noopener noreferrer" style={{ color: 'black', textDecoration: 'underline' }}>
                @mxmlsn
              </a>
            </p>
          </div>

          {/* Random Dafont Card (Red) */}
          <a
            href="https://random-dafont.vercel.app/"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              background: '#c00',
              borderRadius: '16px',
              padding: '16px',
              textAlign: 'center',
              textDecoration: 'none'
            }}
          >
            <p style={{ fontFamily: 'HealTheWeb, Arial', fontSize: '12px', color: 'white', textDecoration: 'underline' }}>
              random-dafont.com
            </p>
          </a>
        </div>

        {/* 6. Gallery */}
        <Gallery />

        {/* Submit Modal */}
        <SubmitModal
          isOpen={submitModalOpen}
          onClose={() => setSubmitModalOpen(false)}
        />
      </div>
    );
  }

  // Desktop Layout
  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#F4F4F4' }}>
      {/* Left Column - 30% */}
      <aside style={{ width: '30%', padding: '36px', opacity: isMinimized ? 0.1 : 1, transition: 'opacity 0.3s', minHeight: '100vh' }}>
        {/* Logo */}
        <div style={{ marginTop: '30px', marginBottom: '72px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{
            transform: logoVisibility.filter((_, i) => i !== 2).every(v => !v) ? 'scale(1.70)' : 'scale(1)',
            transformOrigin: 'top center',
            transition: 'transform 0.2s ease-out'
          }} dangerouslySetInnerHTML={{ __html: `<svg width="181" height="105" viewBox="0 0 181 105" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M106.153 102.483C98.5441 102.483 93.0339 98.3507 94.7959 92.2478C95.6608 89.0442 98.6722 85.8886 103.782 83.8543C105.304 83.1976 105.688 82.2205 105.031 81.2274C103.718 79.1931 104.118 76.2457 107.402 73.9552C108.443 73.2343 108.571 72.049 107.851 71.3923C104.775 68.5731 103.99 64.6326 105.095 60.9004C106.617 55.5184 111.983 50.6649 119.672 50.6649C123.676 50.6649 125.118 51.8983 126.624 51.8983C127.28 51.8983 129.042 51.8342 130.949 51.5779C136.074 50.793 134.761 56.111 131.141 55.3101C128.594 54.7975 126.88 55.6465 127.28 58.4016C127.537 60.0995 127.409 61.7494 126.944 63.3192C125.374 68.8294 119.736 73.1543 113.04 73.1543C111.983 73.1543 111.326 73.3625 110.606 74.0192C108.571 75.8453 108.443 78.28 111.134 79.5935L117.574 82.8131C122.491 85.2319 123.869 88.916 122.876 92.3279C121.37 97.5658 114.418 102.483 106.153 102.483ZM100.835 91.2066C99.5853 95.5956 101.828 100.385 107.594 100.385C112.448 100.385 116.052 97.1814 117.045 93.7695C117.83 91.0144 116.917 88.1151 113.697 86.6094L110.285 85.0397C108.78 84.3188 107.466 84.447 106.089 85.1037C103.269 86.4813 101.555 88.7719 100.835 91.2066ZM110.606 62.4702C109.372 66.9232 109.693 71.2 113.008 71.2C116.644 71.2 119.928 66.2024 121.306 61.413C122.619 56.96 122.219 52.6992 118.855 52.6992C115.267 52.6992 111.983 57.6808 110.606 62.4702Z" fill="black"/>
<path d="M82.4929 84.6392C80.7149 86.225 79.2733 85.5042 79.2733 83.534C79.2092 79.129 79.1451 74.2114 78.8088 61.6212C78.7447 57.9371 77.8957 56.2392 76.5502 56.2392C75.5411 56.2392 74.3557 57.2163 72.85 59.5229C71.4725 61.4771 69.4382 60.3078 70.4794 58.4016C73.8912 52.4269 77.0468 50.6649 79.2092 50.6649C83.1497 50.6649 83.8705 55.5184 83.9986 59.9073C84.2549 69.9506 84.319 73.2343 84.3991 76.3739C84.4631 78.1519 85.8407 78.8727 87.2823 77.1588C88.0352 76.3418 88.756 75.5249 89.4287 74.724C92.6804 70.8637 94.971 67.2436 96.0122 63.7196C96.7971 61.0286 96.5888 59.9714 94.4905 57.873C93.0488 56.4955 92.7285 54.7975 93.1129 53.42C93.5774 51.8342 94.8909 50.6649 96.7971 50.6649C101.25 50.6649 101.122 56.8318 99.8085 61.2208C98.527 65.7539 95.5316 70.8637 90.4859 76.5981C89.7811 77.399 89.0283 78.216 88.2434 79.0489C86.5135 80.8589 84.6073 82.717 82.4929 84.6392Z" fill="black"/>
<path d="M51.3528 85.4241C47.6046 85.4241 44.0005 84.2548 43.8724 81.3555C43.8083 79.5935 45.1218 77.8796 47.0279 77.8796C48.2613 77.8796 49.1904 78.5363 49.9112 79.8498C52.2018 83.9184 57.8401 83.598 59.0895 79.8498C60.0826 76.9666 57.9843 73.5547 54.3642 69.358C50.8242 65.2253 49.6389 61.8775 50.632 58.5938C52.0736 53.9966 57.5198 50.6649 62.3092 50.6649C66.8423 50.6649 69.5974 53.7404 68.2198 56.4955C67.0986 58.6579 64.4075 58.722 62.7737 56.2392C60.7394 53.0836 56.0141 53.0195 55.085 56.3673C54.5084 58.4016 55.4214 61.413 59.3618 66.0102C63.2222 70.6715 65.0643 74.0833 63.8149 77.8796C62.4373 82.2846 57.3275 85.4241 51.3528 85.4241Z" fill="black"/>
<path d="M177.282 11.9275V46.4818H167.409V34.141H162.473V46.4818H157.537V34.141H152.6V46.4818H146.019V11.9275H177.282Z" fill="black"/>
<path d="M132.861 11.9275L142.734 24.2683V34.141L132.861 46.4818H121.343L111.471 34.141V24.2683L121.343 11.9275H132.861ZM122.166 34.141H132.039V24.2683H122.166V34.141Z" fill="black"/>
<path d="M96.6723 11.9275V2.05481H108.19V46.4818H94.2041L81.8633 34.141V24.2683L96.6723 11.9275ZM91.736 34.141H100.786V24.2683H91.736V34.141Z" fill="black"/>
<path d="M78.584 11.9275V46.4818H68.7113V34.141H58.8386V46.4818H52.2568V11.9275H78.584Z" fill="black"/>
<path d="M27.5918 11.9275H48.9826V46.4818H34.1736L27.5918 34.141L37.4645 24.2683H27.5918V11.9275ZM43.2235 39.0773V29.2047H38.2872V39.0773H43.2235Z" fill="black"/>
<path d="M24.3166 11.9275V34.141H14.4439V24.2683H9.50756V46.4818H2.92578V11.9275H24.3166Z" fill="black"/>
</svg>` }} />
          {/* Logo SVG row */}
          <div style={{ display: 'flex', height: '90px', overflow: 'visible', alignItems: 'flex-end', marginTop: '-21px', marginLeft: '20px' }}>
            {logoSvgs.filter((_, i) => i !== 2).map((svg, index) => {
              const originalIndex = index >= 2 ? index + 1 : index;
              const offsetY = (originalIndex === 0 || originalIndex === 5) ? -80 : (originalIndex === 1 || originalIndex === 4) ? -41 : 0;
              const processedSvg = svg.replace(/<svg([^>]*)>/, (_, attrs) => {
                const widthMatch = attrs.match(/width="([^"]*)"/);
                const heightMatch = attrs.match(/height="([^"]*)"/);
                const hasViewBox = attrs.includes('viewBox');
                let newAttrs = attrs
                  .replace(/width="[^"]*"/, '')
                  .replace(/height="[^"]*"/, '');
                if (!hasViewBox && widthMatch && heightMatch) {
                  newAttrs += ` viewBox="0 0 ${widthMatch[1]} ${heightMatch[1]}"`;
                }
                return `<svg${newAttrs} style="height:90px;width:auto">`;
              });
              return (
                <div
                  key={originalIndex}
                  onClick={() => {
                    setIsMinimized(false);
                    const allHidden = logoVisibility.every(v => !v);
                    if (allHidden) {
                      setLogoVisibility([true, true, true, true, true, true]);
                    } else {
                      setLogoVisibility([false, false, false, false, false, false]);
                    }
                  }}
                  className="logo-svg-container"
                style={{
                    width: '70px',
                    height: '90px',
                    overflow: 'visible',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transform: `translateY(${offsetY}px) rotate(${logoRotations[originalIndex]}deg)`,
                    marginLeft: '-20px',
                    transition: 'transform 0.1s ease-out, opacity 0.15s ease-out',
                    opacity: logoVisibility[originalIndex] ? 1 : 0,
                    cursor: 'pointer',
                    ['--offset-y' as string]: `${offsetY}px`,
                    ['--rotation' as string]: `${logoRotations[originalIndex]}deg`
                  }}
                  dangerouslySetInnerHTML={{ __html: processedSvg }}
                />
              );
            })}
          </div>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '19px' }}>
          <label
            className="checkbox-label"
            onClick={() => setIsMinimized(false)}
            style={{
              display: 'flex',
              alignItems: 'center',
              height: '86px',
              padding: '0 10px',
              border: '1px solid #DEDEDE',
              borderRadius: '9999px',
              cursor: 'pointer',
              backgroundColor: 'transparent',
              transition: 'background-color 0.2s'
            }}
          >
            <input
              type="checkbox"
              checked={selectedSources.includes('publicdomainvectors')}
              onChange={() => toggleSource('publicdomainvectors')}
              style={{ display: 'none' }}
            />
            <div className="checkbox-circle" style={{
              width: '66px',
              height: '66px',
              borderRadius: '9999px',
              backgroundColor: selectedSources.includes('publicdomainvectors') ? 'transparent' : 'transparent',
              border: selectedSources.includes('publicdomainvectors') ? 'none' : '1px solid #DEDEDE',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              overflow: 'hidden'
            }}>
              {selectedSources.includes('publicdomainvectors') && (
                <svg width="66" height="66" viewBox="0 0 62 62" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ position: 'absolute', top: 0, left: 0 }}>
                  <g clipPath="url(#clip_pdv)">
                    <path d="M30.0213 61.5779C29.0628 61.539 28.8311 47.7634 29.5037 30.8095C30.1764 13.8556 31.4987 0.142953 32.4572 0.181816" stroke="#EAC147" strokeWidth="0.310379"/>
                    <path d="M25.3516 61.0203C20.9601 60.1436 20.0361 45.9383 23.2883 29.2923C26.5404 12.6463 32.7371 -0.137373 37.1286 0.739388" stroke="#EAC147" strokeWidth="0.310379"/>
                    <path d="M20.2735 59.5323C13.1028 56.7279 12.1997 41.6262 18.2559 25.802C24.3121 9.97787 35.0344 -0.577048 42.2051 2.2274" stroke="#EAC147" strokeWidth="0.310373"/>
                    <path d="M14.5018 56.5222C5.84077 50.7451 6.31344 34.5813 15.5573 20.4195C24.8012 6.25775 39.316 -0.539591 47.977 5.23753" stroke="#EAC147" strokeWidth="0.310367"/>
                    <path d="M8.08684 50.7817C0.0815238 41.2647 3.95774 24.6391 16.7446 13.6477C29.5315 2.65635 46.3872 1.46111 54.3926 10.978" stroke="#EAC147" strokeWidth="0.310378"/>
                    <path d="M2.45591 40.7404C-1.87599 27.8184 7.49937 12.9284 23.396 7.48262C39.2927 2.03684 55.6913 8.0973 60.0233 21.0193" stroke="#EAC147" strokeWidth="0.310377"/>
                    <path d="M1.07324 27.162C2.7331 13.3991 17.585 3.90657 34.2457 5.95989C50.9063 8.01321 63.0671 20.8349 61.4072 34.5978" stroke="#EAC147" strokeWidth="0.310365"/>
                    <path d="M5.18359 15.0674C11.8747 3.80032 28.9647 1.74604 43.355 10.4789C57.7452 19.2118 63.9868 35.4252 57.2957 46.6923" stroke="#EAC147" strokeWidth="0.310368"/>
                    <path d="M11.5527 7.47491C20.2367 0.0103402 36.0908 4.43805 46.9638 17.3641C57.8368 30.2902 59.6116 46.8202 50.9277 54.2848" stroke="#EAC147" strokeWidth="0.310378"/>
                    <path d="M17.6787 3.38556C25.7514 -0.683293 38.3671 8.32803 45.8565 23.5126C53.346 38.6971 52.8733 54.3053 44.8006 58.3742" stroke="#EAC147" strokeWidth="0.310376"/>
                    <path d="M23.0527 1.29337C28.8574 -0.348172 37.2286 11.5676 41.7505 27.9077C46.2723 44.2477 45.2327 58.8248 39.428 60.4664" stroke="#EAC147" strokeWidth="0.310376"/>
                    <path d="M27.8721 0.346741C30.4796 0.0528631 34.101 13.4849 35.9608 30.3477C37.8206 47.2105 37.2146 61.119 34.6071 61.4129" stroke="#EAC147" strokeWidth="0.310375"/>
                    <path d="M36.0063 61.2215C32.8876 61.722 29.5933 61.722 26.4746 61.2215" stroke="#EAC147" strokeWidth="0.310366"/>
                    <path d="M46.5815 57.3994C38.2712 62.3124 24.6657 62.3892 16.1925 57.5705C16.0932 57.514 15.9949 57.457 15.8975 57.3994" stroke="#EAC147" strokeWidth="0.310366"/>
                    <path d="M52.4062 52.9243C45.4984 59.7026 30.4217 61.9514 18.7305 57.945C15.1608 56.7217 12.182 54.9946 10.0723 52.9243" stroke="#EAC147" strokeWidth="0.310366"/>
                    <path d="M56.5356 47.9062C51.2002 56.0069 35.5494 60.0661 21.5774 56.9721C14.3794 55.378 8.69278 52.0807 5.94336 47.9062" stroke="#EAC147" strokeWidth="0.310366"/>
                    <path d="M59.3851 42.4691C55.7532 51.4822 40.2082 57.0814 24.664 54.9758C13.9569 53.5251 5.59647 48.6776 3.09473 42.4691" stroke="#EAC147" strokeWidth="0.310366"/>
                    <path d="M61.0707 36.7467C59.2321 46.2998 44.3858 53.1795 27.9117 52.1135C13.9689 51.2115 2.96419 44.8307 1.4082 36.7467" stroke="#EAC147" strokeWidth="0.310366"/>
                    <path d="M61.6295 30.8799C61.6295 40.6118 48.0231 48.5013 31.2391 48.5013C14.455 48.5013 0.848633 40.6118 0.848633 30.8799" stroke="#EAC147" strokeWidth="0.310366"/>
                    <path d="M61.0711 25.013C62.9097 34.5658 51.0441 43.1742 34.5688 44.2403C18.0935 45.3063 3.24839 38.4262 1.40977 28.8734C1.16289 27.5906 1.16289 26.2959 1.40977 25.013" stroke="#EAC147" strokeWidth="0.310366"/>
                    <path d="M59.3853 19.2906C63.0164 28.3036 53.3601 37.3169 37.816 39.4229C22.2719 41.5285 6.72655 35.9292 3.09489 26.9162C2.08426 24.4081 2.08426 21.7986 3.09489 19.2906" stroke="#EAC147" strokeWidth="0.310366"/>
                    <path d="M56.5356 13.8535C61.87 21.9541 54.8708 31.0289 40.9003 34.1225C26.9295 37.2161 11.2787 33.1572 5.94215 25.0566C3.56616 21.4493 3.56616 17.4608 5.94214 13.8535" stroke="#EAC147" strokeWidth="0.310366"/>
                    <path d="M52.4065 8.83545C59.3146 15.6138 55.4377 24.3559 43.7474 28.3613C32.0571 32.3668 16.9804 30.1189 10.0717 23.3405C5.51255 18.8669 5.51255 13.3091 10.0717 8.83545" stroke="#EAC147" strokeWidth="0.310366"/>
                    <path d="M46.5813 4.3606C54.8915 9.27355 54.7593 17.1628 46.2862 21.9811C37.813 26.7998 24.2075 26.723 15.8972 21.81C7.70092 16.9643 7.70092 9.20629 15.8972 4.36061" stroke="#EAC147" strokeWidth="0.310366"/>
                    <path d="M36.0055 0.538239C45.5135 2.06441 51.0874 7.77096 48.4553 13.2839C45.8232 18.7969 35.9818 22.029 26.4738 20.5028C16.9659 18.9766 11.392 13.2701 14.0241 7.75714C15.6986 4.24968 20.4249 1.50934 26.4738 0.538239" stroke="#EAC147" strokeWidth="0.310366"/>
                    <path d="M45.0363 8.45727C45.0363 12.8756 38.8591 16.4574 31.2393 16.4574C23.6195 16.4574 17.4424 12.8756 17.4424 8.45727C17.4424 4.03892 23.6195 0.457123 31.2393 0.457123C38.8591 0.457123 45.0363 4.03892 45.0363 8.45727Z" stroke="#EAC147" strokeWidth="0.310366"/>
                    <path d="M40.6311 6.94609C40.6311 9.95355 36.4266 12.3914 31.2399 12.3914C26.0532 12.3914 21.8486 9.9534 21.8486 6.94609C21.8486 3.93862 26.0532 1.50073 31.2399 1.50073C36.4266 1.50073 40.6311 3.93878 40.6311 6.94609Z" stroke="#EAC147" strokeWidth="0.310366"/>
                    <path d="M35.9933 6.02411C35.9933 7.54666 33.8648 8.78096 31.2393 8.78096C28.6137 8.78096 26.4854 7.54666 26.4854 6.02411C26.4854 4.50156 28.6138 3.26727 31.2393 3.26727C33.8649 3.26727 35.9933 4.50156 35.9933 6.02411Z" stroke="#EAC147" strokeWidth="0.310366"/>
                    <path d="M61.6295 30.8799C61.6295 47.8467 48.0231 61.6012 31.2391 61.6012C14.455 61.6012 0.848633 47.8467 0.848633 30.8799C0.848633 13.9131 14.455 0.158539 31.2391 0.158539C48.0231 0.158539 61.6295 13.9131 61.6295 30.8799Z" stroke="#EAC147" strokeWidth="0.310366"/>
                    <mask id="mask0_pdv" style={{ maskType: 'luminance' }} maskUnits="userSpaceOnUse" x="0" y="0" width="62" height="62">
                      <path d="M61.9079 30.8818C61.9079 39.0677 58.6504 46.9184 52.852 52.7068C47.0536 58.4951 39.1893 61.747 30.9891 61.747C22.7889 61.747 14.9246 58.4951 9.12622 52.7068C3.32782 46.9184 0.0703125 39.0677 0.0703125 30.8818C0.0703125 22.6958 3.32782 14.8451 9.12622 9.05673C14.9246 3.26837 22.7889 0.01651 30.9891 0.01651C39.1893 0.01651 47.0536 3.26837 52.852 9.05673C58.6504 14.8451 61.9079 22.6958 61.9079 30.8818Z" fill="white"/>
                    </mask>
                    <g mask="url(#mask0_pdv)">
                      <path d="M61.6398 30.9255C61.6398 47.8902 47.803 61.6425 30.7344 61.6425C13.666 61.6425 -0.170898 47.8899 -0.170898 30.9255C-0.170898 13.9608 13.6658 0.208618 30.7344 0.208618C47.8028 0.208618 61.6398 13.9612 61.6398 30.9255Z" fill="url(#paint0_pdv)" stroke="#EAC147" strokeWidth="0.0372468"/>
                    </g>
                    <mask id="mask1_pdv" style={{ maskType: 'luminance' }} maskUnits="userSpaceOnUse" x="0" y="0" width="62" height="62">
                      <path d="M61.9079 30.8802C61.9079 39.0662 58.6504 46.9169 52.852 52.7052C47.0536 58.4936 39.1893 61.7455 30.9891 61.7455C22.7889 61.7455 14.9246 58.4936 9.12622 52.7052C3.32782 46.9169 0.0703125 39.0662 0.0703125 30.8802C0.0703125 22.6942 3.32782 14.8435 9.12622 9.05518C14.9246 3.26682 22.7889 0.0149536 30.9891 0.0149536C39.1893 0.0149536 47.0536 3.26682 52.852 9.05518C58.6504 14.8435 61.9079 22.6942 61.9079 30.8802Z" fill="white"/>
                    </mask>
                    <g mask="url(#mask1_pdv)">
                      <path opacity="0.88" d="M62.7033 31.1342C62.7033 48.3294 48.6785 62.2685 31.378 62.2685C14.0777 62.2685 0.0527344 48.329 0.0527344 31.1342C0.0527344 13.939 14.0775 -9.15527e-05 31.378 -9.15527e-05C48.6783 -9.15527e-05 62.7033 13.9394 62.7033 31.1342Z" fill="url(#paint1_pdv)" stroke="#EAC147" strokeWidth="0.0372468"/>
                    </g>
                    <mask id="mask2_pdv" style={{ maskType: 'luminance' }} maskUnits="userSpaceOnUse" x="0" y="0" width="62" height="62">
                      <path d="M61.9117 30.8756C61.9117 39.0612 58.6541 46.9115 52.8554 52.6997C47.0567 58.4878 39.1921 61.7395 30.9915 61.7395C22.791 61.7395 14.9263 58.4878 9.12761 52.6997C3.32895 46.9115 0.0712891 39.0612 0.0712891 30.8756C0.0712891 22.6899 3.32895 14.8396 9.12761 9.05146C14.9263 3.26335 22.791 0.0116272 30.9915 0.0116272C39.1921 0.0116272 47.0567 3.26335 52.8554 9.05146C58.6541 14.8396 61.9117 22.6899 61.9117 30.8756Z" fill="white"/>
                    </mask>
                    <g mask="url(#mask2_pdv)">
                      <path opacity="0.88" d="M66.845 32.1787C66.845 48.939 51.0798 62.5258 31.6325 62.5258C12.1851 62.5258 -3.58008 48.939 -3.58008 32.1787C-3.58008 15.4185 12.1851 1.83163 31.6325 1.83163C51.0798 1.83163 66.845 15.4185 66.845 32.1787Z" fill="url(#paint2_pdv)"/>
                    </g>
                    <path opacity="0.88" d="M32.5604 17.0035C20.1766 17.0035 9.40256 23.3634 3.82591 32.7437C3.40544 34.3765 3.17773 36.0734 3.17773 37.8131C3.17773 50.8863 15.6894 61.4831 31.1226 61.4831C46.5557 61.4831 59.0674 50.886 59.0674 37.8131C59.0674 32.9784 57.3516 28.4804 54.4143 24.7334C48.6143 19.9278 40.9577 17.0035 32.5604 17.0035Z" fill="url(#paint3_pdv)"/>
                    <g opacity="0.88" filter="url(#filter0_pdv)">
                      <path d="M56.3164 23.9739C56.3164 36.2794 45.4211 46.2545 31.9805 46.2545C18.5404 46.2545 7.64453 36.279 7.64453 23.9739C7.64453 11.6685 18.5398 1.69339 31.9805 1.69339C45.4205 1.69339 56.3164 11.6689 56.3164 23.9739Z" fill="url(#paint4_pdv)"/>
                    </g>
                    <path opacity="0.33" d="M61.6531 30.7484C61.6531 47.7218 47.9836 61.481 31.121 61.481C14.2589 61.481 0.588867 47.7212 0.588867 30.7484C0.588867 13.775 14.2584 0.0157776 31.121 0.0157776C47.983 0.0157776 61.6531 13.7755 61.6531 30.7484Z" fill="url(#paint5_pdv)" fillOpacity="0.2"/>
                    <path opacity="0.22" d="M49.751 53.4259C49.751 58.1929 41.7578 62.0572 31.8975 62.0572C22.0374 62.0572 14.0439 58.1927 14.0439 53.4259C14.0439 48.6588 22.0371 44.7945 31.8975 44.7945C41.7575 44.7945 49.751 48.659 49.751 53.4259Z" fill="url(#paint6_pdv)"/>
                  </g>
                  <defs>
                    <filter id="filter0_pdv" x="5.1606" y="-0.79054" width="53.6397" height="49.529" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
                      <feFlood floodOpacity="0" result="BackgroundImageFix"/>
                      <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"/>
                      <feGaussianBlur stdDeviation="1.24197" result="effect1_foregroundBlur_pdv"/>
                    </filter>
                    <linearGradient id="paint0_pdv" x1="35.5848" y1="81.5127" x2="18.8242" y2="-20.7345" gradientUnits="userSpaceOnUse">
                      <stop stopColor="#F8C52B"/>
                      <stop offset="1" stopColor="#F8C52B" stopOpacity="0"/>
                    </linearGradient>
                    <linearGradient id="paint1_pdv" x1="-20.3686" y1="-65.8992" x2="44.7957" y2="59.6857" gradientUnits="userSpaceOnUse">
                      <stop stopColor="#F8C52B"/>
                      <stop offset="1" stopColor="#F8C52B" stopOpacity="0"/>
                    </linearGradient>
                    <linearGradient id="paint2_pdv" x1="32.9319" y1="112.611" x2="24.6087" y2="-0.613668" gradientUnits="userSpaceOnUse">
                      <stop stopColor="#F8C52B"/>
                      <stop offset="1" stopColor="#F8C52B" stopOpacity="0"/>
                    </linearGradient>
                    <linearGradient id="paint3_pdv" x1="34.9752" y1="72.9909" x2="31.5698" y2="16.7875" gradientUnits="userSpaceOnUse">
                      <stop stopColor="#F8C52B"/>
                      <stop offset="1" stopColor="#F8C52B" stopOpacity="0"/>
                    </linearGradient>
                    <linearGradient id="paint4_pdv" x1="33.074" y1="10.605" x2="31.979" y2="53.5973" gradientUnits="userSpaceOnUse">
                      <stop stopColor="white"/>
                      <stop offset="1" stopColor="white" stopOpacity="0"/>
                    </linearGradient>
                    <linearGradient id="paint5_pdv" x1="32.156" y1="106.732" x2="31.1574" y2="0.0154372" gradientUnits="userSpaceOnUse">
                      <stop/>
                      <stop offset="1" stopOpacity="0"/>
                    </linearGradient>
                    <radialGradient id="paint6_pdv" cx="0" cy="0" r="1" gradientTransform="matrix(-0.000643334 8.72768 -11.9938 -0.00554 31.4438 54.7683)" gradientUnits="userSpaceOnUse">
                      <stop stopColor="#E6E6E6"/>
                      <stop offset="1" stopColor="#E6E6E6" stopOpacity="0"/>
                    </radialGradient>
                    <clipPath id="clip_pdv">
                      <rect width="61.7471" height="61.7471" fill="white"/>
                    </clipPath>
                  </defs>
                </svg>
              )}
              <span className="checkbox-hover-text" style={{ fontFamily: 'HealTheWeb, Arial', fontSize: '14px', color: selectedSources.includes('publicdomainvectors') ? '#D3A61B' : '#ACACAC', opacity: 0, transition: 'opacity 0.15s', zIndex: 1 }}>
                {selectedSources.includes('publicdomainvectors') ? 'OFF' : 'ON'}
              </span>
            </div>
            <div style={{ flex: 1, textAlign: 'center', marginRight: '8px' }}>
              <div style={{ fontFamily: 'HealTheWeb, Arial', fontSize: '14px', color: selectedSources.includes('publicdomainvectors') ? '#374151' : '#9ca3af', lineHeight: '1.1', transition: 'color 0.2s' }}>publicdomainvectors.org</div>
              <div style={{ fontFamily: 'Arial', fontSize: '11px', color: '#9ca3af', lineHeight: '1.1', marginTop: '2px' }}>may contain boring corporate memphis</div>
            </div>
          </label>

          <label
            className="checkbox-label"
            onClick={() => setIsMinimized(false)}
            style={{
              display: 'flex',
              alignItems: 'center',
              height: '86px',
              padding: '0 10px',
              border: '1px solid #DEDEDE',
              borderRadius: '9999px',
              cursor: 'pointer',
              backgroundColor: 'transparent',
              transition: 'background-color 0.2s'
            }}
          >
            <input
              type="checkbox"
              checked={selectedSources.includes('freesvg')}
              onChange={() => toggleSource('freesvg')}
              style={{ display: 'none' }}
            />
            <div className="checkbox-circle" style={{
              width: '66px',
              height: '66px',
              borderRadius: '9999px',
              backgroundColor: 'transparent',
              border: selectedSources.includes('freesvg') ? 'none' : '1px solid #DEDEDE',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              overflow: 'hidden'
            }}>
              {selectedSources.includes('freesvg') && (
                <svg width="66" height="66" viewBox="0 0 62 62" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ position: 'absolute', top: 0, left: 0 }}>
                  <g clipPath="url(#clip_freesvg)">
                    <path d="M30.0213 61.5779C29.0628 61.539 28.8311 47.7634 29.5037 30.8095C30.1764 13.8556 31.4987 0.142953 32.4572 0.181816" stroke="#EAC147" strokeWidth="0.310379"/>
                    <path d="M25.3516 61.0203C20.9601 60.1436 20.0361 45.9383 23.2883 29.2923C26.5404 12.6463 32.7371 -0.137373 37.1286 0.739388" stroke="#EAC147" strokeWidth="0.310379"/>
                    <path d="M20.2735 59.5323C13.1028 56.7279 12.1997 41.6262 18.2559 25.802C24.3121 9.97787 35.0344 -0.577048 42.2051 2.2274" stroke="#EAC147" strokeWidth="0.310373"/>
                    <path d="M14.5018 56.5222C5.84077 50.7451 6.31344 34.5813 15.5573 20.4195C24.8012 6.25775 39.316 -0.539591 47.977 5.23753" stroke="#EAC147" strokeWidth="0.310367"/>
                    <path d="M8.08684 50.7817C0.0815238 41.2647 3.95774 24.6391 16.7446 13.6477C29.5315 2.65635 46.3872 1.46111 54.3926 10.978" stroke="#EAC147" strokeWidth="0.310378"/>
                    <path d="M2.45591 40.7404C-1.87599 27.8184 7.49937 12.9284 23.396 7.48262C39.2927 2.03684 55.6913 8.0973 60.0233 21.0193" stroke="#EAC147" strokeWidth="0.310377"/>
                    <path d="M1.07324 27.162C2.7331 13.3991 17.585 3.90657 34.2457 5.95989C50.9063 8.01321 63.0671 20.8349 61.4072 34.5978" stroke="#EAC147" strokeWidth="0.310365"/>
                    <path d="M5.18359 15.0674C11.8747 3.80032 28.9647 1.74604 43.355 10.4789C57.7452 19.2118 63.9868 35.4252 57.2957 46.6923" stroke="#EAC147" strokeWidth="0.310368"/>
                    <path d="M11.5527 7.47491C20.2367 0.0103402 36.0908 4.43805 46.9638 17.3641C57.8368 30.2902 59.6116 46.8202 50.9277 54.2848" stroke="#EAC147" strokeWidth="0.310378"/>
                    <path d="M17.6787 3.38556C25.7514 -0.683293 38.3671 8.32803 45.8565 23.5126C53.346 38.6971 52.8733 54.3053 44.8006 58.3742" stroke="#EAC147" strokeWidth="0.310376"/>
                    <path d="M23.0527 1.29337C28.8574 -0.348172 37.2286 11.5676 41.7505 27.9077C46.2723 44.2477 45.2327 58.8248 39.428 60.4664" stroke="#EAC147" strokeWidth="0.310376"/>
                    <path d="M27.8721 0.346741C30.4796 0.0528631 34.101 13.4849 35.9608 30.3477C37.8206 47.2105 37.2146 61.119 34.6071 61.4129" stroke="#EAC147" strokeWidth="0.310375"/>
                    <path d="M36.0063 61.2215C32.8876 61.722 29.5933 61.722 26.4746 61.2215" stroke="#EAC147" strokeWidth="0.310366"/>
                    <path d="M46.5815 57.3994C38.2712 62.3124 24.6657 62.3892 16.1925 57.5705C16.0932 57.514 15.9949 57.457 15.8975 57.3994" stroke="#EAC147" strokeWidth="0.310366"/>
                    <path d="M52.4062 52.9243C45.4984 59.7026 30.4217 61.9514 18.7305 57.945C15.1608 56.7217 12.182 54.9946 10.0723 52.9243" stroke="#EAC147" strokeWidth="0.310366"/>
                    <path d="M56.5356 47.9062C51.2002 56.0069 35.5494 60.0661 21.5774 56.9721C14.3794 55.378 8.69278 52.0807 5.94336 47.9062" stroke="#EAC147" strokeWidth="0.310366"/>
                    <path d="M59.3851 42.4691C55.7532 51.4822 40.2082 57.0814 24.664 54.9758C13.9569 53.5251 5.59647 48.6776 3.09473 42.4691" stroke="#EAC147" strokeWidth="0.310366"/>
                    <path d="M61.0707 36.7467C59.2321 46.2998 44.3858 53.1795 27.9117 52.1135C13.9689 51.2115 2.96419 44.8307 1.4082 36.7467" stroke="#EAC147" strokeWidth="0.310366"/>
                    <path d="M61.6295 30.8799C61.6295 40.6118 48.0231 48.5013 31.2391 48.5013C14.455 48.5013 0.848633 40.6118 0.848633 30.8799" stroke="#EAC147" strokeWidth="0.310366"/>
                    <path d="M61.0711 25.013C62.9097 34.5658 51.0441 43.1742 34.5688 44.2403C18.0935 45.3063 3.24839 38.4262 1.40977 28.8734C1.16289 27.5906 1.16289 26.2959 1.40977 25.013" stroke="#EAC147" strokeWidth="0.310366"/>
                    <path d="M59.3853 19.2906C63.0164 28.3036 53.3601 37.3169 37.816 39.4229C22.2719 41.5285 6.72655 35.9292 3.09489 26.9162C2.08426 24.4081 2.08426 21.7986 3.09489 19.2906" stroke="#EAC147" strokeWidth="0.310366"/>
                    <path d="M56.5356 13.8535C61.87 21.9541 54.8708 31.0289 40.9003 34.1225C26.9295 37.2161 11.2787 33.1572 5.94215 25.0566C3.56616 21.4493 3.56616 17.4608 5.94214 13.8535" stroke="#EAC147" strokeWidth="0.310366"/>
                    <path d="M52.4065 8.83545C59.3146 15.6138 55.4377 24.3559 43.7474 28.3613C32.0571 32.3668 16.9804 30.1189 10.0717 23.3405C5.51255 18.8669 5.51255 13.3091 10.0717 8.83545" stroke="#EAC147" strokeWidth="0.310366"/>
                    <path d="M46.5813 4.3606C54.8915 9.27355 54.7593 17.1628 46.2862 21.9811C37.813 26.7998 24.2075 26.723 15.8972 21.81C7.70092 16.9643 7.70092 9.20629 15.8972 4.36061" stroke="#EAC147" strokeWidth="0.310366"/>
                    <path d="M36.0055 0.538239C45.5135 2.06441 51.0874 7.77096 48.4553 13.2839C45.8232 18.7969 35.9818 22.029 26.4738 20.5028C16.9659 18.9766 11.392 13.2701 14.0241 7.75714C15.6986 4.24968 20.4249 1.50934 26.4738 0.538239" stroke="#EAC147" strokeWidth="0.310366"/>
                    <path d="M45.0363 8.45727C45.0363 12.8756 38.8591 16.4574 31.2393 16.4574C23.6195 16.4574 17.4424 12.8756 17.4424 8.45727C17.4424 4.03892 23.6195 0.457123 31.2393 0.457123C38.8591 0.457123 45.0363 4.03892 45.0363 8.45727Z" stroke="#EAC147" strokeWidth="0.310366"/>
                    <path d="M40.6311 6.94609C40.6311 9.95355 36.4266 12.3914 31.2399 12.3914C26.0532 12.3914 21.8486 9.9534 21.8486 6.94609C21.8486 3.93862 26.0532 1.50073 31.2399 1.50073C36.4266 1.50073 40.6311 3.93878 40.6311 6.94609Z" stroke="#EAC147" strokeWidth="0.310366"/>
                    <path d="M35.9933 6.02411C35.9933 7.54666 33.8648 8.78096 31.2393 8.78096C28.6137 8.78096 26.4854 7.54666 26.4854 6.02411C26.4854 4.50156 28.6138 3.26727 31.2393 3.26727C33.8649 3.26727 35.9933 4.50156 35.9933 6.02411Z" stroke="#EAC147" strokeWidth="0.310366"/>
                    <path d="M61.6295 30.8799C61.6295 47.8467 48.0231 61.6012 31.2391 61.6012C14.455 61.6012 0.848633 47.8467 0.848633 30.8799C0.848633 13.9131 14.455 0.158539 31.2391 0.158539C48.0231 0.158539 61.6295 13.9131 61.6295 30.8799Z" stroke="#EAC147" strokeWidth="0.310366"/>
                    <mask id="mask0_freesvg" style={{ maskType: 'luminance' }} maskUnits="userSpaceOnUse" x="0" y="0" width="62" height="62">
                      <path d="M61.9079 30.8818C61.9079 39.0677 58.6504 46.9184 52.852 52.7068C47.0536 58.4951 39.1893 61.747 30.9891 61.747C22.7889 61.747 14.9246 58.4951 9.12622 52.7068C3.32782 46.9184 0.0703125 39.0677 0.0703125 30.8818C0.0703125 22.6958 3.32782 14.8451 9.12622 9.05673C14.9246 3.26837 22.7889 0.01651 30.9891 0.01651C39.1893 0.01651 47.0536 3.26837 52.852 9.05673C58.6504 14.8451 61.9079 22.6958 61.9079 30.8818Z" fill="white"/>
                    </mask>
                    <g mask="url(#mask0_freesvg)">
                      <path d="M61.6398 30.9255C61.6398 47.8902 47.803 61.6425 30.7344 61.6425C13.666 61.6425 -0.170898 47.8899 -0.170898 30.9255C-0.170898 13.9608 13.6658 0.208618 30.7344 0.208618C47.8028 0.208618 61.6398 13.9612 61.6398 30.9255Z" fill="url(#paint0_freesvg)" stroke="#EAC147" strokeWidth="0.0372468"/>
                    </g>
                    <mask id="mask1_freesvg" style={{ maskType: 'luminance' }} maskUnits="userSpaceOnUse" x="0" y="0" width="62" height="62">
                      <path d="M61.9079 30.8802C61.9079 39.0662 58.6504 46.9169 52.852 52.7052C47.0536 58.4936 39.1893 61.7455 30.9891 61.7455C22.7889 61.7455 14.9246 58.4936 9.12622 52.7052C3.32782 46.9169 0.0703125 39.0662 0.0703125 30.8802C0.0703125 22.6942 3.32782 14.8435 9.12622 9.05518C14.9246 3.26682 22.7889 0.0149536 30.9891 0.0149536C39.1893 0.0149536 47.0536 3.26682 52.852 9.05518C58.6504 14.8435 61.9079 22.6942 61.9079 30.8802Z" fill="white"/>
                    </mask>
                    <g mask="url(#mask1_freesvg)">
                      <path opacity="0.88" d="M62.7033 31.1342C62.7033 48.3294 48.6785 62.2685 31.378 62.2685C14.0777 62.2685 0.0527344 48.329 0.0527344 31.1342C0.0527344 13.939 14.0775 -9.15527e-05 31.378 -9.15527e-05C48.6783 -9.15527e-05 62.7033 13.9394 62.7033 31.1342Z" fill="url(#paint1_freesvg)" stroke="#EAC147" strokeWidth="0.0372468"/>
                    </g>
                    <mask id="mask2_freesvg" style={{ maskType: 'luminance' }} maskUnits="userSpaceOnUse" x="0" y="0" width="62" height="62">
                      <path d="M61.9117 30.8756C61.9117 39.0612 58.6541 46.9115 52.8554 52.6997C47.0567 58.4878 39.1921 61.7395 30.9915 61.7395C22.791 61.7395 14.9263 58.4878 9.12761 52.6997C3.32895 46.9115 0.0712891 39.0612 0.0712891 30.8756C0.0712891 22.6899 3.32895 14.8396 9.12761 9.05146C14.9263 3.26335 22.791 0.0116272 30.9915 0.0116272C39.1921 0.0116272 47.0567 3.26335 52.8554 9.05146C58.6541 14.8396 61.9117 22.6899 61.9117 30.8756Z" fill="white"/>
                    </mask>
                    <g mask="url(#mask2_freesvg)">
                      <path opacity="0.88" d="M66.845 32.1787C66.845 48.939 51.0798 62.5258 31.6325 62.5258C12.1851 62.5258 -3.58008 48.939 -3.58008 32.1787C-3.58008 15.4185 12.1851 1.83163 31.6325 1.83163C51.0798 1.83163 66.845 15.4185 66.845 32.1787Z" fill="url(#paint2_freesvg)"/>
                    </g>
                    <path opacity="0.88" d="M32.5604 17.0035C20.1766 17.0035 9.40256 23.3634 3.82591 32.7437C3.40544 34.3765 3.17773 36.0734 3.17773 37.8131C3.17773 50.8863 15.6894 61.4831 31.1226 61.4831C46.5557 61.4831 59.0674 50.886 59.0674 37.8131C59.0674 32.9784 57.3516 28.4804 54.4143 24.7334C48.6143 19.9278 40.9577 17.0035 32.5604 17.0035Z" fill="url(#paint3_freesvg)"/>
                    <g opacity="0.88" filter="url(#filter0_freesvg)">
                      <path d="M56.3164 23.9739C56.3164 36.2794 45.4211 46.2545 31.9805 46.2545C18.5404 46.2545 7.64453 36.279 7.64453 23.9739C7.64453 11.6685 18.5398 1.69339 31.9805 1.69339C45.4205 1.69339 56.3164 11.6689 56.3164 23.9739Z" fill="url(#paint4_freesvg)"/>
                    </g>
                    <path opacity="0.33" d="M61.6531 30.7484C61.6531 47.7218 47.9836 61.481 31.121 61.481C14.2589 61.481 0.588867 47.7212 0.588867 30.7484C0.588867 13.775 14.2584 0.0157776 31.121 0.0157776C47.983 0.0157776 61.6531 13.7755 61.6531 30.7484Z" fill="url(#paint5_freesvg)" fillOpacity="0.2"/>
                    <path opacity="0.22" d="M49.751 53.4259C49.751 58.1929 41.7578 62.0572 31.8975 62.0572C22.0374 62.0572 14.0439 58.1927 14.0439 53.4259C14.0439 48.6588 22.0371 44.7945 31.8975 44.7945C41.7575 44.7945 49.751 48.659 49.751 53.4259Z" fill="url(#paint6_freesvg)"/>
                  </g>
                  <defs>
                    <filter id="filter0_freesvg" x="5.1606" y="-0.79054" width="53.6397" height="49.529" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
                      <feFlood floodOpacity="0" result="BackgroundImageFix"/>
                      <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"/>
                      <feGaussianBlur stdDeviation="1.24197" result="effect1_foregroundBlur_freesvg"/>
                    </filter>
                    <linearGradient id="paint0_freesvg" x1="35.5848" y1="81.5127" x2="18.8242" y2="-20.7345" gradientUnits="userSpaceOnUse">
                      <stop stopColor="#F8C52B"/>
                      <stop offset="1" stopColor="#F8C52B" stopOpacity="0"/>
                    </linearGradient>
                    <linearGradient id="paint1_freesvg" x1="-20.3686" y1="-65.8992" x2="44.7957" y2="59.6857" gradientUnits="userSpaceOnUse">
                      <stop stopColor="#F8C52B"/>
                      <stop offset="1" stopColor="#F8C52B" stopOpacity="0"/>
                    </linearGradient>
                    <linearGradient id="paint2_freesvg" x1="32.9319" y1="112.611" x2="24.6087" y2="-0.613668" gradientUnits="userSpaceOnUse">
                      <stop stopColor="#F8C52B"/>
                      <stop offset="1" stopColor="#F8C52B" stopOpacity="0"/>
                    </linearGradient>
                    <linearGradient id="paint3_freesvg" x1="34.9752" y1="72.9909" x2="31.5698" y2="16.7875" gradientUnits="userSpaceOnUse">
                      <stop stopColor="#F8C52B"/>
                      <stop offset="1" stopColor="#F8C52B" stopOpacity="0"/>
                    </linearGradient>
                    <linearGradient id="paint4_freesvg" x1="33.074" y1="10.605" x2="31.979" y2="53.5973" gradientUnits="userSpaceOnUse">
                      <stop stopColor="white"/>
                      <stop offset="1" stopColor="white" stopOpacity="0"/>
                    </linearGradient>
                    <linearGradient id="paint5_freesvg" x1="32.156" y1="106.732" x2="31.1574" y2="0.0154372" gradientUnits="userSpaceOnUse">
                      <stop/>
                      <stop offset="1" stopOpacity="0"/>
                    </linearGradient>
                    <radialGradient id="paint6_freesvg" cx="0" cy="0" r="1" gradientTransform="matrix(-0.000643334 8.72768 -11.9938 -0.00554 31.4438 54.7683)" gradientUnits="userSpaceOnUse">
                      <stop stopColor="#E6E6E6"/>
                      <stop offset="1" stopColor="#E6E6E6" stopOpacity="0"/>
                    </radialGradient>
                    <clipPath id="clip_freesvg">
                      <rect width="61.7471" height="61.7471" fill="white"/>
                    </clipPath>
                  </defs>
                </svg>
              )}
              <span className="checkbox-hover-text" style={{ fontFamily: 'HealTheWeb, Arial', fontSize: '14px', color: selectedSources.includes('freesvg') ? '#D3A61B' : '#ACACAC', opacity: 0, transition: 'opacity 0.15s', zIndex: 1 }}>
                {selectedSources.includes('freesvg') ? 'OFF' : 'ON'}
              </span>
            </div>
            <div style={{ flex: 1, textAlign: 'center', marginRight: '8px' }}>
              <div style={{ fontFamily: 'HealTheWeb, Arial', fontSize: '14px', color: selectedSources.includes('freesvg') ? '#374151' : '#9ca3af', lineHeight: '1.1', transition: 'color 0.2s' }}>freesvg.org</div>
              <div style={{ fontFamily: 'Arial', fontSize: '11px', color: '#9ca3af', lineHeight: '1.1', marginTop: '2px' }}>perfect balance</div>
            </div>
          </label>

          <label
            className="checkbox-label"
            onClick={() => setIsMinimized(false)}
            style={{
              display: 'flex',
              alignItems: 'center',
              height: '86px',
              padding: '0 10px',
              border: '1px solid #DEDEDE',
              borderRadius: '9999px',
              cursor: 'pointer',
              backgroundColor: 'transparent',
              transition: 'background-color 0.2s'
            }}
          >
            <input
              type="checkbox"
              checked={selectedSources.includes('wikimedia')}
              onChange={() => toggleSource('wikimedia')}
              style={{ display: 'none' }}
            />
            <div className="checkbox-circle" style={{
              width: '66px',
              height: '66px',
              borderRadius: '9999px',
              backgroundColor: 'transparent',
              border: selectedSources.includes('wikimedia') ? 'none' : '1px solid #DEDEDE',
              flexShrink: 0,
              boxShadow: wikiGlow ? `0 0 20px 8px ${ACCENT_COLOR}` : 'none',
              transition: 'box-shadow 0.3s ease-out',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              overflow: 'hidden'
            }}>
              {selectedSources.includes('wikimedia') && (
                <svg width="66" height="66" viewBox="0 0 62 62" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ position: 'absolute', top: 0, left: 0 }}>
                  <g clipPath="url(#clip_wiki)">
                    <path d="M30.0213 61.5779C29.0628 61.539 28.8311 47.7634 29.5037 30.8095C30.1764 13.8556 31.4987 0.142953 32.4572 0.181816" stroke="#EAC147" strokeWidth="0.310379"/>
                    <path d="M25.3516 61.0203C20.9601 60.1436 20.0361 45.9383 23.2883 29.2923C26.5404 12.6463 32.7371 -0.137373 37.1286 0.739388" stroke="#EAC147" strokeWidth="0.310379"/>
                    <path d="M20.2735 59.5323C13.1028 56.7279 12.1997 41.6262 18.2559 25.802C24.3121 9.97787 35.0344 -0.577048 42.2051 2.2274" stroke="#EAC147" strokeWidth="0.310373"/>
                    <path d="M14.5018 56.5222C5.84077 50.7451 6.31344 34.5813 15.5573 20.4195C24.8012 6.25775 39.316 -0.539591 47.977 5.23753" stroke="#EAC147" strokeWidth="0.310367"/>
                    <path d="M8.08684 50.7817C0.0815238 41.2647 3.95774 24.6391 16.7446 13.6477C29.5315 2.65635 46.3872 1.46111 54.3926 10.978" stroke="#EAC147" strokeWidth="0.310378"/>
                    <path d="M2.45591 40.7404C-1.87599 27.8184 7.49937 12.9284 23.396 7.48262C39.2927 2.03684 55.6913 8.0973 60.0233 21.0193" stroke="#EAC147" strokeWidth="0.310377"/>
                    <path d="M1.07324 27.162C2.7331 13.3991 17.585 3.90657 34.2457 5.95989C50.9063 8.01321 63.0671 20.8349 61.4072 34.5978" stroke="#EAC147" strokeWidth="0.310365"/>
                    <path d="M5.18359 15.0674C11.8747 3.80032 28.9647 1.74604 43.355 10.4789C57.7452 19.2118 63.9868 35.4252 57.2957 46.6923" stroke="#EAC147" strokeWidth="0.310368"/>
                    <path d="M11.5527 7.47491C20.2367 0.0103402 36.0908 4.43805 46.9638 17.3641C57.8368 30.2902 59.6116 46.8202 50.9277 54.2848" stroke="#EAC147" strokeWidth="0.310378"/>
                    <path d="M17.6787 3.38556C25.7514 -0.683293 38.3671 8.32803 45.8565 23.5126C53.346 38.6971 52.8733 54.3053 44.8006 58.3742" stroke="#EAC147" strokeWidth="0.310376"/>
                    <path d="M23.0527 1.29337C28.8574 -0.348172 37.2286 11.5676 41.7505 27.9077C46.2723 44.2477 45.2327 58.8248 39.428 60.4664" stroke="#EAC147" strokeWidth="0.310376"/>
                    <path d="M27.8721 0.346741C30.4796 0.0528631 34.101 13.4849 35.9608 30.3477C37.8206 47.2105 37.2146 61.119 34.6071 61.4129" stroke="#EAC147" strokeWidth="0.310375"/>
                    <path d="M36.0063 61.2215C32.8876 61.722 29.5933 61.722 26.4746 61.2215" stroke="#EAC147" strokeWidth="0.310366"/>
                    <path d="M46.5815 57.3994C38.2712 62.3124 24.6657 62.3892 16.1925 57.5705C16.0932 57.514 15.9949 57.457 15.8975 57.3994" stroke="#EAC147" strokeWidth="0.310366"/>
                    <path d="M52.4062 52.9243C45.4984 59.7026 30.4217 61.9514 18.7305 57.945C15.1608 56.7217 12.182 54.9946 10.0723 52.9243" stroke="#EAC147" strokeWidth="0.310366"/>
                    <path d="M56.5356 47.9062C51.2002 56.0069 35.5494 60.0661 21.5774 56.9721C14.3794 55.378 8.69278 52.0807 5.94336 47.9062" stroke="#EAC147" strokeWidth="0.310366"/>
                    <path d="M59.3851 42.4691C55.7532 51.4822 40.2082 57.0814 24.664 54.9758C13.9569 53.5251 5.59647 48.6776 3.09473 42.4691" stroke="#EAC147" strokeWidth="0.310366"/>
                    <path d="M61.0707 36.7467C59.2321 46.2998 44.3858 53.1795 27.9117 52.1135C13.9689 51.2115 2.96419 44.8307 1.4082 36.7467" stroke="#EAC147" strokeWidth="0.310366"/>
                    <path d="M61.6295 30.8799C61.6295 40.6118 48.0231 48.5013 31.2391 48.5013C14.455 48.5013 0.848633 40.6118 0.848633 30.8799" stroke="#EAC147" strokeWidth="0.310366"/>
                    <path d="M61.0711 25.013C62.9097 34.5658 51.0441 43.1742 34.5688 44.2403C18.0935 45.3063 3.24839 38.4262 1.40977 28.8734C1.16289 27.5906 1.16289 26.2959 1.40977 25.013" stroke="#EAC147" strokeWidth="0.310366"/>
                    <path d="M59.3853 19.2906C63.0164 28.3036 53.3601 37.3169 37.816 39.4229C22.2719 41.5285 6.72655 35.9292 3.09489 26.9162C2.08426 24.4081 2.08426 21.7986 3.09489 19.2906" stroke="#EAC147" strokeWidth="0.310366"/>
                    <path d="M56.5356 13.8535C61.87 21.9541 54.8708 31.0289 40.9003 34.1225C26.9295 37.2161 11.2787 33.1572 5.94215 25.0566C3.56616 21.4493 3.56616 17.4608 5.94214 13.8535" stroke="#EAC147" strokeWidth="0.310366"/>
                    <path d="M52.4065 8.83545C59.3146 15.6138 55.4377 24.3559 43.7474 28.3613C32.0571 32.3668 16.9804 30.1189 10.0717 23.3405C5.51255 18.8669 5.51255 13.3091 10.0717 8.83545" stroke="#EAC147" strokeWidth="0.310366"/>
                    <path d="M46.5813 4.3606C54.8915 9.27355 54.7593 17.1628 46.2862 21.9811C37.813 26.7998 24.2075 26.723 15.8972 21.81C7.70092 16.9643 7.70092 9.20629 15.8972 4.36061" stroke="#EAC147" strokeWidth="0.310366"/>
                    <path d="M36.0055 0.538239C45.5135 2.06441 51.0874 7.77096 48.4553 13.2839C45.8232 18.7969 35.9818 22.029 26.4738 20.5028C16.9659 18.9766 11.392 13.2701 14.0241 7.75714C15.6986 4.24968 20.4249 1.50934 26.4738 0.538239" stroke="#EAC147" strokeWidth="0.310366"/>
                    <path d="M45.0363 8.45727C45.0363 12.8756 38.8591 16.4574 31.2393 16.4574C23.6195 16.4574 17.4424 12.8756 17.4424 8.45727C17.4424 4.03892 23.6195 0.457123 31.2393 0.457123C38.8591 0.457123 45.0363 4.03892 45.0363 8.45727Z" stroke="#EAC147" strokeWidth="0.310366"/>
                    <path d="M40.6311 6.94609C40.6311 9.95355 36.4266 12.3914 31.2399 12.3914C26.0532 12.3914 21.8486 9.9534 21.8486 6.94609C21.8486 3.93862 26.0532 1.50073 31.2399 1.50073C36.4266 1.50073 40.6311 3.93878 40.6311 6.94609Z" stroke="#EAC147" strokeWidth="0.310366"/>
                    <path d="M35.9933 6.02411C35.9933 7.54666 33.8648 8.78096 31.2393 8.78096C28.6137 8.78096 26.4854 7.54666 26.4854 6.02411C26.4854 4.50156 28.6138 3.26727 31.2393 3.26727C33.8649 3.26727 35.9933 4.50156 35.9933 6.02411Z" stroke="#EAC147" strokeWidth="0.310366"/>
                    <path d="M61.6295 30.8799C61.6295 47.8467 48.0231 61.6012 31.2391 61.6012C14.455 61.6012 0.848633 47.8467 0.848633 30.8799C0.848633 13.9131 14.455 0.158539 31.2391 0.158539C48.0231 0.158539 61.6295 13.9131 61.6295 30.8799Z" stroke="#EAC147" strokeWidth="0.310366"/>
                    <mask id="mask0_wiki" style={{ maskType: 'luminance' }} maskUnits="userSpaceOnUse" x="0" y="0" width="62" height="62">
                      <path d="M61.9079 30.8818C61.9079 39.0677 58.6504 46.9184 52.852 52.7068C47.0536 58.4951 39.1893 61.747 30.9891 61.747C22.7889 61.747 14.9246 58.4951 9.12622 52.7068C3.32782 46.9184 0.0703125 39.0677 0.0703125 30.8818C0.0703125 22.6958 3.32782 14.8451 9.12622 9.05673C14.9246 3.26837 22.7889 0.01651 30.9891 0.01651C39.1893 0.01651 47.0536 3.26837 52.852 9.05673C58.6504 14.8451 61.9079 22.6958 61.9079 30.8818Z" fill="white"/>
                    </mask>
                    <g mask="url(#mask0_wiki)">
                      <path d="M61.6398 30.9255C61.6398 47.8902 47.803 61.6425 30.7344 61.6425C13.666 61.6425 -0.170898 47.8899 -0.170898 30.9255C-0.170898 13.9608 13.6658 0.208618 30.7344 0.208618C47.8028 0.208618 61.6398 13.9612 61.6398 30.9255Z" fill="url(#paint0_wiki)" stroke="#EAC147" strokeWidth="0.0372468"/>
                    </g>
                    <mask id="mask1_wiki" style={{ maskType: 'luminance' }} maskUnits="userSpaceOnUse" x="0" y="0" width="62" height="62">
                      <path d="M61.9079 30.8802C61.9079 39.0662 58.6504 46.9169 52.852 52.7052C47.0536 58.4936 39.1893 61.7455 30.9891 61.7455C22.7889 61.7455 14.9246 58.4936 9.12622 52.7052C3.32782 46.9169 0.0703125 39.0662 0.0703125 30.8802C0.0703125 22.6942 3.32782 14.8435 9.12622 9.05518C14.9246 3.26682 22.7889 0.0149536 30.9891 0.0149536C39.1893 0.0149536 47.0536 3.26682 52.852 9.05518C58.6504 14.8435 61.9079 22.6942 61.9079 30.8802Z" fill="white"/>
                    </mask>
                    <g mask="url(#mask1_wiki)">
                      <path opacity="0.88" d="M62.7033 31.1342C62.7033 48.3294 48.6785 62.2685 31.378 62.2685C14.0777 62.2685 0.0527344 48.329 0.0527344 31.1342C0.0527344 13.939 14.0775 -9.15527e-05 31.378 -9.15527e-05C48.6783 -9.15527e-05 62.7033 13.9394 62.7033 31.1342Z" fill="url(#paint1_wiki)" stroke="#EAC147" strokeWidth="0.0372468"/>
                    </g>
                    <mask id="mask2_wiki" style={{ maskType: 'luminance' }} maskUnits="userSpaceOnUse" x="0" y="0" width="62" height="62">
                      <path d="M61.9117 30.8756C61.9117 39.0612 58.6541 46.9115 52.8554 52.6997C47.0567 58.4878 39.1921 61.7395 30.9915 61.7395C22.791 61.7395 14.9263 58.4878 9.12761 52.6997C3.32895 46.9115 0.0712891 39.0612 0.0712891 30.8756C0.0712891 22.6899 3.32895 14.8396 9.12761 9.05146C14.9263 3.26335 22.791 0.0116272 30.9915 0.0116272C39.1921 0.0116272 47.0567 3.26335 52.8554 9.05146C58.6541 14.8396 61.9117 22.6899 61.9117 30.8756Z" fill="white"/>
                    </mask>
                    <g mask="url(#mask2_wiki)">
                      <path opacity="0.88" d="M66.845 32.1787C66.845 48.939 51.0798 62.5258 31.6325 62.5258C12.1851 62.5258 -3.58008 48.939 -3.58008 32.1787C-3.58008 15.4185 12.1851 1.83163 31.6325 1.83163C51.0798 1.83163 66.845 15.4185 66.845 32.1787Z" fill="url(#paint2_wiki)"/>
                    </g>
                    <path opacity="0.88" d="M32.5604 17.0035C20.1766 17.0035 9.40256 23.3634 3.82591 32.7437C3.40544 34.3765 3.17773 36.0734 3.17773 37.8131C3.17773 50.8863 15.6894 61.4831 31.1226 61.4831C46.5557 61.4831 59.0674 50.886 59.0674 37.8131C59.0674 32.9784 57.3516 28.4804 54.4143 24.7334C48.6143 19.9278 40.9577 17.0035 32.5604 17.0035Z" fill="url(#paint3_wiki)"/>
                    <g opacity="0.88" filter="url(#filter0_wiki)">
                      <path d="M56.3164 23.9739C56.3164 36.2794 45.4211 46.2545 31.9805 46.2545C18.5404 46.2545 7.64453 36.279 7.64453 23.9739C7.64453 11.6685 18.5398 1.69339 31.9805 1.69339C45.4205 1.69339 56.3164 11.6689 56.3164 23.9739Z" fill="url(#paint4_wiki)"/>
                    </g>
                    <path opacity="0.33" d="M61.6531 30.7484C61.6531 47.7218 47.9836 61.481 31.121 61.481C14.2589 61.481 0.588867 47.7212 0.588867 30.7484C0.588867 13.775 14.2584 0.0157776 31.121 0.0157776C47.983 0.0157776 61.6531 13.7755 61.6531 30.7484Z" fill="url(#paint5_wiki)" fillOpacity="0.2"/>
                    <path opacity="0.22" d="M49.751 53.4259C49.751 58.1929 41.7578 62.0572 31.8975 62.0572C22.0374 62.0572 14.0439 58.1927 14.0439 53.4259C14.0439 48.6588 22.0371 44.7945 31.8975 44.7945C41.7575 44.7945 49.751 48.659 49.751 53.4259Z" fill="url(#paint6_wiki)"/>
                  </g>
                  <defs>
                    <filter id="filter0_wiki" x="5.1606" y="-0.79054" width="53.6397" height="49.529" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
                      <feFlood floodOpacity="0" result="BackgroundImageFix"/>
                      <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"/>
                      <feGaussianBlur stdDeviation="1.24197" result="effect1_foregroundBlur_wiki"/>
                    </filter>
                    <linearGradient id="paint0_wiki" x1="35.5848" y1="81.5127" x2="18.8242" y2="-20.7345" gradientUnits="userSpaceOnUse">
                      <stop stopColor="#F8C52B"/>
                      <stop offset="1" stopColor="#F8C52B" stopOpacity="0"/>
                    </linearGradient>
                    <linearGradient id="paint1_wiki" x1="-20.3686" y1="-65.8992" x2="44.7957" y2="59.6857" gradientUnits="userSpaceOnUse">
                      <stop stopColor="#F8C52B"/>
                      <stop offset="1" stopColor="#F8C52B" stopOpacity="0"/>
                    </linearGradient>
                    <linearGradient id="paint2_wiki" x1="32.9319" y1="112.611" x2="24.6087" y2="-0.613668" gradientUnits="userSpaceOnUse">
                      <stop stopColor="#F8C52B"/>
                      <stop offset="1" stopColor="#F8C52B" stopOpacity="0"/>
                    </linearGradient>
                    <linearGradient id="paint3_wiki" x1="34.9752" y1="72.9909" x2="31.5698" y2="16.7875" gradientUnits="userSpaceOnUse">
                      <stop stopColor="#F8C52B"/>
                      <stop offset="1" stopColor="#F8C52B" stopOpacity="0"/>
                    </linearGradient>
                    <linearGradient id="paint4_wiki" x1="33.074" y1="10.605" x2="31.979" y2="53.5973" gradientUnits="userSpaceOnUse">
                      <stop stopColor="white"/>
                      <stop offset="1" stopColor="white" stopOpacity="0"/>
                    </linearGradient>
                    <linearGradient id="paint5_wiki" x1="32.156" y1="106.732" x2="31.1574" y2="0.0154372" gradientUnits="userSpaceOnUse">
                      <stop/>
                      <stop offset="1" stopOpacity="0"/>
                    </linearGradient>
                    <radialGradient id="paint6_wiki" cx="0" cy="0" r="1" gradientTransform="matrix(-0.000643334 8.72768 -11.9938 -0.00554 31.4438 54.7683)" gradientUnits="userSpaceOnUse">
                      <stop stopColor="#E6E6E6"/>
                      <stop offset="1" stopColor="#E6E6E6" stopOpacity="0"/>
                    </radialGradient>
                    <clipPath id="clip_wiki">
                      <rect width="61.7471" height="61.7471" fill="white"/>
                    </clipPath>
                  </defs>
                </svg>
              )}
              <span className="checkbox-hover-text" style={{ fontFamily: 'HealTheWeb, Arial', fontSize: '14px', color: selectedSources.includes('wikimedia') ? '#D3A61B' : '#ACACAC', opacity: 0, transition: 'opacity 0.15s', zIndex: 1 }}>
                {selectedSources.includes('wikimedia') ? 'OFF' : 'ON'}
              </span>
            </div>
            <div style={{ flex: 1, textAlign: 'center', marginRight: '8px' }}>
              <div style={{ fontFamily: 'HealTheWeb, Arial', fontSize: '14px', color: selectedSources.includes('wikimedia') ? '#374151' : '#9ca3af', lineHeight: '1.1', transition: 'color 0.2s' }}>wikimedia.org</div>
              <div style={{ fontFamily: 'Arial', fontSize: '11px', color: '#9ca3af', lineHeight: '1.1', marginTop: '2px' }}>too many hieroglyphs and maps<br />but has unique scientific graphics</div>
            </div>
          </label>
        </div>

        {/* Wikimedia cooldown countdown - separate from checkboxes */}
        <div
          style={{
            marginTop: '16px',
            paddingLeft: '55px',
            fontFamily: 'monospace',
            fontSize: '11px',
            color: '#9ca3af',
            opacity: wikiCooldown > 0 ? 1 : 0,
            maxHeight: wikiCooldown > 0 ? '200px' : '0',
            overflow: 'hidden',
            transition: 'opacity 0.7s ease-in-out, max-height 0.7s ease-in-out',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            gap: '7px',
            pointerEvents: wikiCooldown > 0 ? 'auto' : 'none'
          }}
        >
          <span style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: '#9ca3af',
            flexShrink: 0,
            marginTop: '2px'
          }} />
          <span style={{ textAlign: 'left', lineHeight: '1.3', fontFamily: 'GeistMono, monospace' }}>
            temporarily showing cached <em>wiki</em><br />
            images to avoid server overload.<br />
            live results will come back in <span style={{ display: 'inline-block', minWidth: '18px', textAlign: 'center' }}>{wikiCooldown}</span> sec
            <span
              className="use-other-sources-link"
              onClick={() => {
                setIsMinimized(false);
                // Deselect wikimedia, select both others
                const newSources: SourceType[] = ['freesvg', 'publicdomainvectors'];
                setSelectedSources(newSources);
                // Trigger refresh with explicit sources (state not updated yet)
                fetchRandomSVGs(newSources);
              }}
              style={{
                display: 'inline-block',
                marginTop: '2px',
                textDecoration: 'underline',
                cursor: 'pointer',
                pointerEvents: 'auto',
                opacity: 0.8
              }}
            >
              use other sources instead?
            </span>
          </span>
        </div>

        {/* Spacer for initial card position */}
        <div style={{ height: wikiCooldown > 0 ? '90px' : '70px', transition: 'height 0.4s ease-out' }} />

        {/* Cards Container */}
        <div style={{ position: 'sticky', top: '36px', zIndex: 10 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
          {/* Submit Card */}
          <div
            style={{
              width: 334,
              height: 500,
              background: ACCENT_COLOR,
              borderRadius: 24,
              padding: '27px 27px 26px 27px',
              position: 'relative',
              transition: 'all 0.3s',
              textAlign: 'left',
              transform: `rotate(-2deg)`
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = `rotate(0deg)`;
              e.currentTarget.style.boxShadow = '0 20px 50px rgba(248, 197, 43, 0.4)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = `rotate(-2deg)`;
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            <p
              style={{
                fontFamily: 'HealTheWeb, Arial, sans-serif',
                fontWeight: 400,
                fontSize: 14,
                lineHeight: 1.15,
                color: 'black',
                marginBottom: '16px',
                letterSpacing: '-0.3px'
              }}
            >
              free website to get random SVG's and share posters made with them
            </p>

            <p
              style={{
                fontFamily: 'HealTheWeb, Arial, sans-serif',
                fontWeight: 400,
                fontSize: 14,
                lineHeight: 1.15,
                color: 'black',
                marginTop: '16px',
                letterSpacing: '-0.3px'
              }}
            >
              here is community works{' '}
              <span
                className="arrow-animate"
              >
                →
              </span>
              <br />
              featured on{' '}
              <a
                href="https://instagram.com/randomsvg"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'black', textDecoration: 'underline' }}
                onClick={(e) => { setIsMinimized(false); e.stopPropagation(); }}
              >
                instagram
              </a>
              {' '}as well
            </p>

            <button
              className="submit-btn"
              onClick={() => { setIsMinimized(false); setSubmitModalOpen(true); }}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'center',
                color: 'black',
                textDecoration: 'underline',
                fontFamily: 'HealTheWeb, Arial, sans-serif',
                fontSize: 50,
                fontWeight: 400,
                textDecorationThickness: '1.8px',
                textUnderlineOffset: '4px',
                padding: '112px 0',
                lineHeight: 1.,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                letterSpacing: '-0.5px'
              }}
            >
              SUBMIT<br />MY WORK
            </button>

            <p
              style={{
                position: 'absolute',
                fontFamily: 'HealTheWeb, Arial, sans-serif',
                fontWeight: 400,
                fontSize: 14,
                bottom: 26,
                left: 27,
                color: 'black',
                letterSpacing: '-0.3px'
              }}
            >
              made by{' '}
              <a
                href="https://instagram.com/mxmlsn"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'black', textDecoration: 'underline' }}
                onClick={(e) => { setIsMinimized(false); e.stopPropagation(); }}
              >
                @mxmlsn
              </a>
            </p>
          </div>

          {/* Random Dafont Card */}
          <a
            href="https://random-dafont.vercel.app/"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setIsMinimized(false)}
            style={{
              width: 334,
              height: 70,
              background: '#c00',
              borderRadius: 24,
              padding: '20px 27px',
              position: 'relative',
              transition: 'all 0.3s',
              textAlign: 'left',
              transform: `rotate(-2deg) translateX(11px)`,
              display: 'flex',
              alignItems: 'center',
              textDecoration: 'none'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = `rotate(0deg) translateX(11px)`;
              e.currentTarget.style.boxShadow = '0 20px 50px rgba(204, 0, 0, 0.4)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = `rotate(-2deg) translateX(11px)`;
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            <p
              style={{
                fontFamily: 'HealTheWeb, Arial, sans-serif',
                fontWeight: 400,
                fontSize: 14,
                lineHeight: 1.15,
                color: 'white',
                letterSpacing: '-0.3px',
                textDecoration: 'underline'
              }}
            >
              random-dafont.com
            </p>
          </a>
          </div>
        </div>

        </aside>

      {/* Right Column - 70% */}
      <main style={{ width: '70%', display: 'flex', flexDirection: 'column' }}>
        {/* SVG Grid */}
        <div style={{ position: 'relative', padding: '52px 52px 0 0' }}>
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
              gap: '21px'
            }}
          >
            {svgItems.map((item, index) => (
              <div
                key={index}
                ref={(el) => { cardRefs.current[index] = el; }}
                className="svg-cell"
                onMouseMove={(e) => handleCardMouseMove(e, index)}
                onMouseLeave={() => handleCardMouseLeave(index)}
                style={{
                  position: 'relative',
                  border: '1px solid #DEDEDE',
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
                        src={
                          // Archive images are served directly from /public, no proxy needed
                          item.previewImage.startsWith('/wikimedia-archive/')
                            ? item.previewImage
                            : `/api/proxy-image?url=${encodeURIComponent(item.previewImage)}`
                        }
                        alt={item.title}
                        loading="lazy"
                        style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                        onError={async (e) => {
                          const img = e.currentTarget;

                          // For wikimedia live items: on error, fetch archive directly (no API call)
                          if (item.source === 'wikimedia.org' && item._debug_source === 'live' && !img.dataset.triedArchive) {
                            img.dataset.triedArchive = 'true';
                            // Set client-side cooldown since we're falling back to archive
                            wikiCooldownEndRef.current = Date.now() + 60 * 1000;
                            setWikiCooldown(60);
                            wikiCooldownRef.current = 60;
                            try {
                              // Fetch archive index directly - no API call to avoid rate limit issues
                              const archiveRes = await fetch('/wikimedia-archive/index.json');
                              if (archiveRes.ok) {
                                const archive = await archiveRes.json();
                                if (archive.length > 0) {
                                  const randomItem = archive[Math.floor(Math.random() * archive.length)];
                                  const archiveData = {
                                    title: randomItem.title,
                                    previewImage: `/wikimedia-archive/${randomItem.filename}`,
                                    source: 'wikimedia.org',
                                    sourceUrl: randomItem.wikimediaUrl,
                                    downloadUrl: randomItem.wikimediaUrl,
                                    _debug_source: 'archive' as const
                                  };
                                  img.src = archiveData.previewImage;
                                  setSvgItems(prev => {
                                    const updated = [...prev];
                                    updated[index] = archiveData;
                                    return updated;
                                  });
                                  return;
                                }
                              }
                            } catch {
                              // Continue to fallback
                            }
                          }

                          // Try originalSvgUrl as fallback (only for live wikimedia, and only if not in cooldown)
                          if (item.originalSvgUrl && !img.dataset.triedFallback && wikiCooldownRef.current === 0) {
                            img.dataset.triedFallback = 'true';
                            img.src = `/api/proxy-image?url=${encodeURIComponent(item.originalSvgUrl)}`;
                          } else if (!img.dataset.triedPlaceholder) {
                            // Final fallback: show title as placeholder
                            img.dataset.triedPlaceholder = 'true';
                            img.style.display = 'none';
                            const placeholder = document.createElement('div');
                            placeholder.style.cssText = 'padding: 20px; text-align: center; color: #9ca3af; font-family: Arial; font-size: 12px; word-break: break-word;';
                            placeholder.textContent = item.title;
                            img.parentElement?.appendChild(placeholder);
                          }
                        }}
                      />
                    </a>

                    {/* Archive indicator: small gray circle for archive items only */}
                    {item.source === 'wikimedia.org' && item._debug_source === 'archive' && (
                      <div
                        style={{
                          position: 'absolute',
                          top: '12px',
                          left: '12px',
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          backgroundColor: '#9ca3af',
                          zIndex: 10
                        }}
                      />
                    )}

                    {/* Download button overlay - for all sources */}
                    <button
                      ref={(el) => { btnRefs.current[index] = el as unknown as HTMLAnchorElement; }}
                      onClick={(e) => handleDownload(item, e)}
                      className="download-btn"
                      style={{
                        position: 'absolute',
                        top: '8px',
                        right: '8px',
                        color: 'black',
                        padding: '13px',
                        borderRadius: '13px',
                        boxShadow: '0 25px 50px -12px rgba(248, 197, 43, 0.4)',
                        opacity: downloadBtnOpacities[index],
                        transition: 'opacity 0.05s',
                        zIndex: 10,
                        backgroundColor: ACCENT_COLOR,
                        border: 'none',
                        cursor: 'pointer'
                      }}
                    >
                      <svg width="38.4" height="38.4" viewBox="0 0 66 66" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ transform: 'translateY(2px)' }}>
                        <g clipPath="url(#clip0_download)">
                          <g filter="url(#filter0_download)">
                            <path fillRule="evenodd" clipRule="evenodd" d="M9.58678 31.5308C9.58305 31.4999 9.59243 31.4793 9.59976 31.4668C9.7731 31.1711 16.1797 30.9809 24.1942 30.9041V8.3548H41.8135V30.9041C49.8281 30.9809 56.2345 31.1711 56.408 31.4668C56.8762 32.2656 33.947 55.6279 33.0094 55.6279C32.0877 55.6279 9.83342 33.4778 9.58634 31.5307L9.58678 31.5308Z" fill="#D4A109" stroke="#C39816" strokeWidth="0.818131" strokeLinecap="round"/>
                            <path fillRule="evenodd" clipRule="evenodd" d="M25.5027 9.99382C25.475 17.0333 25.5579 24.0845 25.4618 31.1163C25.058 32.3747 23.424 32.3993 22.3428 32.2262C18.8556 32.3311 15.361 32.2577 11.8809 32.5429C17.6577 39.3635 24.1476 45.5622 30.5375 51.7788C31.3458 52.5326 32.1714 53.2559 33.0084 53.9783C40.4143 47.1803 47.3607 39.8976 54.1211 32.4565C49.5834 32.3131 45.0435 32.2638 40.5043 32.1907V9.66588H25.5018V9.82951V9.99313L25.5027 9.99382Z" fill="#FFEEBC" stroke="#EBD285" strokeWidth="0.818131" strokeLinecap="round"/>
                            <path fillRule="evenodd" clipRule="evenodd" d="M25.5044 9.66788V9.83151V9.99513C25.4897 13.5597 25.5044 17.1268 25.5093 20.6922C25.9888 20.5384 26.4764 20.3911 26.9672 20.252C31.6682 18.9283 36.2988 18.5291 40.5073 18.9283V9.66788H25.5044Z" fill="url(#paint0_download)"/>
                          </g>
                        </g>
                        <defs>
                          <filter id="filter0_download" x="2.10059" y="6.94573" width="61.7236" height="73.0912" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
                            <feFlood floodOpacity="0" result="BackgroundImageFix"/>
                            <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
                            <feOffset dy="1"/>
                            <feGaussianBlur stdDeviation="1"/>
                            <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.12 0"/>
                            <feBlend mode="normal" in2="BackgroundImageFix" result="effect1"/>
                            <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
                            <feOffset dy="4"/>
                            <feGaussianBlur stdDeviation="2"/>
                            <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.11 0"/>
                            <feBlend mode="normal" in2="effect1" result="effect2"/>
                            <feBlend mode="normal" in="SourceGraphic" in2="effect2" result="shape"/>
                          </filter>
                          <linearGradient id="paint0_download" x1="32.6222" y1="10.7699" x2="32.6222" y2="26.1508" gradientUnits="userSpaceOnUse">
                            <stop stopColor="white"/>
                            <stop offset="1" stopColor="white" stopOpacity="0"/>
                          </linearGradient>
                          <clipPath id="clip0_download">
                            <rect width="66" height="66" fill="white"/>
                          </clipPath>
                        </defs>
                      </svg>
                    </button>

                  </>
                ) : null}
              </div>
            ))}
          </div>

          {/* Circular Update Button - Centered over grid */}
          <button
            onClick={() => fetchRandomSVGs()}
            disabled={loading}
            onMouseEnter={() => setUpdateBtnHovered(true)}
            onMouseLeave={() => setUpdateBtnHovered(false)}
            className={`update-btn${updateBtnSpinning ? ' update-btn-spinning' : ''}`}
            style={{
              position: 'absolute',
              top: 'calc(50% + 26px)',
              left: 'calc(50% - 26px)',
              transform: 'translate(-50%, -50%)',
              width: '80px',
              height: '80px',
              borderRadius: '9999px',
              color: 'black',
              fontWeight: '600',
              boxShadow: updateBtnSpinning ? '0 25px 60px -8px rgba(193, 193, 193, 0.6)' : '0 25px 60px -8px rgba(248, 197, 43, 0.6)',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 10,
              backgroundColor: updateBtnSpinning ? '#C1C1C1' : ACCENT_COLOR,
              cursor: loading ? 'not-allowed' : 'pointer',
              border: updateBtnSpinning ? '3px solid #bdbdbdff' : '3px solid #F3C233',
              overflow: 'visible'
            }}
          >
            <img
              src="/upd_icon.svg?v=2"
              alt="Update"
              style={{
                width: '105px',
                height: '105px',
                maxWidth: 'none',
                transform: `rotate(${updateBtnRotation + (updateBtnHovered && !updateBtnSpinning ? -10 : 0)}deg)`,
                transition: updateBtnSpinning ? 'none' : 'transform 0.2s ease-out',
                pointerEvents: 'none'
              }}
            />
          </button>

          {/* Undo/Redo buttons - Below grid, centered */}
          <div style={{
            position: 'absolute',
            bottom: '-58px',
            left: 'calc(50% - 26px)',
            transform: 'translateX(-50%)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}>
            <button
              onClick={handleUndo}
              disabled={historyIndex <= 0}
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '9999px',
                border: '1px solid #DEDEDE',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: historyIndex <= 0 ? 'not-allowed' : 'pointer',
                opacity: historyIndex <= 0 ? 0.3 : 1,
                backgroundColor: 'transparent'
              }}
              title="Undo"
            >
              <svg style={{ width: '21.06px', height: '21.06px', transform: 'rotate(90deg)' }} viewBox="0 0 26 26" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M1 13.2188L12.9674 25.1862L24.9371 13.2165" stroke="#AEAEAE" strokeWidth="1" strokeLinecap="round"/>
                <path d="M12.9683 1.61304L12.9683 25.2298" stroke="#AEAEAE" strokeWidth="1" strokeLinecap="round"/>
              </svg>
            </button>
            <button
              onClick={handleRedo}
              disabled={historyIndex >= history.length - 1}
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '9999px',
                border: '1px solid #DEDEDE',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: historyIndex >= history.length - 1 ? 'not-allowed' : 'pointer',
                opacity: historyIndex >= history.length - 1 ? 0.3 : 1,
                backgroundColor: 'transparent'
              }}
              title="Redo"
            >
              <svg style={{ width: '21.06px', height: '21.06px', transform: 'rotate(-90deg)' }} viewBox="0 0 26 26" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M1 13.2188L12.9674 25.1862L24.9371 13.2165" stroke="#AEAEAE" strokeWidth="1" strokeLinecap="round"/>
                <path d="M12.9683 1.61304L12.9683 25.2298" stroke="#AEAEAE" strokeWidth="1" strokeLinecap="round"/>
              </svg>
            </button>
          </div>

          {/* Minimize button - Right aligned to grid */}
          <div
            className={`minimize-btn-wrapper${isMinimized ? ' minimized' : ''}`}
            style={{
              position: 'absolute',
              bottom: '-58px',
              right: '52px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <span
              className="minimize-label"
              style={{
                fontFamily: 'Arial',
                fontSize: '11px',
                color: '#9ca3af',
                opacity: 0,
                transition: 'opacity 0.2s',
                whiteSpace: 'nowrap'
              }}
            >
              {isMinimized ? 'show sidebar' : 'hide sidebar'}
            </span>
            <button
              onClick={() => setIsMinimized(!isMinimized)}
              className={`minimize-btn${isMinimized ? ' minimized' : ''}`}
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '9999px',
                border: isMinimized ? 'none' : '1px solid #DEDEDE',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                backgroundColor: isMinimized ? ACCENT_COLOR : 'transparent',
                transition: 'background-color 0.2s'
              }}
              title={isMinimized ? 'Show sidebar' : 'Hide sidebar'}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="6" cy="6" r="5.5" stroke={isMinimized ? 'black' : '#AEAEAE'} strokeWidth="1" fill={isMinimized ? 'black' : 'none'}/>
              </svg>
            </button>
          </div>
        </div>

        {/* Gallery Section */}
        <Gallery />
      </main>

      {/* Submit Modal */}
      <SubmitModal
        isOpen={submitModalOpen}
        onClose={() => setSubmitModalOpen(false)}
      />

      {/* Warning Message - Floating overlay */}
      {showWarning && (
        <div
          id="sources-warning"
          style={{
            position: 'fixed',
            top: 'calc(30px + 105px + 90px - 21px + 20px + 24px - 60px + 20px + 20px - 10px)',
            left: '15%',
            transform: 'translateX(-50%) rotate(-2deg)',
            transformOrigin: 'center center',
            backgroundColor: ACCENT_COLOR,
            padding: '12px 24px',
            borderRadius: '12px',
            opacity: 0,
            textAlign: 'center',
            zIndex: 1000,
            pointerEvents: 'none',
            width: 'fit-content',
            animation: 'fadeInFast 0.2s ease-out forwards'
          }}
        >
          <div style={{ fontFamily: 'HealTheWeb, Arial', fontSize: '14px', color: 'black', whiteSpace: 'nowrap' }}>
            works faster with all sources enabled
          </div>
        </div>
      )}

      <style jsx global>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes fadeInFast {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes fadeOutSlow {
          from { opacity: 1; }
          to { opacity: 0; }
        }
        @keyframes arrow-slide {
          0%, 100% {
            transform: translateX(-2px);
          }
          50% {
            transform: translateX(6px);
          }
        }
                .checkbox-label:hover {
          background-color: rgba(255, 235, 175, 0.3) !important;
        }
        .checkbox-label:hover .checkbox-hover-text {
          opacity: 1 !important;
        }
        .arrow-animate {
          display: inline-block;
          animation: arrow-slide 3.6s ease-in-out infinite;
        }
        .submit-btn:hover {
          font-weight: bold !important;
        }
        .logo-svg-container:hover {
          transform: translateY(var(--offset-y)) rotate(var(--rotation)) scale(1.1) !important;
        }
        .download-btn {
          transition: opacity 0.05s, transform 0.1s !important;
        }
        .use-other-sources-link::after {
          content: '';
          opacity: 0;
          margin-left: 4px;
          transition: opacity 0.2s ease-out;
        }
        .use-other-sources-link:hover::after {
          content: ' yes';
          opacity: 1;
        }
        .download-btn:hover {
          transform: scale(1.16) !important;
        }
        .update-btn:hover:not(:disabled):not(.update-btn-spinning) {
          transform: translate(-50%, -50%) scale(1.06) !important;
        }
        .minimize-btn:not(.minimized):hover {
          background-color: rgba(255, 235, 175, 0.3) !important;
        }
        .minimize-btn-wrapper:hover .minimize-label {
          opacity: 1 !important;
        }
      `}</style>
    </div>
  );
}

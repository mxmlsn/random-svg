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

export default function Home() {
  const [svgItems, setSvgItems] = useState<(SVGData | null)[]>(Array(6).fill(null));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSources, setSelectedSources] = useState<SourceType[]>(['freesvg', 'publicdomainvectors', 'wikimedia']);
  const [initialLoad, setInitialLoad] = useState(true);
  const [history, setHistory] = useState<(SVGData | null)[][]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [submitModalOpen, setSubmitModalOpen] = useState(false);
  const [logoSvgs, setLogoSvgs] = useState<string[]>(Array(6).fill(''));
  const [logoRotations, setLogoRotations] = useState<number[]>(Array(6).fill(0));
  const [logoDirections, setLogoDirections] = useState<number[]>(() =>
    Array(6).fill(0).map(() => Math.random() > 0.5 ? 1 : -1)
  );
  const [logoVisibility, setLogoVisibility] = useState<boolean[]>(Array(6).fill(true));
  const [showWarning, setShowWarning] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [wikiCooldown, setWikiCooldown] = useState(0); // seconds remaining until live wiki
  const wikiCooldownRef = useRef(0); // ref for callbacks to access current cooldown
  const [wikiGlow, setWikiGlow] = useState(false); // glow effect when cooldown ends
  const prevCooldownRef = useRef(0); // track previous cooldown for transition detection
  const wikiCooldownEndRef = useRef(0); // client-side timestamp when cooldown ends (survives server restarts)
  const [downloadBtnOpacities, setDownloadBtnOpacities] = useState<number[]>(Array(6).fill(0));
  const shownArchiveFilesRef = useRef<Set<string>>(new Set()); // Track shown wiki archive files to avoid repeats (ref for sync access)
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [updateBtnHovered, setUpdateBtnHovered] = useState(false);
  const [updateBtnSpinning, setUpdateBtnSpinning] = useState(false); // CSS animation trigger
  const [updateBtnSlowingDown, setUpdateBtnSlowingDown] = useState(false); // Slowing down phase
  const btnRefs = useRef<(HTMLAnchorElement | null)[]>([]);

  // Start slowing down animation, then stop
  const stopSpinning = useCallback(() => {
    setUpdateBtnSlowingDown(true);
    // After slow-down animation completes (500ms), fully stop
    setTimeout(() => {
      setUpdateBtnSpinning(false);
      setUpdateBtnSlowingDown(false);
    }, 500);
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

  // Parallax effect for submit card
  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY;
      setScrollOffset(scrollY * 0.1);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
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

  // Poll wikimedia rate limit status for countdown
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    const checkStatus = async () => {
      const now = Date.now();

      // First check client-side timer (survives server restarts)
      const clientSecondsRemaining = wikiCooldownEndRef.current > now
        ? Math.ceil((wikiCooldownEndRef.current - now) / 1000)
        : 0;

      try {
        const res = await fetch('/api/wikimedia-status');
        if (res.ok) {
          const data = await res.json();

          // Use server value if it's greater (new rate limit detected)
          // Otherwise use client value (server might have restarted)
          let effectiveSeconds = data.secondsRemaining;
          if (clientSecondsRemaining > data.secondsRemaining) {
            effectiveSeconds = clientSecondsRemaining;
          } else if (data.secondsRemaining > 0 && data.limitedUntil) {
            // Server has new/valid cooldown - update client timestamp
            wikiCooldownEndRef.current = data.limitedUntil;
          }

          // Detect transition from >0 to 0 for glow effect (only if wikimedia is NOT selected)
          if (prevCooldownRef.current > 0 && effectiveSeconds === 0 && !selectedSources.includes('wikimedia')) {
            setWikiGlow(true);
            setTimeout(() => setWikiGlow(false), 1000);
          }
          prevCooldownRef.current = effectiveSeconds;
          setWikiCooldown(effectiveSeconds);
          wikiCooldownRef.current = effectiveSeconds;
        }
      } catch {
        // On error, still use client-side timer if available
        if (clientSecondsRemaining > 0) {
          setWikiCooldown(clientSecondsRemaining);
          wikiCooldownRef.current = clientSecondsRemaining;
        }
      }
    };

    // Start polling when cooldown is active
    checkStatus();
    interval = setInterval(checkStatus, 1000);

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [selectedSources]);

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
    setUpdateBtnSpinning(true);

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

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#F4F4F4', alignItems: 'flex-start' }}>
      {/* Left Column - 30% */}
      <aside style={{ width: '30%', padding: '36px', display: 'flex', flexDirection: 'column', gap: '52px', opacity: isMinimized ? 0.1 : 1, transition: 'opacity 0.3s' }}>
        {/* Logo */}
        <div style={{ marginTop: '30px', marginBottom: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
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
              backgroundColor: selectedSources.includes('publicdomainvectors') ? ACCENT_COLOR : 'transparent',
              border: selectedSources.includes('publicdomainvectors') ? 'none' : '1px solid #DEDEDE',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative'
            }}>
              <span className="checkbox-hover-text" style={{ fontFamily: 'HealTheWeb, Arial', fontSize: '14px', color: selectedSources.includes('publicdomainvectors') ? '#D3A61B' : '#ACACAC', opacity: 0, transition: 'opacity 0.15s' }}>
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
              backgroundColor: selectedSources.includes('freesvg') ? ACCENT_COLOR : 'transparent',
              border: selectedSources.includes('freesvg') ? 'none' : '1px solid #DEDEDE',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative'
            }}>
              <span className="checkbox-hover-text" style={{ fontFamily: 'HealTheWeb, Arial', fontSize: '14px', color: selectedSources.includes('freesvg') ? '#D3A61B' : '#ACACAC', opacity: 0, transition: 'opacity 0.15s' }}>
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
              backgroundColor: selectedSources.includes('wikimedia') ? ACCENT_COLOR : 'transparent',
              border: selectedSources.includes('wikimedia') ? 'none' : '1px solid #DEDEDE',
              flexShrink: 0,
              boxShadow: wikiGlow ? `0 0 20px 8px ${ACCENT_COLOR}` : 'none',
              transition: 'box-shadow 0.3s ease-out',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative'
            }}>
              <span className="checkbox-hover-text" style={{ fontFamily: 'HealTheWeb, Arial', fontSize: '14px', color: selectedSources.includes('wikimedia') ? '#D3A61B' : '#ACACAC', opacity: 0, transition: 'opacity 0.15s' }}>
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
            marginTop: '-35px',
            fontFamily: 'monospace',
            fontSize: '11px',
            color: '#9ca3af',
            opacity: wikiCooldown > 0 ? 1 : 0,
            transition: 'opacity 0.15s ease-out',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            gap: '7px'
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
              onClick={() => {
                setIsMinimized(false);
                // Deselect wikimedia, select both others
                const newSources: SourceType[] = ['freesvg', 'publicdomainvectors'];
                setSelectedSources(newSources);
                // Trigger refresh with explicit sources (state not updated yet)
                fetchRandomSVGs(newSources);
              }}
              style={{
                display: 'block',
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

        {/* Cards Container */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', marginTop: wikiCooldown > 0 ? '19px' : '-41px', transition: 'margin-top 0.15s ease-out', position: 'sticky', top: '36px' }}>
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
              transform: `rotate(-2deg) translateY(${scrollOffset}px)`
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = `rotate(0deg) translateY(${scrollOffset}px)`;
              e.currentTarget.style.boxShadow = '0 20px 50px rgba(248, 197, 43, 0.4)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = `rotate(-2deg) translateY(${scrollOffset}px)`;
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
              transform: `rotate(-2deg) translateY(${scrollOffset}px) translateX(11px)`,
              display: 'flex',
              alignItems: 'center',
              textDecoration: 'none'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = `rotate(0deg) translateY(${scrollOffset}px) translateX(11px)`;
              e.currentTarget.style.boxShadow = '0 20px 50px rgba(204, 0, 0, 0.4)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = `rotate(-2deg) translateY(${scrollOffset}px) translateX(11px)`;
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
              gap: '21px',
              height: '100%'
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
                      title="Download SVG"
                    >
                      <svg width="27" height="27" viewBox="0 0 66 66" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path fillRule="evenodd" clipRule="evenodd" d="M51.624 32.3772L32.5578 56.553L13.3439 31.8493L24.6188 31.8704C24.6188 31.8704 23.1831 21.5877 28.8839 15.5068C34.5848 9.40482 47.8234 9.44706 47.8234 9.44706C47.8234 9.44706 41.9325 12.8042 39.7788 18.9907C37.6041 25.1772 38.7442 32.2082 38.7442 32.2082L51.624 32.3772Z" stroke="#323232" strokeWidth="1.5314"/>
                        <path fillRule="evenodd" clipRule="evenodd" d="M47.5068 34.4886L39.8423 43.99C31.6922 42.1531 33.7614 35.0164 26.5193 33.5806C26.5193 33.5806 24.4711 24.776 28.5673 17.8505C32.5156 11.1573 43.5373 11.474 43.5373 11.474C43.5373 11.474 39.2722 13.881 37.3086 19.9197C35.345 25.9795 37.0764 34.3196 37.0764 34.3196L47.5068 34.4886Z" fill="url(#paint0_linear_download)"/>
                        <defs>
                          <linearGradient id="paint0_linear_download" x1="54.5679" y1="-0.788435" x2="14.8849" y2="51.9743" gradientUnits="userSpaceOnUse">
                            <stop stopColor="white"/>
                            <stop offset="1" stopColor="white" stopOpacity="0"/>
                          </linearGradient>
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
              boxShadow: updateBtnSpinning ? '0 25px 50px -12px rgba(193, 193, 193, 0.4)' : '0 25px 50px -12px rgba(248, 197, 43, 0.4)',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 10,
              backgroundColor: updateBtnSpinning ? '#C1C1C1' : ACCENT_COLOR,
              cursor: loading ? 'not-allowed' : 'pointer',
              border: 'none'
            }}
            title={loading ? 'Loading...' : 'Update SVGs'}
          >
            <svg
              width="76"
              height="76"
              viewBox="0 0 103 103"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className={updateBtnSpinning ? (updateBtnSlowingDown ? 'update-icon-slowing' : 'update-icon-spinning') : ''}
              style={{
                transform: updateBtnHovered && !updateBtnSpinning ? 'rotate(-10deg)' : undefined,
                transition: updateBtnSpinning ? 'none' : 'transform 0.2s ease-out'
              }}
            >
              <path fillRule="evenodd" clipRule="evenodd" d="M52.4326 45.0536L71.4989 69.2294L90.7128 44.5257L79.4378 44.5468C79.4378 44.5468 80.8736 34.2642 75.1727 28.1833C69.4719 22.0812 56.2333 22.1235 56.2333 22.1235C56.2333 22.1235 62.1242 25.4806 64.2778 31.6671C66.4526 37.8536 65.3124 44.8847 65.3124 44.8847L52.4326 45.0536Z" fill="#C1C1C1" stroke="#323232" strokeWidth="1.5314"/>
              <path fillRule="evenodd" clipRule="evenodd" d="M50.3847 57.7644L31.3396 33.5885L12.1045 58.2922L23.3796 58.2711C23.3796 58.2711 21.9437 68.5537 27.6446 74.6346C33.3454 80.7366 46.6052 80.6944 46.6052 80.6944C46.6052 80.6944 40.7144 77.3373 38.5396 71.1508C36.3859 64.9643 37.526 57.9332 37.526 57.9332L50.3847 57.7644Z" fill="#C1C1C1" stroke="#323232" strokeWidth="1.5314"/>
              <path fillRule="evenodd" clipRule="evenodd" d="M41.6431 48.1785L32.1206 36.629L16.4961 56.413L25.0896 56.3708C36.9558 55.5262 33.7253 48.4952 41.6431 48.1785Z" fill="url(#paint0_linear_update)"/>
              <path fillRule="evenodd" clipRule="evenodd" d="M56.5498 47.165L64.2143 56.6664C72.3644 54.8295 70.2952 47.6928 77.5374 46.257C77.5374 46.257 79.5855 37.4524 75.4894 30.527C71.541 23.8337 60.5193 24.1504 60.5193 24.1504C60.5193 24.1504 64.7844 26.5574 66.748 32.5961C68.7117 38.6559 66.9803 46.9961 66.9803 46.9961L56.5498 47.165Z" fill="url(#paint1_linear_update)"/>
              <defs>
                <linearGradient id="paint0_linear_update" x1="14.5969" y1="31.8849" x2="42.0522" y2="64.5684" gradientUnits="userSpaceOnUse">
                  <stop stopColor="white"/>
                  <stop offset="1" stopColor="white" stopOpacity="0"/>
                </linearGradient>
                <linearGradient id="paint1_linear_update" x1="49.4887" y1="11.888" x2="89.1718" y2="64.6507" gradientUnits="userSpaceOnUse">
                  <stop stopColor="white"/>
                  <stop offset="1" stopColor="white" stopOpacity="0"/>
                </linearGradient>
              </defs>
            </svg>
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
        .update-icon-spinning {
          animation: spin 1s linear infinite;
        }
        .update-icon-slowing {
          animation: spinSlow 0.5s ease-out forwards;
        }
        @keyframes spinSlow {
          from { transform: rotate(0deg); }
          to { transform: rotate(180deg); }
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
          background-color: rgba(0, 0, 0, 0.05) !important;
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
        .download-btn:hover {
          transform: scale(1.16) !important;
        }
        .update-btn:hover:not(:disabled):not(.update-btn-spinning) {
          transform: translate(-50%, -50%) scale(1.06) !important;
        }
        .minimize-btn:not(.minimized):hover {
          background-color: rgba(0, 0, 0, 0.05) !important;
        }
        .minimize-btn-wrapper:hover .minimize-label {
          opacity: 1 !important;
        }
      `}</style>
    </div>
  );
}

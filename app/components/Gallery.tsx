'use client';

import { useState, useEffect, useCallback } from 'react';

interface Poster {
  id: string;
  instagram: string | null;
  image_url: string;
  svg_sources?: string[];
  used_fonts: boolean;
  fonts?: string[];
  created_at: string;
}

export default function Gallery() {
  const [posters, setPosters] = useState<Poster[]>([]);
  const [loading, setLoading] = useState(true);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isMobile, setIsMobile] = useState(false);

  // Check for mobile viewport
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    fetchPosters();
  }, []);

  // Lock body scroll when lightbox is open
  useEffect(() => {
    if (lightboxOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [lightboxOpen]);

  const fetchPosters = async () => {
    try {
      const response = await fetch('/api/gallery');
      if (response.ok) {
        const data = await response.json();
        setPosters(data);
      }
    } catch (error) {
      console.error('Failed to fetch posters:', error);
    } finally {
      setLoading(false);
    }
  };

  const openLightbox = (index: number) => {
    setCurrentIndex(index);
    setLightboxOpen(true);
  };

  const closeLightbox = () => {
    setLightboxOpen(false);
  };

  const goToPrev = useCallback(() => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : prev));
  }, []);

  const goToNext = useCallback(() => {
    setCurrentIndex((prev) => (prev < posters.length - 1 ? prev + 1 : prev));
  }, [posters.length]);

  // Keyboard navigation
  useEffect(() => {
    if (!lightboxOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowLeft') goToPrev();
      if (e.key === 'ArrowRight') goToNext();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxOpen, goToPrev, goToNext]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}.${month}.${year}`;
  };

  const currentPoster = posters[currentIndex];

  return (
    <section
      className="w-full"
      style={{
        padding: isMobile ? '60px 40px 40px' : '120px 52px 20px 0',
      }}
    >
      {/* Gallery Container - horizontal scroll with inline-block */}
      <div
        className="text-center"
        style={{ fontSize: 0 }}
      >
        {loading ? (
          <div className="flex justify-center items-center py-20">
            <div className="w-8 h-8 border-2 border-[#c00] border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : (
          <>
            {/* Poster Cards */}
            {posters.map((poster, index) => (
              <div
                key={poster.id}
                className="inline-block align-top cursor-pointer poster-card"
                style={{
                  marginRight: isMobile ? 16 : 18,
                  marginBottom: 18,
                  transition: 'transform 0.1s ease-out'
                }}
                onClick={() => openLightbox(index)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={poster.image_url}
                  alt={poster.instagram ? `Poster by @${poster.instagram}` : 'Poster'}
                  className="block"
                  style={{ height: isMobile ? 280 : 340, width: 'auto' }}
                  loading="lazy"
                />
                <div
                  className="flex justify-center items-center mt-0.5"
                  style={{ fontSize: 14, minHeight: '1.5em' }}
                >
                  {poster.instagram ? (
                    <a
                      href={`https://instagram.com/${poster.instagram}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-gray-500 no-underline transition-colors hover:text-[#c00]"
                      style={{ fontSize: 14 }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      @{poster.instagram}
                    </a>
                  ) : (
                    <span style={{ opacity: 0, fontSize: 14 }}>&nbsp;</span>
                  )}
                </div>
              </div>
            ))}

            {posters.length === 0 && (
              <div className="text-center py-20 text-gray-500" style={{ fontSize: 16 }}>
                No posters yet. Be the first to submit!
              </div>
            )}
          </>
        )}
      </div>

      {/* Lightbox */}
      {lightboxOpen && currentPoster && (
        <div
          className="fixed inset-0 flex items-center justify-center"
          style={{ zIndex: 2000 }}
        >
          {/* Backdrop with blur */}
          <div
            className="absolute inset-0"
            style={{
              background: 'rgba(0, 0, 0, 0.9)',
              backdropFilter: 'blur(4px)',
              WebkitBackdropFilter: 'blur(4px)',
            }}
            onClick={closeLightbox}
          />

          {/* Close button */}
          <button
            onClick={closeLightbox}
            className="fixed flex items-center justify-center text-white transition-colors"
            style={{
              top: isMobile ? 16 : 24,
              right: isMobile ? 16 : 24,
              width: isMobile ? 40 : 48,
              height: isMobile ? 40 : 48,
              border: 'none',
              background: 'rgba(255, 255, 255, 0.1)',
              backdropFilter: 'blur(10px)',
              borderRadius: '50%',
              fontSize: isMobile ? 24 : 28,
              zIndex: 10,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
            }}
          >
            ×
          </button>

          {/* Navigation - Previous */}
          <button
            onClick={goToPrev}
            disabled={currentIndex === 0}
            className="fixed flex items-center justify-center text-white transition-all"
            style={{
              left: isMobile ? 16 : 24,
              top: '50%',
              transform: 'translateY(-50%)',
              width: isMobile ? 40 : 48,
              height: isMobile ? 40 : 48,
              border: 'none',
              background: 'rgba(255, 255, 255, 0.1)',
              backdropFilter: 'blur(10px)',
              borderRadius: '50%',
              zIndex: 10,
              opacity: currentIndex === 0 ? 0.3 : 1,
              cursor: currentIndex === 0 ? 'not-allowed' : 'pointer',
            }}
            onMouseEnter={(e) => {
              if (currentIndex !== 0) {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
            }}
          >
            ←
          </button>

          {/* Navigation - Next */}
          <button
            onClick={goToNext}
            disabled={currentIndex === posters.length - 1}
            className="fixed flex items-center justify-center text-white transition-all"
            style={{
              right: isMobile ? 16 : 24,
              top: '50%',
              transform: 'translateY(-50%)',
              width: isMobile ? 40 : 48,
              height: isMobile ? 40 : 48,
              border: 'none',
              background: 'rgba(255, 255, 255, 0.1)',
              backdropFilter: 'blur(10px)',
              borderRadius: '50%',
              zIndex: 10,
              opacity: currentIndex === posters.length - 1 ? 0.3 : 1,
              cursor: currentIndex === posters.length - 1 ? 'not-allowed' : 'pointer',
            }}
            onMouseEnter={(e) => {
              if (currentIndex !== posters.length - 1) {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
            }}
          >
            →
          </button>

          {/* Image */}
          <div
            className="relative flex items-center justify-center"
            style={{ maxWidth: '90vw', maxHeight: '90vh', zIndex: 1 }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={currentPoster.image_url}
              alt={currentPoster.instagram ? `Poster by @${currentPoster.instagram}` : 'Poster'}
              style={{
                maxWidth: '100%',
                maxHeight: '90vh',
                objectFit: 'contain',
                borderRadius: 4,
              }}
            />
          </div>

          {/* Info panel */}
          <div
            className="fixed flex flex-col"
            style={{
              bottom: isMobile ? 16 : 15,
              left: isMobile ? 16 : 15,
              background: 'transparent',
              padding: isMobile ? '10px 16px' : 8,
              borderRadius: 3,
              width: 192,
              minHeight: 56,
              gap: 4,
              zIndex: 2001,
              fontFamily: '"Arial Narrow", Arial, sans-serif',
              fontSize: isMobile ? 13 : 14,
              lineHeight: 1.3,
            }}
          >
            {currentPoster.instagram && (
              <a
                href={`https://instagram.com/${currentPoster.instagram}`}
                target="_blank"
                rel="noopener noreferrer"
                className="transition-colors no-underline hover:underline"
                style={{
                  fontSize: 14,
                  color: '#d6d6d6',
                  whiteSpace: 'pre',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = '#f8c52bff';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = '#d6d6d6';
                }}
              >
                {'author:\t@' + currentPoster.instagram}
              </a>
            )}

            {currentPoster.svg_sources && currentPoster.svg_sources.length > 0 && (
              <div className="flex flex-col" style={{ fontSize: 14, color: '#d6d6d6', gap: 0 }}>
                {currentPoster.svg_sources.map((source, i) => (
                  <span key={i} style={{ lineHeight: 1.3, whiteSpace: 'pre' }}>
                    {i === 0 ? 'sources:\t' : '\t\t'}{source}
                  </span>
                ))}
              </div>
            )}

            {currentPoster.used_fonts && currentPoster.fonts && currentPoster.fonts.length > 0 && (
              <div className="flex flex-col" style={{ fontSize: 14, color: '#d6d6d6', gap: 0 }}>
                {currentPoster.fonts.map((font, i) => (
                  <span key={i} style={{ lineHeight: 1.3, whiteSpace: 'pre' }}>
                    {i === 0 ? 'fonts:\t\t' : '\t\t\t'}{font}
                  </span>
                ))}
              </div>
            )}

            {currentPoster.used_fonts && (
              <div style={{ fontSize: 14, color: '#d6d6d6' }}>
                <a
                  href="https://random-dafont.vercel.app/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline transition-colors"
                  style={{ color: '#d6d6d6', whiteSpace: 'pre-line' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = '#f8c52bff';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = '#d6d6d6';
                  }}
                >
                  include fonts from{'\n'}random-dafont.com
                </a>
              </div>
            )}

            <div style={{ fontSize: 14, color: '#d6d6d6', marginTop: 8 }}>
              {formatDate(currentPoster.created_at)}
            </div>
          </div>
        </div>
      )}

      {/* CSS Animation for arrow */}
      <style jsx>{`
        @keyframes arrow-slide {
          0%, 100% {
            transform: translateX(-2px);
          }
          50% {
            transform: translateX(6px);
          }
        }
        .poster-card:hover {
          transform: translateY(-3px) !important;
        }
      `}</style>
    </section>
  );
}

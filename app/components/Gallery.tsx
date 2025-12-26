'use client';

import { useState, useEffect, useCallback } from 'react';

interface Poster {
  id: string;
  instagram: string | null;
  image_url: string;
  svg_sources?: string[];
  used_fonts: boolean;
  created_at: string;
}

interface GalleryProps {
  onSubmitClick: () => void;
}

export default function Gallery({ onSubmitClick }: GalleryProps) {
  const [posters, setPosters] = useState<Poster[]>([]);
  const [loading, setLoading] = useState(true);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    fetchPosters();
  }, []);

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
    return date.toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const currentPoster = posters[currentIndex];

  return (
    <section className="border-t border-gray-300 bg-[#F7F7F7]">
      {/* Gallery Header */}
      <div className="px-8 py-6 border-b border-gray-300 flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-800">Gallery</h2>
        <span className="text-gray-500 text-sm">{posters.length} posters</span>
      </div>

      {/* Gallery Grid */}
      <div className="p-8">
        {loading ? (
          <div className="flex justify-center items-center py-20">
            <div className="w-8 h-8 border-2 border-[#C6D000] border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {/* Info Card - First position */}
            <div className="aspect-[3/4] border border-gray-300 rounded-lg p-6 flex flex-col justify-between bg-white">
              <div>
                <h3 className="text-lg font-bold text-gray-800 mb-2">Share Your Work</h3>
                <p className="text-sm text-gray-600 leading-relaxed">
                  Made something cool with SVGs from this site? Submit your poster and get featured in the gallery!
                </p>
              </div>
              <button
                onClick={onSubmitClick}
                className="w-full py-3 rounded-lg text-white font-semibold transition-transform hover:scale-[1.02]"
                style={{ backgroundColor: '#C6D000' }}
              >
                Submit My Work
              </button>
            </div>

            {/* Poster Cards */}
            {posters.map((poster, index) => (
              <div
                key={poster.id}
                className="aspect-[3/4] border border-gray-300 rounded-lg overflow-hidden cursor-pointer hover:border-gray-400 transition-colors group relative"
                onClick={() => openLightbox(index)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={poster.image_url}
                  alt={poster.instagram ? `Poster by @${poster.instagram}` : 'Poster'}
                  className="w-full h-full object-cover"
                />
                {/* Hover overlay with instagram */}
                {poster.instagram && (
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-3 opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-white text-sm">@{poster.instagram}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightboxOpen && currentPoster && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/90"
            onClick={closeLightbox}
          ></div>

          {/* Close button */}
          <button
            onClick={closeLightbox}
            className="absolute top-6 right-6 text-white text-4xl hover:text-gray-300 transition-colors z-10"
          >
            &times;
          </button>

          {/* Navigation buttons */}
          <button
            onClick={goToPrev}
            disabled={currentIndex === 0}
            className="absolute left-6 top-1/2 -translate-y-1/2 text-white text-2xl p-4 hover:text-gray-300 transition-colors disabled:opacity-30 disabled:cursor-not-allowed z-10"
          >
            ←
          </button>
          <button
            onClick={goToNext}
            disabled={currentIndex === posters.length - 1}
            className="absolute right-6 top-1/2 -translate-y-1/2 text-white text-2xl p-4 hover:text-gray-300 transition-colors disabled:opacity-30 disabled:cursor-not-allowed z-10"
          >
            →
          </button>

          {/* Image */}
          <div className="relative max-w-[90vw] max-h-[85vh] z-10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={currentPoster.image_url}
              alt={currentPoster.instagram ? `Poster by @${currentPoster.instagram}` : 'Poster'}
              className="max-w-full max-h-[85vh] object-contain"
            />
          </div>

          {/* Info panel */}
          <div className="absolute bottom-6 left-6 text-white z-10 font-mono text-sm space-y-1">
            {currentPoster.instagram && (
              <a
                href={`https://instagram.com/${currentPoster.instagram}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block hover:text-[#C6D000] transition-colors"
              >
                author: @{currentPoster.instagram}
              </a>
            )}
            {currentPoster.svg_sources && currentPoster.svg_sources.length > 0 && (
              <div className="text-gray-300">
                sources: {currentPoster.svg_sources.join(', ')}
              </div>
            )}
            {currentPoster.used_fonts && (
              <a
                href="https://random-dafont.vercel.app/"
                target="_blank"
                rel="noopener noreferrer"
                className="block text-gray-300 hover:text-[#C6D000] transition-colors"
              >
                includes assets from random-dafont.com
              </a>
            )}
            <div className="text-gray-400">
              {formatDate(currentPoster.created_at)}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

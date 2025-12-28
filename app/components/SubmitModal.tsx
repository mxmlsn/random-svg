'use client';

import { useState, useRef, ChangeEvent, useEffect } from 'react';

interface SubmitModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type SubmitState = 'form' | 'uploading' | 'success' | 'error';

// Accent color from random-svg
const ACCENT_COLOR = '#f8c52b';
const ACCENT_COLOR_LIGHT = 'rgba(248, 197, 43, 0.1)';
const ACCENT_COLOR_GLOW = 'rgba(248, 197, 43, 0.25)';

export default function SubmitModal({ isOpen, onClose }: SubmitModalProps) {
  const [state, setState] = useState<SubmitState>('form');
  const [error, setError] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageData, setImageData] = useState<{ base64: string; name: string; type: string } | null>(null);
  const [instagram, setInstagram] = useState('');
  const [usedFonts, setUsedFonts] = useState(false);
  const [fontNames, setFontNames] = useState<string[]>(['']);
  const [showAnonymousHint, setShowAnonymousHint] = useState(false);
  const [isAnonymousConfirmed, setIsAnonymousConfirmed] = useState(false);
  const [showFontAddBtn, setShowFontAddBtn] = useState(false);
  const [isUploadHovered, setIsUploadHovered] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fontInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Auto-resize font inputs
  const autoResizeFontInput = (input: HTMLInputElement) => {
    const span = document.createElement('span');
    span.style.visibility = 'hidden';
    span.style.position = 'absolute';
    span.style.whiteSpace = 'pre';
    span.style.font = window.getComputedStyle(input).font;
    span.textContent = input.value || input.placeholder;
    document.body.appendChild(span);
    const textWidth = span.offsetWidth;
    document.body.removeChild(span);
    const minWidth = 85;
    const maxWidth = 300;
    const newWidth = Math.min(Math.max(textWidth + 24, minWidth), maxWidth);
    input.style.width = newWidth + 'px';
  };

  // Initialize font input widths
  useEffect(() => {
    fontInputRefs.current.forEach(input => {
      if (input) autoResizeFontInput(input);
    });
  }, [fontNames.length]);

  const resetForm = () => {
    setState('form');
    setError(null);
    setImagePreview(null);
    setImageData(null);
    setInstagram('');
    setUsedFonts(false);
    setFontNames(['']);
    setShowAnonymousHint(false);
    setIsAnonymousConfirmed(false);
    setShowFontAddBtn(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      setError('Please upload a JPG, PNG, or WebP image');
      return;
    }

    if (file.size > 3 * 1024 * 1024) {
      setError('Image must be less than 3MB');
      return;
    }

    setError(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setImagePreview(base64);
      setImageData({
        base64,
        name: file.name,
        type: file.type,
      });
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && fileInputRef.current) {
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      fileInputRef.current.files = dataTransfer.files;
      handleFileChange({ target: { files: dataTransfer.files } } as ChangeEvent<HTMLInputElement>);
    }
  };

  const clearFileSelection = () => {
    setImagePreview(null);
    setImageData(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const addFontName = () => {
    if (fontNames.length < 10) {
      const lastFont = fontNames[fontNames.length - 1];
      if (!lastFont.trim()) {
        fontInputRefs.current[fontNames.length - 1]?.focus();
        return;
      }
      setFontNames([...fontNames, '']);
    }
  };

  const updateFontName = (index: number, value: string) => {
    const updated = [...fontNames];
    updated[index] = value;
    setFontNames(updated);
  };

  const handleSubmit = async () => {
    if (!imageData) {
      setError('Please select an image');
      return;
    }

    if (!instagram.trim() && !isAnonymousConfirmed) {
      setShowAnonymousHint(true);
      setIsAnonymousConfirmed(true);
      setTimeout(() => setShowAnonymousHint(false), 2000);
      return;
    }

    setState('uploading');
    setError(null);

    try {
      const response = await fetch('/api/submit-poster', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instagram: instagram.trim() || null,
          usedFonts,
          fontNames: usedFonts ? fontNames.filter(f => f.trim()) : [],
          imageBase64: imageData.base64,
          fileName: imageData.name,
          fileType: imageData.type,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to submit poster');
      }

      setState('success');
    } catch (err) {
      console.error('Submit error:', err);
      setError('Failed to submit. Please try again.');
      setState('form');
    }
  };

  const handleSubmitAnother = () => {
    resetForm();
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      zIndex: 1000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      {/* Backdrop */}
      <div
        onClick={handleClose}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          background: 'rgba(0, 0, 0, 0.6)',
          backdropFilter: 'blur(4px)'
        }}
      />

      {/* Anonymous message */}
      <div style={{
        position: 'fixed',
        top: 'calc(31.5% + 45vh - 10px)',
        left: '50%',
        transform: 'translateX(-50%)',
        fontFamily: 'HealTheWeb, Arial, sans-serif',
        fontSize: '48px',
        fontWeight: 400,
        color: '#22c55e',
        zIndex: 1001,
        pointerEvents: 'none',
        opacity: showAnonymousHint ? 1 : 0,
        transition: 'opacity 0.3s'
      }}>
        wanna stay anonymous?
      </div>

      {/* Modal */}
      <div style={{
        position: 'relative',
        background: '#fff',
        borderRadius: '22px',
        padding: '22px',
        maxWidth: '540px',
        width: '90%',
        maxHeight: '80vh',
        overflowY: 'auto',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
        fontFamily: 'HealTheWeb, Arial, sans-serif',
        fontSize: '14px'
      }}>
        {state === 'success' ? (
          /* Success State */
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <h4 style={{ fontSize: '20px', fontWeight: 700, color: '#222', marginBottom: '8px' }}>done!</h4>
            <p style={{ fontSize: '14px', color: '#666', marginBottom: '24px' }}>
              approved posters go live within 1-7 days. if you don&apos;t see yours after 2 weeks, either I&apos;m dead or it wasn&apos;t accepted—please submit something new instead.
            </p>
            <button
              onClick={handleSubmitAnother}
              style={{
                padding: '0 20px',
                background: ACCENT_COLOR,
                border: 'none',
                borderRadius: '8px',
                fontFamily: 'HealTheWeb, Arial, sans-serif',
                fontSize: '14px',
                fontWeight: 400,
                color: '#000',
                cursor: 'pointer',
                minWidth: '120px',
                height: '42px'
              }}
            >
              submit another
            </button>
          </div>
        ) : (
          /* Form State */
          <form
            onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}
            onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
            style={{ display: 'flex', flexDirection: 'column', gap: '17px' }}
          >
            {/* File Upload */}
            <div
              onClick={() => fileInputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onMouseEnter={() => setIsUploadHovered(true)}
              onMouseLeave={() => setIsUploadHovered(false)}
              style={{
                position: 'relative',
                border: `2px dashed ${isUploadHovered && !imagePreview ? ACCENT_COLOR : '#ddd'}`,
                borderRadius: '8px',
                height: '240px',
                background: imagePreview ? 'transparent' : (isUploadHovered ? ACCENT_COLOR_LIGHT : '#e5e5e5'),
                cursor: 'pointer',
                transition: 'border-color 0.2s, background 0.2s',
                overflow: 'hidden'
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileChange}
                style={{
                  display: 'none'
                }}
              />
              {imagePreview ? (
                <div style={{ position: 'relative', padding: '12px', zIndex: 15, height: '100%', boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imagePreview}
                    alt="Preview"
                    style={{ maxWidth: '100%', maxHeight: '216px', objectFit: 'contain', borderRadius: '6px' }}
                  />
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); clearFileSelection(); }}
                    style={{
                      position: 'absolute',
                      top: '20px',
                      right: '20px',
                      width: '28px',
                      height: '28px',
                      border: '1px solid rgba(0, 0, 0, 0.3)',
                      background: 'transparent',
                      borderRadius: '50%',
                      color: '#666',
                      fontSize: '18px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      zIndex: 20
                    }}
                  >
                    &times;
                  </button>
                </div>
              ) : (
                <div style={{
                  position: 'relative',
                  padding: '32px 20px',
                  textAlign: 'center',
                  color: '#888',
                  height: '100%',
                  boxSizing: 'border-box'
                }}>
                  {/* Placeholder SVG */}
                  <div style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: `translate(-50%, -50%) scale(${isUploadHovered ? 1.15 : 1})`,
                    opacity: isUploadHovered ? 0.7 : 0.5,
                    transition: 'transform 0.15s ease, opacity 0.2s'
                  }}>
                    <svg width="207" height="65" viewBox="0 0 376 117" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ color: isUploadHovered ? ACCENT_COLOR : '#919191', transition: 'color 0.2s' }}>
                      <rect x="174.235" y="6.68277" width="76.858" height="103.67" rx="6" stroke="currentColor" strokeWidth="2"/>
                      <rect x="1" y="-1" width="152.018" height="103.67" rx="6" transform="matrix(1 0 0 -1 5.95117 109.353)" stroke="currentColor" strokeWidth="2"/>
                      <rect x="266.359" y="6.68277" width="103.674" height="103.67" rx="6" stroke="currentColor" strokeWidth="2"/>
                      <path d="M73.4058 59.9155L79.9379 67.4468L94.7257 47.4947" stroke="currentColor" strokeWidth="2"/>
                      <path d="M203.11 59.9155L209.642 67.4468L224.43 47.4947" stroke="currentColor" strokeWidth="2"/>
                      <path d="M307.536 59.9155L314.068 67.4468L328.856 47.4947" stroke="currentColor" strokeWidth="2"/>
                    </svg>
                  </div>
                  {/* Scattered labels */}
                  <span className="upload-label-required" style={{ position: 'absolute', top: '20%', left: '50%', fontSize: '14px', color: isUploadHovered ? ACCENT_COLOR : '#777', whiteSpace: 'nowrap', transition: 'color 0.2s' }}>required*</span>
                  <span style={{ position: 'absolute', top: '18px', left: '24px', transform: 'rotate(-12deg)', fontSize: '14px', color: isUploadHovered ? ACCENT_COLOR : '#777', transition: 'color 0.2s' }}>any ratio</span>
                  <span style={{ position: 'absolute', top: '22px', right: '20px', transform: 'rotate(10deg)', fontSize: '14px', color: isUploadHovered ? ACCENT_COLOR : '#777', transition: 'color 0.2s' }}>png, jpg, webp</span>
                  <span className="upload-label-dragndrop" style={{ position: 'absolute', bottom: '28px', left: '28px', fontSize: '14px', color: isUploadHovered ? ACCENT_COLOR : '#777', transition: 'color 0.2s' }}>click or drag-n-drop</span>
                  <span style={{ position: 'absolute', bottom: '24px', right: '24px', transform: 'rotate(-11deg)', fontSize: '14px', color: isUploadHovered ? ACCENT_COLOR : '#777', transition: 'color 0.2s' }}>3mb max</span>
                </div>
              )}
            </div>

            {/* Error message */}
            {error && (
              <div style={{
                background: '#fee2e2',
                border: '1px solid #fca5a5',
                color: '#dc2626',
                padding: '10px 14px',
                borderRadius: '8px',
                fontSize: '14px'
              }}>
                {error}
              </div>
            )}

            {/* Optional section */}
            <div style={{ marginTop: '24px', display: 'flex', flexDirection: 'column', gap: '9px' }}>
              {/* Instagram */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                border: showAnonymousHint ? '1px solid #22c55e' : '1px solid #ddd',
                borderRadius: '8px',
                overflow: 'hidden',
                transition: 'border-color 0.2s, box-shadow 0.2s',
                boxShadow: showAnonymousHint ? '0 0 0 6px rgba(34, 197, 94, 0.25)' : 'none',
                height: '42px'
              }}>
                <span style={{
                  fontSize: '14px',
                  color: '#666',
                  padding: '0 12px 0 14px',
                  borderRight: '1px solid #ddd',
                  background: 'transparent',
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center'
                }}>@</span>
                <input
                  type="text"
                  value={instagram}
                  onChange={(e) => {
                    let val = e.target.value;
                    if (val.startsWith('@')) val = val.substring(1);
                    setInstagram(val);
                    setShowAnonymousHint(false);
                    setIsAnonymousConfirmed(false);
                  }}
                  placeholder="instagram_username"
                  maxLength={30}
                  style={{
                    flex: 1,
                    border: 'none',
                    padding: '0 16px 0 12px',
                    fontFamily: 'HealTheWeb, Arial, sans-serif',
                    fontSize: '14px',
                    outline: 'none',
                    height: '100%'
                  }}
                />
              </div>

              {/* Font Names - shown only when checkbox is checked, ABOVE the checkbox */}
              {usedFonts && (
                <div style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '8px',
                  alignItems: 'center',
                  animation: 'fadeIn 0.2s ease-out'
                }}>
                  {fontNames.map((font, index) => (
                    <div key={index} style={{ display: 'inline-flex', gap: '4px', alignItems: 'center' }}>
                      <input
                        ref={(el) => { fontInputRefs.current[index] = el; }}
                        type="text"
                        value={font}
                        onChange={(e) => {
                          updateFontName(index, e.target.value);
                          autoResizeFontInput(e.target);
                        }}
                        onFocus={() => setShowFontAddBtn(true)}
                        placeholder="font name"
                        maxLength={50}
                        style={{
                          width: '110px',
                          maxWidth: '200px',
                          padding: '0 12px',
                          border: '1px solid #ddd',
                          borderRadius: '8px',
                          fontFamily: 'HealTheWeb, Arial, sans-serif',
                          fontSize: '14px',
                          fontWeight: 400,
                          height: '42px',
                          boxSizing: 'border-box',
                          textAlign: 'center',
                          transition: 'border-color 0.2s, box-shadow 0.2s, width 0.15s ease'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = ACCENT_COLOR;
                          e.currentTarget.style.boxShadow = `0 0 0 3px ${ACCENT_COLOR_GLOW}`;
                        }}
                        onMouseLeave={(e) => {
                          if (document.activeElement !== e.currentTarget) {
                            e.currentTarget.style.borderColor = '#ddd';
                            e.currentTarget.style.boxShadow = 'none';
                          }
                        }}
                      />
                      {index === fontNames.length - 1 && showFontAddBtn && fontNames.length < 10 && (
                        <button
                          type="button"
                          onClick={addFontName}
                          style={{
                            width: '42px',
                            height: '42px',
                            borderRadius: '50%',
                            border: '1px solid #ddd',
                            background: 'transparent',
                            fontSize: '20px',
                            fontWeight: 400,
                            color: '#b5b5b5',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'border-color 0.2s, color 0.2s'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor = ACCENT_COLOR;
                            e.currentTarget.style.color = ACCENT_COLOR;
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = '#ddd';
                            e.currentTarget.style.color = '#b5b5b5';
                          }}
                        >
                          +
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Checkbox and Submit Row */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '9px' }}>
                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  cursor: 'default',
                  fontSize: '14px',
                  color: '#555',
                  border: '1px solid #ddd',
                  borderRadius: '8px',
                  padding: '0 12px',
                  height: '42px',
                  boxSizing: 'border-box',
                  whiteSpace: 'nowrap'
                }}>
                  <input
                    type="checkbox"
                    checked={usedFonts}
                    onChange={(e) => setUsedFonts(e.target.checked)}
                    style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: ACCENT_COLOR, flexShrink: 0 }}
                  />
                  <span>
                    i also used{' '}
                    <a
                      href="https://random-dafont.vercel.app/"
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      style={{ color: '#555', textDecoration: 'underline' }}
                    >
                      random-dafont.com
                    </a>{' '}
                    for this
                  </span>
                  <span
                    style={{
                      position: 'relative',
                      width: '18px',
                      height: '18px',
                      borderRadius: '50%',
                      border: '1px solid #ddd',
                      fontSize: '11px',
                      color: '#bbb',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'help',
                      flexShrink: 0
                    }}
                    onMouseEnter={() => setShowTooltip(true)}
                    onMouseLeave={() => setShowTooltip(false)}
                  >
                    ?
                    {showTooltip && (
                      <span style={{
                        position: 'absolute',
                        bottom: '100%',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        marginBottom: '6px',
                        padding: '6px 10px',
                        background: '#333',
                        color: '#fff',
                        fontSize: '12px',
                        borderRadius: '6px',
                        whiteSpace: 'nowrap',
                        zIndex: 100,
                        pointerEvents: 'none'
                      }}>
                        for cross-posting on both websites
                      </span>
                    )}
                  </span>
                </label>
                <button
                  type="submit"
                  disabled={!imageData || state === 'uploading'}
                  style={{
                    padding: '0 20px',
                    background: isAnonymousConfirmed ? '#22c55e' : (!imageData ? '#999' : ACCENT_COLOR),
                    border: 'none',
                    borderRadius: '8px',
                    fontFamily: 'HealTheWeb, Arial, sans-serif',
                    fontSize: '14px',
                    fontWeight: 400,
                    color: !imageData ? '#fff' : '#000',
                    cursor: !imageData || state === 'uploading' ? 'not-allowed' : 'pointer',
                    minWidth: '120px',
                    height: '42px',
                    boxShadow: showAnonymousHint ? '0 0 0 6px rgba(34, 197, 94, 0.25)' : 'none',
                    transition: 'box-shadow 0.2s',
                    flex: 1
                  }}
                >
                  {state === 'uploading' ? 'uploading...' : (isAnonymousConfirmed ? 'yes' : 'submit')}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>

      <style jsx global>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes floatRequired {
          0%, 100% { transform: translate(-50%, -50%) rotate(-6deg) translateY(0); }
          50% { transform: translate(-50%, -50%) rotate(-6deg) translateY(-5px); }
        }
        @keyframes floatDragndrop {
          0%, 100% { transform: rotate(8deg) translateY(0); }
          50% { transform: rotate(8deg) translateY(-5px); }
        }
        .upload-label-required {
          animation: floatRequired 2.5s ease-in-out infinite;
        }
        .upload-label-dragndrop {
          animation: floatDragndrop 2.5s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}

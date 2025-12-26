'use client';

import { useState, useRef, ChangeEvent } from 'react';

interface SubmitModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type SubmitState = 'form' | 'uploading' | 'success' | 'error';

export default function SubmitModal({ isOpen, onClose }: SubmitModalProps) {
  const [state, setState] = useState<SubmitState>('form');
  const [error, setError] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageData, setImageData] = useState<{ base64: string; name: string; type: string } | null>(null);
  const [instagram, setInstagram] = useState('');
  const [svgSources, setSvgSources] = useState<string[]>(['']);
  const [usedFonts, setUsedFonts] = useState(false);
  const [showAnonymousHint, setShowAnonymousHint] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    setState('form');
    setError(null);
    setImagePreview(null);
    setImageData(null);
    setInstagram('');
    setSvgSources(['']);
    setUsedFonts(false);
    setShowAnonymousHint(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      setError('Please upload a JPG, PNG, or WebP image');
      return;
    }

    // Validate file size (3MB max)
    if (file.size > 3 * 1024 * 1024) {
      setError('Image must be less than 3MB');
      return;
    }

    setError(null);

    // Create preview and base64
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

  const addSvgSource = () => {
    if (svgSources.length < 10) {
      setSvgSources([...svgSources, '']);
    }
  };

  const removeSvgSource = (index: number) => {
    if (svgSources.length > 1) {
      setSvgSources(svgSources.filter((_, i) => i !== index));
    }
  };

  const updateSvgSource = (index: number, value: string) => {
    const updated = [...svgSources];
    updated[index] = value;
    setSvgSources(updated);
  };

  const handleSubmit = async () => {
    if (!imageData) {
      setError('Please select an image');
      return;
    }

    // Check if instagram is empty and show hint
    if (!instagram.trim() && !showAnonymousHint) {
      setShowAnonymousHint(true);
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
          svgSources: svgSources.filter(s => s.trim()),
          usedFonts,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={handleClose}
      ></div>

      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto m-4">
        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-2xl"
        >
          &times;
        </button>

        <div className="p-8">
          {state === 'success' ? (
            /* Success State */
            <div className="text-center py-8">
              <div className="text-6xl mb-4">🎉</div>
              <h3 className="text-2xl font-bold text-gray-800 mb-2">Thank you!</h3>
              <p className="text-gray-600 mb-6">
                Your poster has been submitted and is awaiting moderation.
              </p>
              <div className="flex gap-4 justify-center">
                <button
                  onClick={handleSubmitAnother}
                  className="px-6 py-3 rounded-lg text-white font-semibold transition-transform hover:scale-[1.02]"
                  style={{ backgroundColor: '#C6D000' }}
                >
                  Submit Another
                </button>
                <button
                  onClick={handleClose}
                  className="px-6 py-3 rounded-lg border border-gray-300 text-gray-700 font-semibold hover:border-gray-400 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          ) : (
            /* Form State */
            <>
              <h3 className="text-2xl font-bold text-gray-800 mb-6">Submit Your Poster</h3>

              {/* Image Upload */}
              <div
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors mb-6 ${
                  imagePreview ? 'border-[#C6D000]' : 'border-gray-300 hover:border-gray-400'
                }`}
                onClick={() => fileInputRef.current?.click()}
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleFileChange}
                  className="hidden"
                />
                {imagePreview ? (
                  <div className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={imagePreview}
                      alt="Preview"
                      className="max-h-48 mx-auto rounded-lg"
                    />
                    <p className="text-sm text-gray-500 mt-2">Click to change</p>
                  </div>
                ) : (
                  <>
                    <div className="text-4xl mb-2">📷</div>
                    <p className="text-gray-600 font-medium">Drop your poster here</p>
                    <p className="text-gray-400 text-sm mt-1">or click to browse</p>
                    <p className="text-gray-400 text-xs mt-2">JPG, PNG, WebP • Max 3MB</p>
                  </>
                )}
              </div>

              {/* Error message */}
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg mb-6">
                  {error}
                </div>
              )}

              {/* Optional section */}
              <div className="space-y-4">
                <p className="text-sm text-gray-500 font-medium">Optional</p>

                {/* Instagram */}
                <div className={`relative ${showAnonymousHint ? 'ring-2 ring-[#C6D000] rounded-lg' : ''}`}>
                  <input
                    type="text"
                    value={instagram}
                    onChange={(e) => {
                      setInstagram(e.target.value);
                      setShowAnonymousHint(false);
                    }}
                    placeholder="@instagram"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:border-gray-400"
                  />
                  {showAnonymousHint && (
                    <p className="text-sm text-[#C6D000] mt-1">
                      Want to stay anonymous? Click submit again to confirm.
                    </p>
                  )}
                </div>

                {/* SVG Sources */}
                <div className="space-y-2">
                  <label className="text-sm text-gray-600">SVG sources used</label>
                  {svgSources.map((source, index) => (
                    <div key={index} className="flex gap-2">
                      <input
                        type="text"
                        value={source}
                        onChange={(e) => updateSvgSource(index, e.target.value)}
                        placeholder="e.g. freesvg.org, wikimedia.org"
                        className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-gray-400 text-sm"
                      />
                      {svgSources.length > 1 && (
                        <button
                          onClick={() => removeSvgSource(index)}
                          className="px-3 py-2 text-gray-400 hover:text-gray-600"
                        >
                          &times;
                        </button>
                      )}
                    </div>
                  ))}
                  {svgSources.length < 10 && (
                    <button
                      onClick={addSvgSource}
                      className="text-sm text-gray-500 hover:text-gray-700"
                    >
                      + Add another source
                    </button>
                  )}
                </div>

                {/* Used Fonts Checkbox */}
                <label className="flex items-start gap-3 p-4 border border-gray-300 rounded-lg cursor-pointer hover:border-gray-400 transition-colors">
                  <input
                    type="checkbox"
                    checked={usedFonts}
                    onChange={(e) => setUsedFonts(e.target.checked)}
                    className="w-5 h-5 mt-0.5 cursor-pointer"
                  />
                  <span className="text-gray-700">
                    I also used{' '}
                    <a
                      href="https://random-dafont.vercel.app/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#c00] hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      random-dafont.com
                    </a>{' '}
                    for this
                    <span className="block text-xs text-gray-500 mt-1">
                      for cross-posting on both websites
                    </span>
                  </span>
                </label>
              </div>

              {/* Submit Button */}
              <button
                onClick={handleSubmit}
                disabled={!imageData || state === 'uploading'}
                className="w-full mt-6 py-4 rounded-lg text-white font-semibold transition-all hover:scale-[1.01] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                style={{ backgroundColor: '#C6D000' }}
              >
                {state === 'uploading' ? 'Uploading...' : 'Submit for Review'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

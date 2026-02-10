
import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { generateThumbnail } from './services/geminiService';
import { fileToBase64 } from './utils/fileUtils';
import { DownloadIcon, SparklesIcon, LoadingSpinnerIcon, CameraIcon, InfoIcon, InstagramIcon, WhatsAppIcon, MailIcon } from './components/icons';

type ImageData = {
  base64: string;
  mimeType: string;
  previewUrl: string;
};

type GenerationStep = 'idle' | 'preview' | 'final';

const App: React.FC = () => {
  // State for original thumbnail generator
  const [promptText, setPromptText] = useState<string>('');
  const [headshot, setHeadshot] = useState<ImageData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [generationStep, setGenerationStep] = useState<GenerationStep>('idle');
  const [previewThumbnail, setPreviewThumbnail] = useState<string | null>(null);
  const [finalThumbnail, setFinalThumbnail] = useState<string | null>(null);
  const [generationStatus, setGenerationStatus] = useState<string>('');
  const [thumbnailCache, setThumbnailCache] = useState<Map<string, { preview: string | null; final: string | null }>>(new Map());
  const [downloaded, setDownloaded] = useState<boolean>(false);
  const [isFaceMatchEnabled, setIsFaceMatchEnabled] = useState<boolean>(false);

  // State for direct thumbnail downloader
  const [downloadLink, setDownloadLink] = useState<string>('');
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  
  useEffect(() => {
    if (!headshot) {
        setIsFaceMatchEnabled(false);
    }
  }, [headshot]);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      try {
        setError(null);
        setGenerationStep('idle');
        setPreviewThumbnail(null);
        setFinalThumbnail(null);
        const { base64, mimeType } = await fileToBase64(file); // 10MB default
        setHeadshot({
          base64,
          mimeType,
          previewUrl: URL.createObjectURL(file),
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to process image.');
        console.error(err);
      }
    }
  };
  
  const getCacheKey = useCallback(() => {
    if (!promptText) return null;
    const headshotKey = headshot ? `-${headshot.base64.substring(0, 100)}` : '';
    const faceMatchKey = isFaceMatchEnabled && headshot ? '-facelock' : '';
    return `${promptText}${headshotKey}${faceMatchKey}`;
  }, [promptText, headshot, isFaceMatchEnabled]);

  const handleGeneratePreview = useCallback(async () => {
    if (!promptText) {
      setError('Please enter a prompt to generate thumbnail.');
      return;
    }
    setError(null);

    const cacheKey = getCacheKey();
    if (cacheKey && thumbnailCache.has(cacheKey)) {
        const cached = thumbnailCache.get(cacheKey);
        if (cached?.preview) {
            setPreviewThumbnail(cached.preview);
            setGenerationStep('preview');
            return;
        }
    }

    setIsLoading(true);
    setGenerationStep('idle');
    setPreviewThumbnail(null);
    setFinalThumbnail(null);

    setGenerationStatus('Generating fast preview...');

    try {
      const thumbnailBase64 = await generateThumbnail(promptText, headshot?.base64 ?? null, headshot?.mimeType ?? null, 'preview', isFaceMatchEnabled && !!headshot);
      if (!thumbnailBase64) throw new Error('AI did not return a preview.');

      const imageUrl = `data:image/jpeg;base64,${thumbnailBase64}`;
      setPreviewThumbnail(imageUrl);
      setGenerationStep('preview');
      if (cacheKey) {
        setThumbnailCache(prev => new Map(prev).set(cacheKey, { ...(prev.get(cacheKey) || { preview: null, final: null }), preview: imageUrl }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate preview.');
    } finally {
      setIsLoading(false);
      setGenerationStatus('');
    }
  }, [promptText, headshot, thumbnailCache, getCacheKey, isFaceMatchEnabled]);

  const handleGenerateFinal = useCallback(async () => {
    if (!promptText) {
        setError('Prompt is missing for final generation.');
        return;
    }
    const cacheKey = getCacheKey();
    if (!cacheKey) {
      setError('Missing data for final generation.');
      return;
    }

    const cached = thumbnailCache.get(cacheKey);
    if (cached?.final) {
      setFinalThumbnail(cached.final);
      setGenerationStep('final');
      return;
    }

    setIsLoading(true);
    setError(null);
    setGenerationStatus('Enhancing to Full HD...');

    const maxRetries = 2;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const thumbnailBase64 = await generateThumbnail(promptText, headshot?.base64 ?? null, headshot?.mimeType ?? null, 'final', isFaceMatchEnabled && !!headshot);
        if (!thumbnailBase64) throw new Error('AI did not return a final image.');

        const imageUrl = `data:image/jpeg;base64,${thumbnailBase64}`;
        setFinalThumbnail(imageUrl);
        setGenerationStep('final');
        setThumbnailCache(prev => new Map(prev).set(cacheKey, { ...(prev.get(cacheKey) || { preview: null, final: null }), final: imageUrl }));
        setError(null);
        break;
      } catch (err) {
        console.error(`Attempt ${attempt + 1} failed:`, err);
        if (err instanceof Error && err.message.includes('Face Match Failed')) {
            setError(err.message);
            break;
        }
        if (attempt === maxRetries) {
          setError("Generation is temporarily unavailable. Please try again later.");
          break;
        }
        setGenerationStatus("Server is busy. Retrying automatically...");
        const delay = Math.pow(2, attempt) * 2000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    setIsLoading(false);
    setGenerationStatus('');
  }, [promptText, headshot, thumbnailCache, getCacheKey, isFaceMatchEnabled]);

  const handleDownload = useCallback(async () => {
    const sourceImage = finalThumbnail || previewThumbnail;
    if (!sourceImage) {
      setError("Please generate a thumbnail first before downloading.");
      return;
    }

    const sanitizeFileName = (title: string) => {
      const saneTitle = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      return `thumbnail-${saneTitle || 'untitled'}.jpg`;
    };

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = sourceImage;
    img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 1280;
        canvas.height = 720;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            setError("Failed to create image for download.");
            return;
        }

        ctx.drawImage(img, 0, 0, 1280, 720);

        const link = document.createElement('a');
        link.href = canvas.toDataURL('image/jpeg', 0.9);
        link.download = sanitizeFileName(promptText);
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        setDownloaded(true);
        setTimeout(() => setDownloaded(false), 2000);
    };
    img.onerror = () => {
        setError("Could not load image for downloading.");
    }
  }, [previewThumbnail, finalThumbnail, promptText]);

  const extractYouTubeID = (url: string): string | null => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

  const handleDownloadFromLink = async () => {
    setIsDownloading(true);
    setDownloadError(null);
    
    const videoId = extractYouTubeID(downloadLink);
    if (!videoId) {
      setDownloadError("Unable to fetch thumbnail. Please enter a valid video link.");
      setIsDownloading(false);
      return;
    }

    const urls = [
      `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
      `https://img.youtube.com/vi/${videoId}/sddefault.jpg`,
      `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
    ];

    let validUrl = null;
    for (const url of urls) {
      try {
        const response = await fetch(url, { method: 'HEAD' });
        if (response.ok && response.headers.get('content-length') !== '0') {
           validUrl = url;
           break;
        }
      } catch (e) {
        // This URL failed, try the next one
      }
    }

    if (!validUrl) {
      setDownloadError("Unable to fetch thumbnail. Please check the video link.");
      setIsDownloading(false);
      return;
    }

    try {
        const response = await fetch(validUrl);
        if (!response.ok) throw new Error('Network response was not ok');
        const blob = await response.blob();

        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `thumbnail-${videoId}.jpg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
    } catch (downloadErr) {
      console.error(downloadErr);
      setDownloadError("Failed to download the image file.");
    } finally {
      setIsDownloading(false);
    }
  };

  const isGenerateButtonDisabled = useMemo(() => isLoading, [isLoading]);

  return (
    <div className="min-h-screen p-4 sm:p-6 lg:p-8 flex flex-col">
      <div className="max-w-4xl mx-auto w-full flex-grow">
        <header className="text-center mb-10 md:mb-12">
            <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-slate-100">AI Thumbnail Maker</h1>
            <p className="mt-4 text-lg text-slate-300 max-w-2xl mx-auto">Generate professional YouTube video thumbnails in seconds.</p>
        </header>

        <main className="space-y-8">
          <div className="bg-[#1F2937]/85 backdrop-blur-xl rounded-2xl p-6 sm:p-8 shadow-2xl ring-1 ring-white/10">
                <h2 className="text-2xl font-bold text-slate-100 mb-1">Download Thumbnail from Link</h2>
                <p className="text-slate-300 mb-6">Instantly download the highest quality thumbnail from a video link.</p>
                <div className="flex flex-col sm:flex-row items-center gap-4">
                    <input type="text" value={downloadLink} onChange={(e) => { setDownloadLink(e.target.value); setDownloadError(null); }} placeholder="Enter YouTube / Video link" className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-400 focus:ring-2 focus:ring-green-500/50 focus:border-green-500 transition-all duration-300" />
                    <button onClick={handleDownloadFromLink} disabled={isDownloading || !downloadLink} className="w-full sm:w-auto flex-shrink-0 flex items-center justify-center gap-2 bg-gradient-to-r from-green-500 to-emerald-400 text-white font-bold py-3 px-6 rounded-lg shadow-lg transition-all duration-300 ease-in-out hover:shadow-md hover:shadow-emerald-400/30 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed">
                        {isDownloading ? <LoadingSpinnerIcon className="w-5 h-5" /> : <DownloadIcon className="w-5 h-5" />}
                        Download Thumbnail
                    </button>
                </div>
                {downloadError && !isDownloading && (<div className="mt-4 text-center text-red-400 p-3 bg-red-900/20 rounded-lg text-sm"><p>{downloadError}</p></div>)}
            </div>
            
          <div className="bg-[#1F2937]/85 backdrop-blur-xl rounded-2xl p-6 sm:p-8 shadow-2xl ring-1 ring-white/10 flex flex-col gap-8">
            <div>
                <label htmlFor="prompt-text" className="block text-lg font-semibold text-slate-200 mb-2 tracking-wide">1. Enter Prompt</label>
                <input type="text" id="prompt-text" value={promptText} onChange={(e) => setPromptText(e.target.value)} placeholder="Enter prompt for thumbnail generation" className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-400 focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 transition-all duration-300" />
            </div>

            <div>
                <label className="block text-lg font-semibold text-slate-200 mb-2 tracking-wide">2. Upload Headshot (Optional)</label>
                <div className="mt-1 flex justify-center p-6 border-2 border-slate-600 border-dashed rounded-xl bg-black/20">
                    <div className="space-y-2 text-center">
                        {headshot ? (
                            <img src={headshot.previewUrl} alt="Headshot Preview" className="mx-auto h-24 w-24 object-cover rounded-full mb-3 ring-2 ring-purple-500/50" />
                        ) : (
                            <CameraIcon className="mx-auto h-12 w-12 text-slate-600" />
                        )}
                        <div className="flex text-sm text-slate-300">
                            <label htmlFor="file-upload" className="relative cursor-pointer rounded-md font-semibold text-cyan-400 hover:text-cyan-300 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-offset-slate-900 focus-within:ring-cyan-400 transition-colors">
                                <span>Upload a file</span>
                                <input id="file-upload" name="file-upload" type="file" className="sr-only" accept="image/png, image/jpeg, image/webp" onChange={handleFileChange} />
                            </label>
                            <p className="pl-1">or drag and drop</p>
                        </div>
                        <p className="text-xs text-slate-400">PNG, JPG, WEBP up to 10MB</p>
                    </div>
                </div>
            </div>
            
            <div className={`bg-slate-900/50 p-4 rounded-lg transition-opacity ${!headshot ? 'opacity-50' : ''}`}>
              <label htmlFor="face-match-toggle" className={`flex items-center justify-between ${headshot ? 'cursor-pointer' : 'cursor-not-allowed'}`}>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-slate-100">Enable Face Match / Face Lock</span>
                  <div className="relative group">
                    <InfoIcon className="w-5 h-5 text-slate-400" />
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-2 text-xs text-center text-slate-200 bg-slate-800 rounded-md shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                      Guarantees the AI uses your exact face, only enhancing expression and lighting. For best results, use a clear, frontal headshot.
                    </div>
                  </div>
                </div>
                <div className="relative">
                  <input type="checkbox" id="face-match-toggle" className="sr-only" checked={isFaceMatchEnabled} onChange={() => headshot && setIsFaceMatchEnabled(!isFaceMatchEnabled)} disabled={!headshot} />
                  <div className={`block w-12 h-6 rounded-full transition-colors ${isFaceMatchEnabled ? 'bg-gradient-to-r from-purple-500 to-cyan-400' : 'bg-slate-600'}`}></div>
                  <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${isFaceMatchEnabled ? 'translate-x-6' : ''}`}></div>
                </div>
              </label>
            </div>
            
            <button onClick={handleGeneratePreview} disabled={isGenerateButtonDisabled} className="w-full flex items-center justify-center gap-3 bg-gradient-to-r from-blue-500 via-purple-500 to-cyan-400 text-white font-bold py-4 px-4 rounded-lg shadow-lg transition-all duration-300 ease-in-out hover:shadow-xl hover:shadow-cyan-400/30 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100 disabled:hover:shadow-none">
                {isLoading && generationStep === 'idle' ? (<><LoadingSpinnerIcon className="w-6 h-6" /><span>{generationStatus}</span></>) : (<><SparklesIcon className="w-6 h-6" /><span>Generate Preview</span></>)}
            </button>
          </div>

          <div className="bg-[#1F2937]/85 backdrop-blur-xl rounded-2xl p-6 sm:p-8 shadow-2xl ring-1 ring-white/10 flex flex-col justify-center items-center">
            <h2 className="text-2xl font-bold mb-4 text-slate-100 tracking-wide self-start">Generated Thumbnail</h2>
            <div className="aspect-[16/9] w-full bg-slate-900/50 rounded-lg flex items-center justify-center ring-2 ring-white/10 shadow-inner p-1">
                <div className="w-full h-full bg-slate-900 rounded-md flex items-center justify-center p-2 ring-1 ring-slate-700">
                    {isLoading && (<div className="flex flex-col items-center text-slate-300 gap-2 text-center"><LoadingSpinnerIcon className="w-10 h-10 text-cyan-400" /><p className="font-medium tracking-wide">{generationStatus}</p></div>)}
                    {error && !isLoading && (<div className="text-center text-red-400 p-4"><p className="font-bold">Generation Failed</p><p className="text-sm mt-1">{error}</p></div>)}
                    {!isLoading && !error && (
                        <>
                        {generationStep === 'idle' && <div className="text-center text-slate-400"><p className="font-medium">Your thumbnail preview will appear here.</p></div>}
                        {(generationStep === 'preview' && previewThumbnail) && <img src={previewThumbnail} alt="Thumbnail Preview" className="w-full h-full object-contain rounded-sm" />}
                        {(generationStep === 'final' && finalThumbnail) && <img src={finalThumbnail} alt="Final Thumbnail" className="w-full h-full object-contain rounded-sm" />}
                        </>
                    )}
                </div>
            </div>
            <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-4 w-full">
              {generationStep === 'preview' && !isLoading && (
                <>
                  <button onClick={handleGenerateFinal} className="w-full sm:w-auto inline-flex items-center justify-center gap-3 bg-gradient-to-r from-purple-500 to-blue-400 text-white font-semibold py-2 px-6 rounded-lg shadow-md hover:scale-105 hover:shadow-lg hover:shadow-blue-500/30 transition-all duration-300">
                    <SparklesIcon className="w-5 h-5" /> Enhance to Full HD
                  </button>
                  <button onClick={handleGeneratePreview} className="w-full sm:w-auto text-sm font-semibold text-slate-300 hover:text-white transition-colors">
                    Regenerate Preview
                  </button>
                </>
              )}
              {(previewThumbnail || finalThumbnail) && !isLoading && (
                  <button onClick={handleDownload} disabled={downloaded} className="w-full sm:w-auto inline-flex items-center justify-center gap-3 bg-gradient-to-r from-cyan-400 to-blue-400 text-white font-semibold py-2 px-6 rounded-lg shadow-md hover:scale-105 hover:shadow-lg hover:shadow-blue-500/30 transition-all duration-300 disabled:opacity-75 disabled:cursor-not-allowed">
                    <DownloadIcon className="w-5 h-5" />
                    {downloaded ? 'Downloaded!' : 'Download Thumbnail'}
                  </button>
              )}
            </div>
          </div>
        </main>
        
        <div className="my-12 h-56 rounded-2xl border border-sky-500/30 bg-slate-900/20"></div>

      </div>
      <footer className="w-full mt-16 py-8 border-t border-slate-700/50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row justify-between items-center gap-6">
              <p className="text-sm text-slate-300 font-medium">Made by Hebi</p>
              <div className="flex items-center gap-x-6">
                  <a href="https://www.instagram.com/m4uka2027?igsh=MW1nejNmbG13amtpdg==" target="_blank" rel="noopener noreferrer" className="group relative text-slate-400 hover:text-[#E1306C] transition-all duration-300 transform hover:scale-110">
                      <InstagramIcon className="w-6 h-6" />
                      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max px-2 py-1 text-xs text-center text-white bg-slate-800 rounded-md shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                          Follow on Instagram
                      </span>
                  </a>
                  <a href="https://wa.me/9387217576" target="_blank" rel="noopener noreferrer" className="group relative text-slate-400 hover:text-[#25D366] transition-all duration-300 transform hover:scale-110">
                      <WhatsAppIcon className="w-6 h-6" />
                       <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max px-2 py-1 text-xs text-center text-white bg-slate-800 rounded-md shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                          Chat on WhatsApp
                      </span>
                  </a>
                  <a href="mailto:babyh7595@gmail.com" className="group relative text-slate-400 hover:text-[#3B82F6] transition-all duration-300 transform hover:scale-110">
                      <MailIcon className="w-6 h-6" />
                       <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max px-2 py-1 text-xs text-center text-white bg-slate-800 rounded-md shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                          Send Email
                      </span>
                  </a>
              </div>
          </div>
      </footer>
    </div>
  );
};

export default App;

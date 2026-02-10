
const OPENROUTER_API_KEY = process.env.API_KEY;

if (!OPENROUTER_API_KEY) {
  throw new Error("API_KEY environment variable is not set. Please ensure your OpenRouter API key is configured in the API_KEY environment variable.");
}

const createPreviewPrompt = (promptText: string): string => {
  return `
    A vibrant, high-CTR YouTube thumbnail for a video titled "${promptText}".
    Style: Eye-catching, high contrast, bold readable text, prominent subject, engaging visuals.
    The goal is a clear concept preview.
  `;
};

const createFinalPrompt = (promptText: string): string => {
  return `
    A professional, viral, high-CTR (click-through-rate) YouTube thumbnail for a video titled "${promptText}".
    Style: Photorealistic, cinematic depth of field, vibrant high-contrast colors, glowing highlights to make elements pop.
    The final image must be scroll-stopping, professional, and fully optimized for maximum engagement on YouTube.
  `;
};

export const generateThumbnail = async (
  promptText: string,
  headshotBase64: string | null, // Note: This is no longer used by the OpenRouter image generation API
  mimeType: string | null,       // Note: This is no longer used
  quality: 'preview' | 'final'
): Promise<string | null> => {
  try {
    const prompt = quality === 'final' 
      ? createFinalPrompt(promptText) 
      : createPreviewPrompt(promptText);

    const width = quality === 'final' ? 1280 : 896;
    const height = quality === 'final' ? 720 : 512;

    const response = await fetch("https://openrouter.ai/api/v1/images/generations", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://ai-thumbnails-maker.com", // Recommended by OpenRouter
        "X-Title": "AI Thumbnail Maker"                 // Recommended by OpenRouter
      },
      body: JSON.stringify({
        model: "playgroundai/playground-v2.5",
        prompt: prompt,
        n: 1,
        width: width,
        height: height,
        response_format: "b64_json",
      })
    });

    if (!response.ok) {
        const errorBody = await response.text();
        console.error("OpenRouter API error response:", errorBody);
        throw new Error(`API request failed with status ${response.status}`);
    }

    const data = await response.json();
    
    if (data.data && data.data.length > 0 && data.data[0].b64_json) {
      return data.data[0].b64_json;
    }

    return null;
  } catch (error) {
    console.error("Error generating thumbnail with OpenRouter:", error);
    throw new Error("An error occurred during thumbnail generation.");
  }
};
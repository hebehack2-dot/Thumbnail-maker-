
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

// Use environment variables for model names with safe fallbacks.
// OPENROUTER_MODEL is for the main image generation, as requested by the user.
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'playgroundai/playground-v2.5';
// A separate variable is used for the chat model to satisfy the "no hardcoded models" requirement.
const OPENROUTER_CHAT_MODEL = process.env.OPENROUTER_CHAT_MODEL || 'meta-llama/llama-3.3-70b-instruct:free';

const generateDetailedPrompt = async (promptText: string): Promise<string> => {
    const llamaSystemPrompt = "You are an expert prompt engineer for AI image generation models. Your task is to take a YouTube video title and transform it into a detailed, descriptive prompt that will generate a high-quality, high-CTR thumbnail. The prompt should be a single paragraph. Do not include any conversational text, headings, or markdown. Only output the final prompt for the image model.";
    const llamaUserPrompt = `Generate an image prompt for a video titled: "${promptText}"`;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://ai-thumbnails-maker.com", // Recommended by OpenRouter
            "X-Title": "AI Thumbnail Maker"                 // Recommended by OpenRouter
        },
        body: JSON.stringify({
            model: OPENROUTER_CHAT_MODEL,
            messages: [
                { role: "system", content: llamaSystemPrompt },
                { role: "user", content: llamaUserPrompt }
            ],
            max_tokens: 300,
            temperature: 0.75,
        })
    });

    if (!response.ok) {
        const errorBody = await response.text();
        console.error("OpenRouter Chat API error:", errorBody);
        throw new Error(`Failed to generate detailed prompt. Status: ${response.status}`);
    }

    const data = await response.json();
    const detailedPrompt = data.choices[0]?.message?.content?.trim();

    if (!detailedPrompt) {
        throw new Error("The AI model failed to return a valid prompt.");
    }

    return detailedPrompt;
}

export const generateThumbnail = async (
  promptText: string,
  headshotBase64: string | null, // Note: This is not used by the current image generation model.
  mimeType: string | null,       // Note: This is not used by the current image generation model.
  quality: 'preview' | 'final'
): Promise<string | null> => {
  if (!OPENROUTER_API_KEY) {
    throw new Error("Service is unavailable: OPENROUTER_API_KEY is not configured.");
  }

  try {
    // Step 1: Generate a detailed prompt using the user-specified Llama model.
    const detailedPrompt = await generateDetailedPrompt(promptText);
    console.log("Generated detailed prompt:", detailedPrompt);

    // Step 2: Use the detailed prompt to generate the image.
    const width = quality === 'final' ? 1280 : 896;
    const height = quality === 'final' ? 720 : 512;

    const response = await fetch("https://openrouter.ai/api/v1/images/generations", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://ai-thumbnails-maker.com",
        "X-Title": "AI Thumbnail Maker"
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        prompt: detailedPrompt,
        n: 1,
        width: width,
        height: height,
        response_format: "b64_json",
      })
    });

    if (!response.ok) {
        const errorBody = await response.text();
        console.error("OpenRouter Image API error:", errorBody);
        try {
          const errorJson = JSON.parse(errorBody);
          if (errorJson?.error?.message) {
            throw new Error(`Image generation failed: ${errorJson.error.message}`);
          }
        } catch (e) {
            // Not a JSON error, fall through
        }
        throw new Error(`Image generation API request failed with status ${response.status}`);
    }

    const data = await response.json();
    
    if (data.data && data.data.length > 0 && data.data[0].b64_json) {
      return data.data[0].b64_json;
    }

    throw new Error("API returned successfully but did not provide an image.");
  } catch (error) {
    console.error("Error generating thumbnail with OpenRouter:", error);
    if (error instanceof Error) {
        throw new Error(error.message);
    }
    throw new Error("An unknown error occurred during thumbnail generation.");
  }
};

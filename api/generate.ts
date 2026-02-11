
// This is a Vercel Serverless Function that acts as a secure proxy to the OpenRouter API.
export const config = {
  runtime: 'edge',
};

export default async function handler(req: Request) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

  if (!OPENROUTER_API_KEY) {
    return new Response(
      JSON.stringify({ error: 'Service is not configured. Please contact the administrator.' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  try {
    const { promptText, quality } = await req.json();

    if (!promptText) {
        return new Response(JSON.stringify({ error: 'Prompt text is required.' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    // Define models with fallbacks as per requirements
    const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'playgroundai/playground-v2.5';
    const OPENROUTER_CHAT_MODEL = process.env.OPENROUTER_CHAT_MODEL || 'meta-llama/llama-3.3-70b-instruct:free';
    
    // Step 1: Generate a detailed prompt
    const llamaSystemPrompt = "You are an expert prompt engineer for AI image generation models. Your task is to take a YouTube video title and transform it into a detailed, descriptive prompt that will generate a high-quality, high-CTR thumbnail. The prompt should be a single paragraph. Do not include any conversational text, headings, or markdown. Only output the final prompt for the image model.";
    const llamaUserPrompt = `Generate an image prompt for a video titled: "${promptText}"`;

    const chatResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
            "HTTP-Referer": req.headers.get('origin') || "https://ai-thumbnails-maker.com",
            "X-Title": "AI Thumbnail Maker"
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

    if (!chatResponse.ok) {
        const errorBody = await chatResponse.text();
        console.error("OpenRouter Chat API error:", errorBody);
        return new Response(JSON.stringify({ error: `Failed to generate detailed prompt. Status: ${chatResponse.status}` }), {
            status: chatResponse.status,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    const chatData = await chatResponse.json();
    const detailedPrompt = chatData.choices[0]?.message?.content?.trim();

    if (!detailedPrompt) {
        return new Response(JSON.stringify({ error: "The AI model failed to return a valid prompt." }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    // Step 2: Generate the image
    const width = quality === 'final' ? 1280 : 896;
    const height = quality === 'final' ? 720 : 512;

    const imageResponse = await fetch("https://openrouter.ai/api/v1/images/generations", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": req.headers.get('origin') || "https://ai-thumbnails-maker.com",
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

    if (!imageResponse.ok) {
        const errorBody = await imageResponse.text();
        console.error("OpenRouter Image API error:", errorBody);
        try {
          const errorJson = JSON.parse(errorBody);
          if (errorJson?.error?.message) {
            return new Response(JSON.stringify({ error: `Image generation failed: ${errorJson.error.message}` }), {
                status: imageResponse.status,
                headers: { 'Content-Type': 'application/json' },
            });
          }
        } catch (e) { /* Not a JSON error, fall through */ }
        
        return new Response(JSON.stringify({ error: `Image generation API request failed with status ${imageResponse.status}` }), {
            status: imageResponse.status,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    const imageData = await imageResponse.json();
    const thumbnailBase64 = imageData.data?.[0]?.b64_json;
    
    if (thumbnailBase64) {
      return new Response(JSON.stringify({ thumbnail: thumbnailBase64 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'API returned successfully but did not provide an image.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in /api/generate:', error);
    return new Response(JSON.stringify({ error: 'An internal server error occurred.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

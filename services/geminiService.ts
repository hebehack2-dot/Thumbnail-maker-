
import { GoogleGenAI } from "@google/genai";

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  throw new Error("API_KEY environment variable is not set.");
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

const createPreviewPrompt = (promptText: string): string => {
  return `
You are a thumbnail designer creating a FAST PREVIEW.
Task: Create a 720x405 preview thumbnail.
Prompt: "${promptText}"
Headshot: An optional headshot image may be provided. If it is, use it as the main character. If not, generate a suitable character or scene based on the prompt.

Instructions:
1. If a headshot is provided, match its face expression to the prompt's tone (e.g., excited, shocked).
2. Place the main character/subject prominently.
3. Add BOLD, readable text related to the prompt. Use a simple, clean font.
4. Create a simple, high-contrast background that relates to the prompt.
5. Use basic, effective lighting. No complex cinematic effects.
The goal is SPEED and a clear concept. The final image must be a single 720x405 JPEG.
  `;
};

const createFinalPrompt = (promptText: string): string => {
  return `
You are an expert YouTube thumbnail designer, specializing in creating viral, high-CTR (click-through-rate) thumbnails.
Your task is to create a professional 1280x720 (16:9 aspect ratio) thumbnail for a YouTube video.

**Core Inputs:**
1.  **Prompt:** "${promptText}"
2.  **YouTuber's Headshot:** An optional image.

**Instructions for Image Handling:**
- **If a Headshot IS Provided:** Follow the "Face & Identity Preservation" rules below strictly. The provided headshot is the SOLE identity reference.
- **If a Headshot IS NOT Provided:** Generate a compelling visual, character, or scene that perfectly matches the prompt. The style should be photorealistic and engaging.

**If a Headshot is Provided - CRITICAL RULE: Face & Identity Preservation**
- **You MUST use this person.** DO NOT generate a new, different, or random person's face.
- **Maintain Identity:** Strictly preserve the original person's core identity: facial structure, skin tone, hairstyle, and proportions. The final person must be 100% recognizable.
- **Enhance, Don't Replace:** Your job is to *enhance* the provided face, not replace it.
- **Expression Modification:** Modify the facial expression to match the prompt's emotional tone (e.g., shock, excitement). The expression should be clear and exaggerated for impact, but it MUST be on the original person's face.
- **Realism is Key:** The enhanced face must blend naturally and look realistic.

**General Design Instructions:**
1.  **Analyze the Tone:** Read the prompt to determine the emotional tone.
2.  **Composition:** Place the main subject (either the provided person or the generated one) prominently. If using the provided headshot, maintain a natural head angle.
3.  **Typography:**
    *   Render a short, punchy version of the prompt's key message in **BOLD, eye-catching text**.
    *   Use modern, readable fonts with a clear visual hierarchy.
    *   Use high-contrast text colors with outlines or shadows.
4.  **Background & Style:**
    *   Create a dynamic background related to the prompt.
    *   Implement a **cinematic depth of field** effect.
    *   Use **vibrant, high-contrast colors**.
    *   Add **glowing highlights** to make elements pop.
5.  **Quality Enhancement (If using headshot):**
    *   Increase sharpness and clarity of the face.
    *   Improve eye brightness and add a catchlight.
    *   Smooth minor skin imperfections while retaining natural texture.

The final image must be a single 1280x720 JPEG, scroll-stopping, professional, and fully optimized for maximum engagement on YouTube.
  `;
};

const createFaceLockPrompt = (promptText: string): string => {
  return `
You are a master photo editor performing a highly constrained face enhancement and composition task. Your goal is to create a 1280x720 YouTube thumbnail.

**Core Inputs:**
1.  **Prompt:** "${promptText}"
2.  **YouTuber's Headshot:** [Image provided]

**ABSOLUTE NON-NEGOTIABLE RULE: "FACE LOCK" MODE IS ENABLED.**
- **ZERO IDENTITY CHANGE:** You MUST use the *exact* face from the provided headshot. Do NOT generate a new face. Do NOT alter the facial structure, skin tone, hair color, or hairstyle. The person must be perfectly, 1:1 recognizable.
- **TREAT THE FACE AS A LOCKED ASSET:** Imagine you are cutting out the person's head and neck from the original photo. Your only job is to enhance *this specific asset* and composite it into a new scene.
- **PERMITTED ENHANCEMENTS (ON THE ORIGINAL FACE ONLY):**
    - **Lighting:** Adjust lighting on the face to match the new background. Add cinematic rim lighting or highlights.
    - **Sharpness & Clarity:** Increase sharpness and detail.
    - **Expression:** You may slightly intensify the existing expression (e.g., make a smile wider, eyes slightly more open in surprise) but you CANNOT change the fundamental expression or alter the facial muscles in a way that changes the person's identity.
- **POSE:** Maintain the original head angle and pose.

**Design Instructions:**
1.  **Analyze Tone:** Determine the emotional tone from the prompt.
2.  **Composite Scene:** Create a new, dynamic background related to the video topic.
3.  **Place the "Locked Face":** Seamlessly composite the enhanced, original headshot onto the new background. If needed, generate a suitable body/shoulders that matches the head's angle.
4.  **Typography & Style:** Add bold text, vibrant colors, and cinematic depth of field to the scene *around* the locked face, following standard high-CTR thumbnail design principles.

The final image must be a professional 1280x720 JPEG where the person is unmistakably the same individual from the uploaded photo.
  `;
};


export const generateThumbnail = async (
  promptText: string,
  headshotBase64: string | null,
  mimeType: string | null,
  quality: 'preview' | 'final',
  isFaceMatchEnabled: boolean
): Promise<string | null> => {
  try {
    let prompt: string;
    if (quality === 'final') {
        prompt = isFaceMatchEnabled && headshotBase64 ? createFaceLockPrompt(promptText) : createFinalPrompt(promptText);
    } else {
        prompt = createPreviewPrompt(promptText);
    }
    
    const parts: any[] = [];
    if (headshotBase64 && mimeType) {
        parts.push({
            inlineData: {
                data: headshotBase64,
                mimeType: mimeType,
            },
        });
    }
    parts.push({ text: prompt });
    
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: { parts },
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          return part.inlineData.data;
        }
    }

    return null;
  } catch (error) {
    console.error("Error generating thumbnail with Gemini:", error);
    if(error instanceof Error && error.message.includes('face')){
        throw new Error("Face Match Failed. Please try another photo with a clear frontal view.");
    }
    throw new Error("An error occurred during thumbnail generation.");
  }
};

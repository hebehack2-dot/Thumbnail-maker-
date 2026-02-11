
export const generateThumbnail = async (
  promptText: string,
  headshotBase64: string | null,
  mimeType: string | null,
  quality: 'preview' | 'final'
): Promise<string | null> => {
  try {
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        promptText,
        headshotBase64,
        mimeType,
        quality,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      // The serverless function provides a user-friendly error message.
      throw new Error(data.error || 'An unknown error occurred during thumbnail generation.');
    }

    if (data.thumbnail) {
      return data.thumbnail;
    }

    // This case should ideally be handled by the serverless function's error response.
    throw new Error('API response did not contain a valid thumbnail.');

  } catch (error) {
    console.error("Error calling /api/generate:", error);
    // Re-throw the error so the UI component can catch it and display it.
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("An unexpected error occurred.");
  }
};


export const fileToBase64 = (
  file: File, 
  maxWidth = 1024, 
  maxHeight = 1024, 
  quality = 0.8,
  maxSizeMB = 10
): Promise<{ base64: string; mimeType: string }> => {
  return new Promise((resolve, reject) => {
    // Enforce file size limit client-side before compression
    if (file.size > maxSizeMB * 1024 * 1024) {
      return reject(new Error(`Image size must be under ${maxSizeMB}MB.`));
    }

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onerror = reject;
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onerror = reject;
      img.onload = () => {
        let { width, height } = img;

        // Calculate new dimensions while maintaining aspect ratio
        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return reject(new Error('Failed to get canvas context.'));
        }
        ctx.drawImage(img, 0, 0, width, height);
        
        // Force JPEG for better compression, which is ideal for this use case
        const mimeType = 'image/jpeg';
        const dataUrl = canvas.toDataURL(mimeType, quality);
        const base64 = dataUrl.split(',')[1];

        if (base64) {
          resolve({ base64, mimeType });
        } else {
          reject(new Error("Failed to compress image."));
        }
      };
    };
  });
};

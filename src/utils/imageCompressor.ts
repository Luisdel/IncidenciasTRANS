/**
 * Compresor de imagenes en cliente para bajo consumo de ancho de banda en red local (LAN/WAN privada).
 * Reduce capturas de pantalla y fotos pesadas (ej. 3-8 MB) a ~40-90 KB en WebP o JPEG
 * redimensionando a un maximo razonable (1280px) antes de transmitir por la red.
 */

export interface CompressionResult {
  filename: string;
  mime_type: string;
  data_base64: string;
  size_bytes: number;
  original_bytes: number;
  saved_percentage: number;
  width: number;
  height: number;
}

export async function compressImage(
  file: File,
  maxDimension = 1280,
  quality = 0.78
): Promise<CompressionResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Error al leer el archivo de imagen'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Formato de imagen invalido'));
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // Downscale while preserving aspect ratio if larger than maxDimension
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          return reject(new Error('No se pudo inicializar el contexto grafico'));
        }

        // Draw and compress
        ctx.drawImage(img, 0, 0, width, height);

        // Try WebP first for best compression; fallback to JPEG
        let mimeType = 'image/webp';
        let dataUrl = canvas.toDataURL('image/webp', quality);
        if (!dataUrl.startsWith('data:image/webp')) {
          mimeType = 'image/jpeg';
          dataUrl = canvas.toDataURL('image/jpeg', quality);
        }

        // Estimate byte size from base64 string
        const base64Content = dataUrl.split(',')[1] || '';
        const sizeBytes = Math.round(base64Content.length * 0.75);
        const originalBytes = file.size;
        const savedPercentage = originalBytes > 0
          ? Math.max(0, Math.round(((originalBytes - sizeBytes) / originalBytes) * 100))
          : 0;

        const cleanName = file.name.replace(/\.[^/.]+$/, '') + (mimeType === 'image/webp' ? '.webp' : '.jpg');

        resolve({
          filename: cleanName,
          mime_type: mimeType,
          data_base64: dataUrl,
          size_bytes: sizeBytes,
          original_bytes: originalBytes,
          saved_percentage: savedPercentage,
          width,
          height,
        });
      };

      img.src = reader.result as string;
    };

    reader.readAsDataURL(file);
  });
}

export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

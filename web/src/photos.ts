// Client-side photo helpers — resize + mime gating before upload. Keeps
// payloads under the server's 8 MB ceiling and well within Claude's per-image
// vision budget. We do this client-side to avoid a native `sharp` dep on the
// Windows host.

const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp'] as const;
const MAX_LONG_EDGE = 1600;
const OUTPUT_MIME = 'image/jpeg';
const OUTPUT_QUALITY = 0.85;

export type AcceptedFile = { blob: Blob; previewUrl: string };

export function isAcceptedImage(file: File): boolean {
  return (ALLOWED_MIMES as readonly string[]).includes(file.type);
}

export async function resizeForUpload(file: File): Promise<AcceptedFile> {
  if (!isAcceptedImage(file)) {
    throw new Error(`Unsupported image type: ${file.type || 'unknown'}`);
  }
  const bitmap = await createImageBitmap(file);
  const longest = Math.max(bitmap.width, bitmap.height);
  const scale = longest > MAX_LONG_EDGE ? MAX_LONG_EDGE / longest : 1;
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context unavailable');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('canvas toBlob returned null'))),
      OUTPUT_MIME,
      OUTPUT_QUALITY
    );
  });
  return { blob, previewUrl: URL.createObjectURL(blob) };
}

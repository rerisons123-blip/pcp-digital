/**
 * Compressão de imagem no dispositivo, antes de qualquer envio.
 * Reduz o consumo de armazenamento no Supabase Storage (regra 13) e o tamanho do
 * payload enviado ao Worker de IA, sem prejudicar a legibilidade do texto.
 */

const MAX_DIMENSION = 1600; // px no lado maior
const JPEG_QUALITY = 0.72;

/**
 * @param {File} file - arquivo vindo do <input type="file" capture="environment">
 * @returns {Promise<{ blob: Blob, dataUrl: string, base64: string, mediaType: string }>}
 */
export async function compressImage(file) {
  const bitmap = await loadBitmap(file);

  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, width, height);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
  const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  const base64 = dataUrl.split(',')[1];

  return { blob, dataUrl, base64, mediaType: 'image/jpeg', width, height };
}

async function loadBitmap(file) {
  // createImageBitmap é suportado no Safari iOS moderno e evita travar a UI com FileReader
  // + Image manual; caímos para o método clássico se não estiver disponível.
  if (window.createImageBitmap) {
    try {
      return await createImageBitmap(file);
    } catch {
      // segue para o fallback abaixo
    }
  }
  return await loadBitmapFallback(file);
}

function loadBitmapFallback(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Não foi possível carregar a imagem.'));
    };
    img.src = url;
  });
}

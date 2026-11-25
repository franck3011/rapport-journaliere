/**
 * Compression des photos avant envoi au serveur.
 *
 * Un appareil photo de téléphone produit des fichiers de 3 à 8 Mo. Encodés en
 * base64 (facteur 1,33), ils dépassent la limite de corps de requête de Vercel
 * (~4,5 Mo) : la requête échoue en « Request Entity Too Large » (413).
 *
 * On redimensionne à 2200 px de côté maximum et on ré-encode en JPEG : une
 * photo de chantier reste parfaitement lisible pour un rapport, mais pèse
 * quelques centaines de kilo-octets.
 */

const MAX_SIDE = 2200;
const QUALITY = 0.78;

export async function compressImageFile(
  file: File,
  maxSide: number = MAX_SIDE,
  quality: number = QUALITY,
): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  if (file.size <= 600 * 1024) return file; // déjà léger : on ne touche pas

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return file;

    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality),
    );
    if (!blob || blob.size >= file.size) return file;

    const baseName = file.name.replace(/\.[^.]+$/, "");
    return new File([blob], `${baseName}.jpg`, { type: "image/jpeg" });
  } catch {
    // Format non décodable par le navigateur (HEIC par exemple) : on envoie
    // l'original plutôt que d'échouer silencieusement.
    return file;
  }
}

/** Compression de plusieurs fichiers, dans l'ordre. */
export async function compressImageFiles(files: File[]): Promise<File[]> {
  const output: File[] = [];
  for (const file of files) output.push(await compressImageFile(file));
  return output;
}

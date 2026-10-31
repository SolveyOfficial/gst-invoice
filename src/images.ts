// Reads a logo or signature picked by the user as a small PNG or JPEG data URL,
// the two image types a PDF can hold.
import { UserError } from "./lib/errors";

export const IMAGE_TYPES = "image/png,image/jpeg,image/webp,image/gif";

export const imageToDataUrl = async (file: File, maxSize = 800) => {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new UserError("This file could not be read as an image. Use a PNG or JPEG.");
  }
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d")!;
  const jpeg = file.type === "image/jpeg";
  if (jpeg) {
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  // photos stay JPEG; logos keep their transparency as PNG
  return jpeg ? canvas.toDataURL("image/jpeg", 0.9) : canvas.toDataURL("image/png");
};

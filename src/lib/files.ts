export interface InputFile {
  name: string;
  type: string;
  bytes: Uint8Array;
}

export const formatBytes = (bytes: number) =>
  bytes < 1024
    ? `${bytes} B`
    : bytes < 1024 * 1024
      ? `${Math.round(bytes / 1024)} KB`
      : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export const readFile = async (file: File): Promise<InputFile> => ({
  name: file.name,
  type: file.type,
  bytes: new Uint8Array(await file.arrayBuffer()),
});

/** Saves bytes as a file in the user's downloads. */
export const download = (bytes: Uint8Array | Blob, name: string, type: string) => {
  const blob = bytes instanceof Blob ? bytes : new Blob([bytes as BlobPart], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
};

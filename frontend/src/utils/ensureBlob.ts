export async function ensureBlobIsFile(blob: Blob): Promise<Blob> {
  // If server responded with JSON error, blob type may be application/json
  if (blob && blob.type && blob.type.includes("application/json")) {
    try {
      const text = await blob.text();
      const obj = JSON.parse(text);
      const msg = obj?.message || obj?.error || "Export failed";
      throw new Error(msg);
    } catch {
      // If parsing fails, still throw a generic error
      throw new Error("Export failed");
    }
  }
  return blob;
}

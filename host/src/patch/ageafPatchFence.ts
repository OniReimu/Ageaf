export function extractAgeafPatchFence(value: string): string | null {
  // Prefer an explicit marker so we don't accidentally parse random JSON blobs.
  const match = value.match(/```(?:ageaf[-_]?patch)[^\n]*\n([\s\S]*?)```/i);
  if (!match) return null;
  const body = match[1]?.trim();
  return body ? body : null;
}


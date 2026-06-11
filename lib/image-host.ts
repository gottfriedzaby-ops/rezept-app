// next/image optimization is only configured for our Supabase storage host
// (next.config.js remotePatterns). External image URLs must be rendered with
// unoptimized={true} or next/image refuses to load them.
export function isOptimizableImageHost(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith(".supabase.co");
  } catch {
    return false;
  }
}

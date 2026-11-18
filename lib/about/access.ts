/** Shareable Mansel Live pages. The auth proxy must let these through. */
export function aboutPathIsPublic(pathname: string): boolean {
  return pathname === "/about" || pathname.startsWith("/about/");
}

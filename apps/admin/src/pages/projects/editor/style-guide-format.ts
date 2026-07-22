export function shortStyleGuideHash(checksum: string) {
  return checksum.startsWith("sha256:") ? checksum.slice(7, 19) : checksum.slice(0, 12);
}

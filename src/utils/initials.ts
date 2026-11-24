/**
 * Derives readable 2-character avatar initials from a player or team display name.
 * Distinguishes numbered/multi-word names (e.g. "Probe Alpha" -> "PA", "GSPlayer1" -> "G1").
 */
export function getInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';

  const parts = trimmed.split(/[\s&/-]+/).filter(Boolean);
  if (parts.length >= 2) {
    const first = parts[0];
    const last = parts[parts.length - 1];
    const firstChar = first.charAt(0);
    const lastChar = last.charAt(0);
    if (firstChar && lastChar) {
      return `${firstChar}${lastChar}`.toUpperCase();
    }
  }

  const singleTrailingNum = trimmed.match(/^([A-Za-z]).*?(\d+)$/);
  if (singleTrailingNum) {
    return `${singleTrailingNum[1]}${singleTrailingNum[2].slice(-1)}`.toUpperCase();
  }

  return trimmed.slice(0, 2).toUpperCase();
}

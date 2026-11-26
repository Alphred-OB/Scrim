/**
 * Release notes as a short list of plain lines. GitHub hands the updater HTML (or markdown, or a list of
 * per version notes); the update screen wants "What's new" as a few readable lines.
 */
export function releaseNoteLines(notes: unknown, max = 6): string[] {
  let text = ''
  if (typeof notes === 'string') text = notes
  else if (Array.isArray(notes)) text = notes.map((n) => (n as { note?: string }).note ?? '').join('\n')
  return text
    .replace(/<\s*(?:br|\/p|\/li|\/h[1-6]|\/div|\/ul|\/ol)\b[^>]*>/gi, '\n') // block ends become line breaks
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&') // last, so "&amp;lt;" stays "&lt;"
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)]|#{1,6})\s+/, '').trim())
    .filter(Boolean)
    .slice(0, max)
    .map((line) => (line.length > 200 ? line.slice(0, 197) + '...' : line))
}

/**
 * Parser for the "Format" global rule: *narration or action*, (thought), speech as plain text, ((out of character)).
 * It works line by line, so one malformed marker cannot change the style of the rest of the message:
 * - An unclosed * ends at the end of its line. It continues into the next line only when that line
 *   has the matching closing *.
 * - ( ) is a thought only when the line has no speech outside it. In a speech line, ( ) is part of the speech.
 * - ** (markdown bold) counts as a single *.
 */
export type RpKind = 'speech' | 'narration' | 'thought' | 'ooc'
export interface RpSegment {
  kind: RpKind
  text: string
}

// A single ( ... ) that is not part of (( ... )).
const THOUGHT = /(?<!\()\((?!\()[^()]*\)(?!\))/g
// What may stay outside the thoughts on a thought-only line.
const ONLY_PUNCTUATION = /^[\s.,;:!?…—–-]*$/

const starCount = (line: string) => line.match(/\*/g)?.length ?? 0

export function parseRp(text: string): RpSegment[][] {
  const lines = text.replace(/\*{2,}/g, '*').split('\n')
  let carry = false
  return lines.map((line, index) => {
    if (!carry && line.trimStart().startsWith('((')) return [{ kind: 'ooc', text: line }]
    const parts: RpSegment[] = []
    let narration = carry
    let buffer = ''
    const flush = () => {
      if (buffer) parts.push({ kind: narration ? 'narration' : 'speech', text: buffer })
      buffer = ''
    }
    for (const ch of line) {
      if (ch === '*') {
        flush()
        narration = !narration
      } else {
        buffer += ch
      }
    }
    flush()
    // An odd number of * on the next line means it holds the closing * of this line's narration.
    carry = narration && index + 1 < lines.length && starCount(lines[index + 1]) % 2 === 1
    return markThoughts(parts)
  })
}

function markThoughts(parts: RpSegment[]): RpSegment[] {
  const speech = parts.filter((p) => p.kind === 'speech').map((p) => p.text).join('')
  if (!speech.match(THOUGHT) || !ONLY_PUNCTUATION.test(speech.replace(THOUGHT, ''))) return parts
  return parts.flatMap((part) => {
    if (part.kind !== 'speech') return [part]
    const out: RpSegment[] = []
    let last = 0
    for (const m of part.text.matchAll(THOUGHT)) {
      const at = m.index ?? 0
      if (at > last) out.push({ kind: 'speech', text: part.text.slice(last, at) })
      out.push({ kind: 'thought', text: m[0] })
      last = at + m[0].length
    }
    if (last < part.text.length) out.push({ kind: 'speech', text: part.text.slice(last) })
    return out
  })
}

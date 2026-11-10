import { Fragment } from 'react'
import { parseRp } from '../rpFormat'

const CLASS = { narration: 'rp-narration', thought: 'rp-thought', speech: undefined, ooc: undefined } as const

/** Renders roleplay text with the "Format" rule styles. The parsing rules are in rpFormat.ts. */
export default function RpText({ text }: { text: string }) {
  return (
    <>
      {parseRp(text).map((line, i) => (
        <Fragment key={i}>
          {i > 0 && '\n'}
          {line.map((seg, j) => (CLASS[seg.kind] ? <span key={j} className={CLASS[seg.kind]}>{seg.text}</span> : <Fragment key={j}>{seg.text}</Fragment>))}
        </Fragment>
      ))}
    </>
  )
}

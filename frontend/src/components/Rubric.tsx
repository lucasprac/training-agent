import type { ChoiceOption, Indicator, RubricLevel } from '../api'
import { useI18n } from '../i18n'

/** Rubric or scale levels: whole numbers with a description. Sage accepts 2 to 26 distinct levels. */
export function LevelsEditor({ levels, onChange }: { levels: RubricLevel[]; onChange: (levels: RubricLevel[]) => void }) {
  const { t } = useI18n()
  const set = (i: number, patch: Partial<RubricLevel>) => onChange(levels.map((l, j) => (j === i ? { ...l, ...patch } : l)))
  const next = levels.length ? Math.max(...levels.map((l) => l.level)) + 1 : 0
  const numbers = levels.map((l) => l.level)
  const problem =
    levels.length < 2 ? t('Use at least 2 levels.') :
    levels.length > 26 ? t('Use at most 26 levels.') :
    new Set(numbers).size !== numbers.length ? t('Every level needs a different number.') :
    numbers.some((n) => !Number.isInteger(n)) ? t('Levels must be whole numbers.') : ''
  return (
    <div className="stack" style={{ gap: 6 }}>
      {levels.map((l, i) => (
        <div key={i} className="row" style={{ flexWrap: 'nowrap' }}>
          <input type="number" step={1} style={{ width: 70 }} value={l.level} aria-label={t('Level')} onChange={(e) => set(i, { level: Number(e.target.value) })} />
          <input value={l.description} placeholder={t('What this level looks like')} onChange={(e) => set(i, { description: e.target.value })} />
          <button className="ghost small danger" title={t('Remove')} onClick={() => onChange(levels.filter((_, j) => j !== i))}>✕</button>
        </div>
      ))}
      <div className="row">
        <button className="small" onClick={() => onChange([...levels, { level: next, description: '' }])}>{t('+ Add level')}</button>
        {problem && <span className="small warn-text">{problem}</span>}
      </div>
    </div>
  )
}

/** Choice options: a name and a description for Sage. */
export function OptionsEditor({ options, onChange }: { options: ChoiceOption[]; onChange: (options: ChoiceOption[]) => void }) {
  const { t } = useI18n()
  const set = (i: number, patch: Partial<ChoiceOption>) => onChange(options.map((o, j) => (j === i ? { ...o, ...patch } : o)))
  return (
    <div className="stack" style={{ gap: 6 }}>
      {options.map((o, i) => (
        <div key={i} className="row" style={{ flexWrap: 'nowrap' }}>
          <input style={{ width: 180 }} value={o.option} placeholder={t('Option')} onChange={(e) => set(i, { option: e.target.value })} />
          <input value={o.description} placeholder={t('When this option applies')} onChange={(e) => set(i, { description: e.target.value })} />
          <button className="ghost small danger" title={t('Remove')} onClick={() => onChange(options.filter((_, j) => j !== i))}>✕</button>
        </div>
      ))}
      <div className="row">
        <button className="small" onClick={() => onChange([...options, { option: '', description: '' }])}>{t('+ Add option')}</button>
        {options.length < 2 && <span className="small warn-text">{t('Sage needs at least 2 options.')}</span>}
      </div>
    </div>
  )
}

/** Observable behaviours. A negative behaviour is one to avoid. */
export function IndicatorsEditor({ indicators, onChange }: { indicators: Indicator[]; onChange: (indicators: Indicator[]) => void }) {
  const { t } = useI18n()
  const set = (i: number, patch: Partial<Indicator>) => onChange(indicators.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  const nextId = () => {
    const used = new Set(indicators.map((x) => x.id))
    let n = indicators.length + 1
    while (used.has(`i${n}`)) n += 1
    return `i${n}`
  }
  return (
    <div className="stack" style={{ gap: 6 }}>
      {indicators.map((x, i) => (
        <div key={x.id} className="row" style={{ flexWrap: 'nowrap' }}>
          <select style={{ width: 150 }} value={x.polarity} aria-label={t('Kind')} onChange={(e) => set(i, { polarity: e.target.value as Indicator['polarity'] })}>
            <option value="positive">{t('to show')}</option>
            <option value="negative">{t('to avoid')}</option>
          </select>
          <input value={x.text} placeholder={t('An observable behaviour')} onChange={(e) => set(i, { text: e.target.value })} />
          <button className="ghost small danger" title={t('Remove')} onClick={() => onChange(indicators.filter((_, j) => j !== i))}>✕</button>
        </div>
      ))}
      <div><button className="small" onClick={() => onChange([...indicators, { id: nextId(), text: '', polarity: 'positive' }])}>{t('+ Add behaviour')}</button></div>
    </div>
  )
}

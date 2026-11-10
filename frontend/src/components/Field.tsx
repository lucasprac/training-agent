import { useEffect, useState, type ReactNode } from 'react'

interface TextProps {
  label: string
  value: string | number | null | undefined
  onChange: (value: string) => void
  multiline?: boolean
  rows?: number
  placeholder?: string
  type?: string
  code?: boolean
  hint?: ReactNode
}

export function TextField({ label, value, onChange, multiline, rows = 4, placeholder, type = 'text', code, hint }: TextProps) {
  return (
    <label className="field">
      {label}
      {multiline ? (
        <textarea
          className={code ? 'code' : undefined}
          rows={rows}
          value={value ?? ''}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input type={type} value={value ?? ''} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      )}
      {hint && <span className="small">{hint}</span>}
    </label>
  )
}

export function NumberField({ label, value, onChange, min, max, step }: {
  label: string
  value: number | null | undefined
  onChange: (value: number | null) => void
  min?: number
  max?: number
  step?: number
}) {
  return (
    <label className="field">
      {label}
      <input
        type="number"
        value={value ?? ''}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
      />
    </label>
  )
}

export function SelectField({ label, value, options, onChange }: {
  label: string
  value: string
  options: (string | { value: string; label: string })[]
  onChange: (value: string) => void
}) {
  return (
    <label className="field">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => {
          const opt = typeof o === 'string' ? { value: o, label: o } : o
          return (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          )
        })}
      </select>
    </label>
  )
}

export function CheckField({ label, checked, onChange, disabled }: {
  label: string
  checked: boolean
  onChange: (value: boolean) => void
  disabled?: boolean
}) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  )
}

/** Comma-separated list editor for keys. The list is parsed when the field loses focus. */
export function ListField({ label, value, onChange, hint }: {
  label: string
  value: string[]
  onChange: (value: string[]) => void
  hint?: ReactNode
}) {
  const joined = value.join(', ')
  const [text, setText] = useState(joined)
  useEffect(() => setText(joined), [joined])
  return (
    <label className="field">
      {label}
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => onChange(text.split(',').map((s) => s.trim()).filter(Boolean))}
      />
      {hint && <span className="small">{hint}</span>}
    </label>
  )
}

// Small control primitives for the parameter panel.

import { useState } from "react";

export function Section({ title, subtitle, children, open = false }: {
  title: string; subtitle?: string; children: React.ReactNode; open?: boolean;
}) {
  const [isOpen, setOpen] = useState(open);
  return (
    <section className={`wb-section ${isOpen ? "is-open" : ""}`}>
      <button className="wb-section-head" onClick={() => setOpen((o) => !o)}>
        <span className="wb-caret">{isOpen ? "▾" : "▸"}</span>
        <span className="wb-section-title">{title}</span>
        {subtitle && <span className="wb-section-sub">{subtitle}</span>}
      </button>
      {isOpen && <div className="wb-section-body">{children}</div>}
    </section>
  );
}

export function Slider({ label, value, min, max, step, onChange, hint, format }: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; hint?: string; format?: (v: number) => string;
}) {
  return (
    <label className="wb-field">
      <span className="wb-label">
        {label}
        <output>{format ? format(value) : value}</output>
      </span>
      <input type="range" min={min} max={max} step={step} value={value}
             onChange={(e) => onChange(Number(e.target.value))} />
      {hint && <span className="wb-hint">{hint}</span>}
    </label>
  );
}

export function NumberField({ label, value, step = 1, onChange, hint }: {
  label: string; value: number; step?: number; onChange: (v: number) => void; hint?: string;
}) {
  return (
    <label className="wb-field">
      <span className="wb-label">{label}</span>
      <input type="number" value={value} step={step}
             onChange={(e) => e.target.value !== "" && onChange(Number(e.target.value))} />
      {hint && <span className="wb-hint">{hint}</span>}
    </label>
  );
}

export function Select<T extends string>({ label, value, options, onChange, hint }: {
  label: string; value: T; options: readonly T[]; onChange: (v: T) => void; hint?: string;
}) {
  return (
    <label className="wb-field">
      <span className="wb-label">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      {hint && <span className="wb-hint">{hint}</span>}
    </label>
  );
}

export function Toggle({ label, value, onChange }: {
  label: string; value: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <label className="wb-toggle">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export function Stat({ label, value, warn, hint }: {
  label: string; value: string; warn?: boolean; hint?: string;
}) {
  return (
    <div className={`wb-stat ${warn ? "is-warn" : ""}`} title={hint}>
      <span className="wb-stat-label">{label}</span>
      <span className="wb-stat-value">{value}</span>
    </div>
  );
}

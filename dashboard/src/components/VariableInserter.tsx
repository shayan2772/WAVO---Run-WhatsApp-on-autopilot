import { type RefObject } from 'react';
import { Braces } from 'lucide-react';
import './VariableInserter.css';

export interface MergeVariable {
  token: string; // e.g. "name" → inserts {{name}}
  label: string; // human label shown on the chip
}

// The merge fields the campaign renderer understands (contact.name / .phone + custom attributes).
export const DEFAULT_VARIABLES: MergeVariable[] = [
  { token: 'name', label: 'Name' },
  { token: 'phone', label: 'Phone' },
];

interface VariableInserterProps {
  /** The textarea/input to insert into. */
  targetRef: RefObject<HTMLTextAreaElement | HTMLInputElement | null>;
  value: string;
  onChange: (next: string) => void;
  variables?: MergeVariable[];
  label?: string;
}

/**
 * A row of clickable merge-field chips. Clicking one inserts `{{token}}` at the caret in the target
 * field (or replaces the selection), so users never have to remember or type the variable syntax.
 */
export function VariableInserter({
  targetRef,
  value,
  onChange,
  variables = DEFAULT_VARIABLES,
  label = 'Insert variable',
}: VariableInserterProps) {
  const insert = (token: string) => {
    const snippet = `{{${token}}}`;
    const el = targetRef.current;
    // Fallback: no element / no caret info → append.
    if (!el || el.selectionStart == null) {
      onChange(value + snippet);
      return;
    }
    const start = el.selectionStart;
    const end = el.selectionEnd ?? start;
    const next = value.slice(0, start) + snippet + value.slice(end);
    onChange(next);
    // Restore focus and drop the caret right after the inserted token.
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + snippet.length;
      try {
        el.setSelectionRange(pos, pos);
      } catch {
        /* inputs of some types don't support selection ranges */
      }
    });
  };

  return (
    <div className="var-inserter" role="group" aria-label={label}>
      <span className="var-inserter__label">
        <Braces size={13} /> {label}:
      </span>
      {variables.map(v => (
        <button key={v.token} type="button" className="var-chip" onClick={() => insert(v.token)} title={`Insert {{${v.token}}}`}>
          {v.label}
        </button>
      ))}
    </div>
  );
}

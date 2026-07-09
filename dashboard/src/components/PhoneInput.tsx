import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import {
  AsYouType,
  parsePhoneNumberFromString,
  getCountryCallingCode,
  COUNTRIES,
  guessDefaultCountry,
  type CountryCode,
} from '../utils/phone';
import './PhoneInput.css';

interface PhoneInputProps {
  /** Current value in E.164 (e.g. "+923001234567"). Empty string when blank. */
  value: string;
  /** Emits the canonical E.164 number ("" while incomplete/empty). */
  onChange: (e164: string) => void;
  defaultCountry?: CountryCode;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
}

/**
 * International phone field: a searchable country picker (flag + dial code) beside a text input
 * that auto-formats digits as you type using each country's national format (libphonenumber-js).
 * Typing a leading "+" auto-detects the country. Always reports a clean E.164 number upward, so
 * callers never have to normalize.
 */
export function PhoneInput({
  value,
  onChange,
  defaultCountry,
  placeholder = 'Phone number',
  disabled,
  id,
  className = '',
}: PhoneInputProps) {
  const [country, setCountry] = useState<CountryCode>(defaultCountry || guessDefaultCountry());
  const [text, setText] = useState(''); // formatted national (or international) text shown in the field
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Prefill once from an initial value (edit flows). Runs on mount only.
  useEffect(() => {
    if (!value) return;
    const parsed = parsePhoneNumberFromString(value.startsWith('+') ? value : `+${value}`);
    if (parsed?.country) {
      setCountry(parsed.country);
      setText(new AsYouType(parsed.country).input(parsed.nationalNumber));
    } else {
      setText(value);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Let the parent clear the field (e.g. after a successful submit) by resetting value to "".
  useEffect(() => {
    if (value === '') setText('');
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onEsc);
    searchRef.current?.focus();
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  const dial = getCountryCallingCode(country);

  const handleInput = (raw: string) => {
    // Leading "+" → treat as full international and auto-detect the country.
    if (raw.trimStart().startsWith('+')) {
      const ayt = new AsYouType();
      const formatted = ayt.input(raw);
      const detected = ayt.getCountry();
      if (detected) setCountry(detected);
      setText(formatted);
      onChange(ayt.getNumber()?.number ?? '');
      return;
    }
    const ayt = new AsYouType(country);
    setText(ayt.input(raw));
    onChange(ayt.getNumber()?.number ?? '');
  };

  const selectCountry = (c: CountryCode) => {
    setOpen(false);
    setSearch('');
    // Re-interpret the existing national digits under the newly chosen country.
    const prev = new AsYouType(country);
    prev.input(text);
    const nn = prev.getNumber()?.nationalNumber ?? text.replace(/\D/g, '');
    setCountry(c);
    const ayt = new AsYouType(c);
    setText(ayt.input(nn));
    onChange(ayt.getNumber()?.number ?? (nn ? `+${getCountryCallingCode(c)}${nn}` : ''));
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return COUNTRIES;
    const digits = q.replace(/[^\d]/g, '');
    return COUNTRIES.filter(
      c => c.name.toLowerCase().includes(q) || (digits && c.dial.includes(digits)) || c.iso2.toLowerCase() === q,
    );
  }, [search]);

  return (
    <div ref={rootRef} className={`phone-input ${className}`.trim()}>
      <button
        type="button"
        className="phone-input__country"
        onClick={() => setOpen(o => !o)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Select country"
      >
        <span className="phone-input__flag">{COUNTRIES.find(c => c.iso2 === country)?.flag ?? '🏳️'}</span>
        <span className="phone-input__dial">+{dial}</span>
        <ChevronDown size={14} />
      </button>

      <input
        id={id}
        type="tel"
        inputMode="tel"
        className="phone-input__field"
        value={text}
        placeholder={placeholder}
        disabled={disabled}
        onChange={e => handleInput(e.target.value)}
        autoComplete="tel"
      />

      {open && (
        <div className="phone-input__menu" role="listbox">
          <div className="phone-input__search">
            <Search size={14} />
            <input
              ref={searchRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search country or code…"
            />
          </div>
          <div className="phone-input__list">
            {filtered.map(c => (
              <button
                key={c.iso2}
                type="button"
                role="option"
                aria-selected={c.iso2 === country}
                className={`phone-input__option ${c.iso2 === country ? 'active' : ''}`}
                onClick={() => selectCountry(c.iso2)}
              >
                <span className="phone-input__flag">{c.flag}</span>
                <span className="phone-input__name">{c.name}</span>
                <span className="phone-input__code">+{c.dial}</span>
              </button>
            ))}
            {filtered.length === 0 && <div className="phone-input__empty">No match</div>}
          </div>
        </div>
      )}
    </div>
  );
}

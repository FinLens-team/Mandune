import { useEffect, useRef, useState } from "react";
import type { AssetClass } from "../../contracts/index.js";
import type { InstrumentSuggestion } from "../../instruments/index.js";
import {
  fetchInstrumentSuggestions,
  type InstrumentSearchFn,
} from "./instrument-search.js";

const DEBOUNCE_MS = 200;

const ASSET_CLASS_LABELS: Record<AssetClass, string> = {
  fund: "基金",
  etf: "ETF",
  a_share: "A 股",
};

export interface InstrumentFieldProps {
  id: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  value: string;
  onInput: (text: string) => void;
  onSelect: (suggestion: InstrumentSuggestion) => void;
  /** Injectable for tests; defaults to the /api/instruments/search fetcher. */
  search?: InstrumentSearchFn;
}

/**
 * Accessible fuzzy-match combobox for holding identity.
 * Suggestions are assistive fill-in only: no match never blocks free
 * text, and closing the list keeps whatever the user typed.
 */
export function InstrumentField({
  id,
  label,
  onInput,
  onSelect,
  placeholder,
  required,
  search = fetchInstrumentSuggestions,
  value,
}: InstrumentFieldProps) {
  const listId = `${id}-listbox`;
  const [suggestions, setSuggestions] = useState<InstrumentSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [noMatch, setNoMatch] = useState(false);
  const focusedRef = useRef(false);
  const requestSeq = useRef(0);
  const skipNextSearch = useRef(false);

  useEffect(() => {
    if (skipNextSearch.current) {
      skipNextSearch.current = false;
      return;
    }
    const query = value.trim();
    if (!focusedRef.current || query.length === 0) {
      setSuggestions([]);
      setOpen(false);
      setActiveIndex(-1);
      setNoMatch(false);
      return;
    }
    const seq = ++requestSeq.current;
    const timer = setTimeout(() => {
      void search(query).then((result) => {
        if (seq !== requestSeq.current || !focusedRef.current) return;
        setSuggestions(result);
        setActiveIndex(-1);
        setOpen(result.length > 0);
        setNoMatch(result.length === 0);
      });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search, value]);

  function close() {
    setOpen(false);
    setActiveIndex(-1);
  }

  function select(suggestion: InstrumentSuggestion) {
    // Parent updates `value`; skip the follow-up search so the list stays shut.
    skipNextSearch.current = true;
    requestSeq.current += 1;
    setSuggestions([]);
    setNoMatch(false);
    close();
    onSelect(suggestion);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) {
      if (event.key === "ArrowDown" && suggestions.length > 0) {
        event.preventDefault();
        setOpen(true);
        setActiveIndex(0);
      }
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex(
        (current) => (current - 1 + suggestions.length) % suggestions.length,
      );
    } else if (event.key === "Enter") {
      if (activeIndex >= 0 && activeIndex < suggestions.length) {
        event.preventDefault();
        select(suggestions[activeIndex]!);
      }
    } else if (event.key === "Escape") {
      // Only closes the list; keep the surrounding overlay/page open.
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  }

  return (
    <div className="field instrument-combobox">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <input
        aria-activedescendant={
          open && activeIndex >= 0 ? `${listId}-option-${activeIndex}` : undefined
        }
        aria-autocomplete="list"
        aria-controls={listId}
        aria-expanded={open}
        autoComplete="off"
        id={id}
        onBlur={() => {
          focusedRef.current = false;
          close();
        }}
        onChange={(event) => onInput(event.target.value)}
        onFocus={() => {
          focusedRef.current = true;
        }}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        required={required}
        role="combobox"
        value={value}
      />
      {open ? (
        <ul
          aria-label={`${label}搜索建议`}
          className="instrument-combobox__list"
          id={listId}
          role="listbox"
        >
          {suggestions.map((suggestion, index) => (
            <li
              aria-selected={index === activeIndex}
              className={`instrument-combobox__option${
                index === activeIndex ? " is-active" : ""
              }`}
              id={`${listId}-option-${index}`}
              key={suggestion.symbol}
              onMouseDown={(event) => {
                event.preventDefault();
                select(suggestion);
              }}
              role="option"
            >
              <span className="instrument-combobox__name">{suggestion.name}</span>
              <span className="instrument-combobox__meta">
                {suggestion.symbol} · {ASSET_CLASS_LABELS[suggestion.asset_class]}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {noMatch ? (
        <p className="instrument-combobox__hint" role="status">
          未找到匹配，可直接填写；代码留空则记为未知。
        </p>
      ) : null}
    </div>
  );
}

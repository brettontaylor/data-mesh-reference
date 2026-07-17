import { useEffect, useRef, useState } from "react";
import type { ChangesetEdit, ValidationResult } from "./api";
import { errorMessage, validateEdits } from "./api";

export interface ValidationState {
  /** last completed validation (kept while a newer one is in flight) */
  result: ValidationResult | null;
  /** true from first keystroke until the debounced response lands */
  validating: boolean;
  error: string | null;
}

const DEBOUNCE_MS = 500;

/**
 * Debounced live validation against POST /api/validate (never persists).
 * Pass `null` to disable (e.g. edit not yet well-formed) — clears state.
 * Out-of-order responses are discarded via a monotonic sequence number.
 */
export function useValidation(edits: ChangesetEdit[] | null): ValidationState {
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  // Serialize so deps compare by value, not by array identity per render.
  const key = edits === null ? null : JSON.stringify(edits);

  useEffect(() => {
    seq.current += 1; // invalidate any in-flight response
    if (key === null) {
      setResult(null);
      setValidating(false);
      setError(null);
      return;
    }
    const mySeq = seq.current;
    setValidating(true);
    const timer = window.setTimeout(() => {
      validateEdits(JSON.parse(key) as ChangesetEdit[])
        .then((r) => {
          if (seq.current !== mySeq) return; // stale — ignore
          setResult(r);
          setError(null);
          setValidating(false);
        })
        .catch((e: unknown) => {
          if (seq.current !== mySeq) return;
          setError(errorMessage(e));
          setValidating(false);
        });
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [key]);

  return { result, validating, error };
}

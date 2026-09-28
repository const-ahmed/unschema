import type { CheckValues, CheckedField } from "./profile";

export type LiveCheck = {
  readonly field: CheckedField;
  readonly values: CheckValues;
  readonly signal: AbortSignal;
  readonly epoch: number;
  readonly controller: AbortController;
};

/** Stops late live checks overwriting the final check, whose results stand until an edit. */
export class LiveCheckTracker {
  #epoch = 0;
  #settled = new Set<CheckedField>();
  #inFlight = new Set<AbortController>();

  isSettled(field: CheckedField): boolean {
    return this.#settled.has(field);
  }

  start(
    field: CheckedField,
    values: CheckValues,
    signal: AbortSignal,
  ): LiveCheck {
    const controller = new AbortController();
    if (signal.aborted) controller.abort();
    else
      signal.addEventListener("abort", () => controller.abort(), {
        once: true,
      });
    this.#inFlight.add(controller);
    return {
      field,
      values,
      signal: controller.signal,
      epoch: this.#epoch,
      controller,
    };
  }

  finish(check: LiveCheck): void {
    this.#inFlight.delete(check.controller);
  }

  canApply(check: LiveCheck, currentValues: CheckValues): boolean {
    return (
      check.epoch === this.#epoch && sameValues(check.values, currentValues)
    );
  }

  beginSubmission(fields: Iterable<CheckedField>): void {
    this.#epoch++;
    for (const controller of this.#inFlight) controller.abort();
    this.#inFlight.clear();
    this.#settled = new Set(fields);
  }

  resume(fields: Iterable<CheckedField>): void {
    for (const field of fields) this.#settled.delete(field);
  }

  reset(): void {
    this.#epoch++;
    this.#settled.clear();
  }
}

export function sameValues(a: CheckValues, b: CheckValues): boolean {
  const keys = Object.keys(a) as CheckedField[];
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => a[key] === b[key])
  );
}

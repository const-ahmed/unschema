import {
  CHECK_INPUTS,
  CONTACT_PREFERENCES,
  EMPTY_PROFILE,
  isBlank,
  isOptional,
  isVisible,
} from "./profile";
import type {
  CheckValues,
  CheckedField,
  ContactPreference,
  ProfileValues,
} from "./profile";

/** Keeps each Jev request small and cheap. Jev can read up to 32,000 tokens. */
export const MAX_VALUE_LENGTH = 2000;

export type FieldCheckRequest = {
  field: CheckedField;
  values: CheckValues;
};

export type ProfileSubmission = ProfileValues;

/*
 * Safety checks for the server functions, not form validation: the real form
 * never sends anything that fails them. Parameters are typed for callers, but
 * the data could be anything at runtime.
 */

/** Ignores any values the check doesn't use. */
export function parseFieldCheckRequest(
  input: FieldCheckRequest,
): FieldCheckRequest {
  const { field, values } = asRecord(input);
  if (typeof field !== "string" || !Object.hasOwn(CHECK_INPUTS, field)) {
    throw new TypeError("Unknown field.");
  }
  const checkedField = field as CheckedField;
  const rawValues = asRecord(values);

  const picked: CheckValues = {};
  for (const input of CHECK_INPUTS[checkedField]) {
    const value = rawValues[input];
    if (value === undefined) continue;
    picked[input] = parseValue(value);
  }
  if (picked[checkedField] === undefined) {
    throw new TypeError(`${checkedField} must not be empty.`);
  }
  return { field: checkedField, values: picked };
}

export function parseProfileSubmission(
  input: ProfileSubmission,
): ProfileSubmission {
  const raw = asRecord(input);
  const contactPreference = raw.contactPreference;
  if (!CONTACT_PREFERENCES.includes(contactPreference as ContactPreference)) {
    throw new TypeError("Unknown contactPreference.");
  }

  const values: ProfileSubmission = {
    ...EMPTY_PROFILE,
    contactPreference: contactPreference as ContactPreference,
  };
  for (const field of Object.keys(CHECK_INPUTS) as CheckedField[]) {
    if (!isVisible(field, values.contactPreference)) continue;
    const value = raw[field];
    const empty =
      value === undefined || (typeof value === "string" && isBlank(value));
    if (isOptional(field) && empty) continue;
    values[field] = parseValue(value);
  }
  return values;
}

/** Turnstile tokens are at most 2048 characters. */
const MAX_TURNSTILE_TOKEN_LENGTH = 2048;

export type HumanVerificationRequest = { token: string };

export function parseHumanVerificationRequest(
  input: HumanVerificationRequest,
): HumanVerificationRequest {
  const { token } = asRecord(input);
  if (
    typeof token !== "string" ||
    token.length === 0 ||
    token.length > MAX_TURNSTILE_TOKEN_LENGTH
  ) {
    throw new TypeError("Invalid Turnstile token.");
  }
  return { token };
}

function parseValue(value: unknown): string {
  if (typeof value !== "string") {
    throw new TypeError("Values must be strings.");
  }
  const trimmed = value.trim();
  if (isBlank(trimmed)) {
    throw new TypeError("Values must not be empty.");
  }
  if (trimmed.length > MAX_VALUE_LENGTH) {
    throw new TypeError(
      `Values must be at most ${MAX_VALUE_LENGTH} characters.`,
    );
  }
  return trimmed;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("Expected an object.");
  }
  return value as Record<string, unknown>;
}

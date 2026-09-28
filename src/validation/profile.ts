/**
 * Used by both the browser and the server, so no rules are here; they stay
 * on the server in `src/server/rules.ts`. No imports, so Node can run it for
 * `scripts/jev-smoke.ts`.
 */

export const CONTACT_PREFERENCES = ["email", "phone"] as const;
export type ContactPreference = (typeof CONTACT_PREFERENCES)[number];

export type ProfileValues = {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  contactPreference: ContactPreference;
  email: string;
  confirmEmail: string;
  phone: string;
  bio: string;
};

export const EMPTY_PROFILE: ProfileValues = {
  firstName: "",
  lastName: "",
  dateOfBirth: "",
  contactPreference: "email",
  email: "",
  confirmEmail: "",
  phone: "",
  bio: "",
};

export type CheckedField = Exclude<keyof ProfileValues, "contactPreference">;

/**
 * A check reruns when any field it reads changes. Bio reads the other
 * details so Jev can spot repeats.
 */
export const CHECK_INPUTS = {
  firstName: ["firstName"],
  lastName: ["lastName"],
  dateOfBirth: ["dateOfBirth"],
  email: ["email"],
  confirmEmail: ["confirmEmail", "email"],
  phone: ["phone"],
  bio: ["bio", "firstName", "lastName", "dateOfBirth", "email", "phone"],
} as const satisfies Record<CheckedField, readonly CheckedField[]>;

/**
 * Last name is optional so people with one name can finish the form. An empty
 * optional field isn't checked.
 */
export const OPTIONAL_FIELDS: readonly CheckedField[] = ["lastName"];

export type CheckValues = Partial<Record<CheckedField, string>>;

export function isCheckedField(name: string): name is CheckedField {
  return Object.hasOwn(CHECK_INPUTS, name);
}

export function isOptional(field: CheckedField): boolean {
  return OPTIONAL_FIELDS.includes(field);
}

export function isVisible(
  field: CheckedField,
  contactPreference: ProfileValues["contactPreference"],
): boolean {
  return field !== "phone" || contactPreference === "phone";
}

export function fieldsToCheck(values: ProfileValues): CheckedField[] {
  return (Object.keys(CHECK_INPUTS) as CheckedField[]).filter(
    (field) =>
      isVisible(field, values.contactPreference) &&
      !(isOptional(field) && isBlank(values[field])),
  );
}

export function checkValues(
  field: CheckedField,
  values: ProfileValues,
): CheckValues {
  const picked: CheckValues = {};
  for (const input of CHECK_INPUTS[field]) {
    if (isVisible(input, values.contactPreference) && !isBlank(values[input])) {
      picked[input] = values[input];
    }
  }
  return picked;
}

/** The only check done without Jev. */
export function isBlank(value: string): boolean {
  return value.trim() === "";
}

export function hasEmptyRequiredField(values: ProfileValues): boolean {
  return (Object.keys(CHECK_INPUTS) as CheckedField[]).some(
    (field) =>
      isVisible(field, values.contactPreference) &&
      !isOptional(field) &&
      isBlank(values[field]),
  );
}

export type CheckResult =
  | {
      status: "valid";
      /** A positive message, e.g. "Great" for the bio. */
      feedback?: string;
    }
  | { status: "invalid"; message: string }
  | { status: "unavailable" };

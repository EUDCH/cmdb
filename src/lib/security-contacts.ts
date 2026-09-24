/**
 * Pure aggregation + URL-encoding helpers for the /security-contacts page.
 *
 * Lives outside the Astro file so the route logic can be unit-tested
 * without an SSR server or a Postgres fixture. The route consumes
 * `aggregateSecurityContacts(rows)` and renders; everything else here
 * is intermediate.
 */

export const KNOWN_SECURITY_CONTACTS_SOURCES = ["vetted", "default"] as const;
export type SecurityContactsSource = (typeof KNOWN_SECURITY_CONTACTS_SOURCES)[number];

function isKnownSource(value: string): value is SecurityContactsSource {
  return (KNOWN_SECURITY_CONTACTS_SOURCES as readonly string[]).includes(value);
}

/**
 * Extract the `security_contacts` list from a service's metadata JSONB.
 * Trims each entry and drops anything that's empty after normalization
 * so whitespace-only strings can't inflate the count or render an empty
 * `mailto:` link.
 */
export function securityContactsOf(metadata: unknown): string[] {
  if (
    !metadata ||
    typeof metadata !== "object" ||
    !("security_contacts" in metadata) ||
    !Array.isArray((metadata as { security_contacts: unknown }).security_contacts)
  ) {
    return [];
  }
  return (metadata as { security_contacts: unknown[] }).security_contacts
    .filter((e): e is string => typeof e === "string")
    .map((e) => e.trim())
    .filter((e) => e.length > 0);
}

/**
 * Narrow `security_contacts_source` to the known vocabulary. Anything
 * else — typo, future value the UI doesn't know how to style yet,
 * non-string — collapses to `null` so the route can render a neutral
 * fallback instead of an unstyled CSS class.
 */
export function securityContactsSourceOf(metadata: unknown): SecurityContactsSource | null {
  if (!metadata || typeof metadata !== "object" || !("security_contacts_source" in metadata)) {
    return null;
  }
  const raw = (metadata as { security_contacts_source: unknown }).security_contacts_source;
  if (typeof raw !== "string") return null;
  return isKnownSource(raw) ? raw : null;
}

/**
 * Percent-encode an address for use inside a `mailto:` URI per RFC 6068.
 * `encodeURIComponent` is the conservative choice — it encodes the full
 * reserved set (including `?`, `&`, `=`, `#`, space, and `@` as `%40`,
 * which mail clients decode back to `@`). Centralizing the rule means
 * the to / cc / bcc paths can't drift apart.
 */
export function encodeMailtoAddress(email: string): string {
  return encodeURIComponent(email);
}

export function mailtoForAddress(email: string): string {
  return `mailto:${encodeMailtoAddress(email)}`;
}

/**
 * Build a BCC-only mailto for fanning out to every address at once.
 * Addresses are percent-encoded individually and joined by a literal
 * comma per RFC 6068 §3 (commas separate addresses in a `mailbox-list`
 * and stay unencoded).
 */
export function mailtoForBcc(emails: readonly string[]): string | null {
  if (emails.length === 0) return null;
  return `mailto:?bcc=${emails.map(encodeMailtoAddress).join(",")}`;
}

export type ServiceWithContacts = {
  name: string;
  source: SecurityContactsSource | null;
  contacts: string[];
};

export type AggregatedSecurityContacts = {
  withContacts: ServiceWithContacts[];
  flatUnique: string[];
  mailtoAll: string | null;
};

export function aggregateSecurityContacts(
  services: readonly { name: string; metadata: unknown }[],
): AggregatedSecurityContacts {
  const withContacts: ServiceWithContacts[] = services
    .map((s) => ({
      name: s.name,
      source: securityContactsSourceOf(s.metadata),
      contacts: securityContactsOf(s.metadata),
    }))
    .filter((s) => s.contacts.length > 0);
  const flatUnique = [...new Set(withContacts.flatMap((s) => s.contacts))].sort();
  return {
    withContacts,
    flatUnique,
    mailtoAll: mailtoForBcc(flatUnique),
  };
}

/** Quotes a trusted, repository-configured SQLite identifier. */
export function quoteSqliteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

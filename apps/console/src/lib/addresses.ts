/**
 * Recipient lists get pasted from spreadsheets, CSVs and chat messages, so
 * accept newline, comma and semicolon separators and drop duplicates — sending
 * the same person a message twice costs credits and looks broken.
 */
export function parseAddresses(raw: string) {
  return Array.from(
    new Set(
      raw
        .split(/[\n,;]+/)
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );
}

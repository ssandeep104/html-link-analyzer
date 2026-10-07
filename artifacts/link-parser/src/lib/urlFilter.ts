/** URL predicate filter for link results: match the whole href with an operator. */

export type UrlFilterOp = "contains" | "startsWith" | "endsWith" | "equals" | "notEquals";

export const URL_FILTER_OPS: { value: UrlFilterOp; label: string }[] = [
  { value: "contains", label: "Contains" },
  { value: "startsWith", label: "Starts with" },
  { value: "endsWith", label: "Ends with" },
  { value: "equals", label: "Equals" },
  { value: "notEquals", label: "Not equals" },
];

/**
 * Test one href against the URL filter. Case-insensitive; an empty value
 * matches everything so the filter is inert until the user types.
 */
export function matchesUrlFilter(href: string, op: UrlFilterOp, value: string): boolean {
  const v = value.trim().toLowerCase();
  if (!v) return true;
  const h = (href ?? "").toLowerCase();
  switch (op) {
    case "contains":
      return h.includes(v);
    case "startsWith":
      return h.startsWith(v);
    case "endsWith":
      return h.endsWith(v);
    case "equals":
      return h === v;
    case "notEquals":
      return h !== v;
  }
}

/** 0x1234567890abcdef... -> 0x1234...cdef */
export function shortAddress(address) {
  if (!address) return "";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function formatDate(date) {
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

export function formatDateTime(date) {
  return date.toLocaleString("en-GB", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function formatPercent(value) {
  if (value === 0) return "0%";
  if (value < 0.01) return "<0.01%";
  return `${Number(value.toFixed(2))}%`;
}

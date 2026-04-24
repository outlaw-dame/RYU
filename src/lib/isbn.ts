export function cleanIsbn(value: string) {
  return value.replace(/[^0-9Xx]/g, "").toUpperCase();
}

export function isValidIsbn10(value: string) {
  const isbn = cleanIsbn(value);
  if (!/^\d{9}[\dX]$/.test(isbn)) return false;
  const sum = isbn.split("").reduce((acc, char, index) => acc + (char === "X" ? 10 : Number(char)) * (10 - index), 0);
  return sum % 11 === 0;
}

export function isValidIsbn13(value: string) {
  const isbn = cleanIsbn(value);
  if (!/^\d{13}$/.test(isbn)) return false;
  const sum = isbn.slice(0, 12).split("").reduce((acc, char, index) => acc + Number(char) * (index % 2 === 0 ? 1 : 3), 0);
  const check = (10 - (sum % 10)) % 10;
  return check === Number(isbn[12]);
}

export function isValidIsbn(value: string) {
  const isbn = cleanIsbn(value);
  return isbn.length === 10 ? isValidIsbn10(isbn) : isbn.length === 13 ? isValidIsbn13(isbn) : false;
}

export function extractIsbns(text: string) {
  const matches = text.match(/(?:97[89][-\s]?)?\d[-\s]?\d{2,5}[-\s]?\d{2,7}[-\s]?[\dXx]/g) ?? [];
  return [...new Set(matches.map(cleanIsbn).filter(isValidIsbn))];
}

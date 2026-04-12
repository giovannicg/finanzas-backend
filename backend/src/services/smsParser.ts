export interface ParsedTransaction {
  amount: number;
  merchant: string;
  cardLast4: string | null;
  date: Date;
  rawText: string;
}

// Patterns for different Mexican/Latin American bank SMS formats
const AMOUNT_PATTERNS = [
  /\$\s?([\d,]+\.?\d{0,2})/,           // $1,234.56 or $1234.56
  /\$\s?([\d.]+,?\d{0,2})/,            // $1.234,56 (European format)
  /MXN\s?([\d,]+\.?\d{0,2})/i,
  /importe[:\s]+\$?([\d,]+\.?\d{0,2})/i,
  /monto[:\s]+\$?([\d,]+\.?\d{0,2})/i,
  /cargo[:\s]+\$?([\d,]+\.?\d{0,2})/i,
];

const CARD_LAST4_PATTERNS = [
  /tarjeta[:\s]*[*x]+(\d{3,4})/i,
  /card[:\s]*[*x]+(\d{3,4})/i,
  /\*{2,}(\d{3,4})/,
  /terminaci[oó]n[:\s]*(\d{3,4})/i,
  /term[.\s]*(\d{3,4})/i,
];

const MERCHANT_PATTERNS = [
  /en\s+([A-Z][A-Z\s\.\*&'-]{2,40}?)(?:\s+por|\s+monto|\s+importe|\s*\$|\s*MXN|\s*el\s+\d)/i,
  /comercio[:\s]+([A-Z][A-Z\s\.\*&'-]{2,40})/i,
  /establecimiento[:\s]+([A-Z][A-Z\s\.\*&'-]{2,40})/i,
  /compra\s+en\s+([A-Z][A-Z\s\.\*&'-]{2,40})/i,
];

const MONTH_MAP: Record<string, number> = {
  enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
  julio: 6, agosto: 7, septiembre: 8, octubre: 9, noviembre: 10, diciembre: 11,
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

function parseAmount(text: string): number | null {
  for (const pattern of AMOUNT_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      let raw = match[1];
      // If comma is followed by 1–2 digits at the end, it's a decimal separator (e.g. 14,50)
      // Otherwise it's a thousands separator (e.g. 1,234.56)
      if (/,\d{1,2}$/.test(raw)) {
        raw = raw.replace(/\./g, '').replace(',', '.');
      } else {
        raw = raw.replace(/,/g, '');
      }
      const value = parseFloat(raw);
      if (!isNaN(value) && value > 0) return value;
    }
  }
  return null;
}

function parseCardLast4(text: string): string | null {
  for (const pattern of CARD_LAST4_PATTERNS) {
    const match = text.match(pattern);
    if (match) return match[1];
  }
  return null;
}

function parseMerchant(text: string): string {
  for (const pattern of MERCHANT_PATTERNS) {
    const match = text.match(pattern);
    if (match) return match[1].trim();
  }

  // Fallback: grab anything that looks like a merchant name (all-caps words)
  const capsMatch = text.match(/\b([A-Z]{2,}(?:\s+[A-Z]{2,})*)\b/);
  if (capsMatch) return capsMatch[1];

  return 'Desconocido';
}

function parseDate(text: string): Date {
  // Try DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = text.match(/(\d{2})[\/\-](\d{2})[\/\-](\d{4})/);
  if (dmyMatch) {
    const [, day, month, year] = dmyMatch;
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  }

  // Try YYYY-MM-DD
  const isoMatch = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  }

  // Try "15 de marzo 2024"
  const spanishMatch = text.match(/(\d{1,2})\s+de\s+(\w+)\s+(\d{4})/i);
  if (spanishMatch) {
    const [, day, monthStr, year] = spanishMatch;
    const monthIndex = MONTH_MAP[monthStr.toLowerCase()];
    if (monthIndex !== undefined) {
      return new Date(parseInt(year), monthIndex, parseInt(day));
    }
  }

  return new Date();
}

export function parseSMS(text: string): ParsedTransaction | null {
  const normalized = text.trim();

  const amount = parseAmount(normalized);
  if (!amount) return null;

  return {
    amount,
    merchant: parseMerchant(normalized),
    cardLast4: parseCardLast4(normalized),
    date: parseDate(normalized),
    rawText: normalized,
  };
}

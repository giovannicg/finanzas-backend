/**
 * Extracts the SMS text from a SendGrid Inbound Parse webhook payload.
 * SendGrid sends multipart/form-data with fields: from, to, subject, text, html, etc.
 */
export interface InboundEmail {
  from: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export function extractSMSText(email: InboundEmail): string {
  // The SMS forwarded via email will typically be in the plain text body.
  // Different email clients may include quoted text or signatures — we only
  // want the first meaningful chunk before any "----" separator or "Forwarded" line.
  const text = email.text || '';

  // Strip common email forwarding headers
  const lines = text.split('\n');
  const cleaned: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Stop at typical forwarding/quoting markers
    if (
      trimmed.startsWith('----') ||
      trimmed.startsWith('From:') ||
      trimmed.startsWith('De:') ||
      trimmed.startsWith('>') ||
      /^(Begin forwarded|---------- Forwarded)/i.test(trimmed)
    ) {
      break;
    }

    cleaned.push(trimmed);
  }

  return cleaned.join('\n').trim();
}

/**
 * Extracts the user's inbox email address from the "To" field.
 * SendGrid's Inbound Parse sets the envelope "to" field.
 */
export function extractInboxEmail(rawTo: string): string {
  // Handle formats like "John Doe <user@domain.com>" or just "user@domain.com"
  const match = rawTo.match(/<([^>]+)>/) || rawTo.match(/([^\s,]+@[^\s,]+)/);
  return match ? match[1].toLowerCase().trim() : rawTo.toLowerCase().trim();
}

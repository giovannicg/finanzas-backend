interface NotionTransaction {
  amount: number;
  merchant: string;
  category: string;
  cardLast4: string | null;
  date: Date;
  rawText: string;
}

export async function syncToNotion(tx: NotionTransaction): Promise<void> {
  const token = process.env.NOTION_TOKEN;
  const dbId = process.env.NOTION_DATABASE_ID;

  if (!token || !dbId) return; // Notion sync is optional

  try {
    await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        parent: { database_id: dbId },
        properties: {
          'Comercio': { title: [{ text: { content: tx.merchant } }] },
          'Monto':    { number: tx.amount },
          'Categoría':{ select: { name: tx.category } },
          'Tarjeta':  { rich_text: [{ text: { content: tx.cardLast4 ?? '' } }] },
          'Fecha':    { date: { start: tx.date.toISOString().split('T')[0] } },
          'SMS':      { rich_text: [{ text: { content: tx.rawText } }] },
        },
      }),
    });
  } catch (e) {
    console.error('[notion] Error sincronizando:', e);
  }
}

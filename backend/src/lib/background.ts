import { waitUntil } from '@vercel/functions';

// Tareas que no bloquean la respuesta (logs, alertas, Notion).
// En Vercel, waitUntil mantiene viva la función hasta que terminen; en local no hace nada extra.
export function background(task: Promise<unknown>): void {
  waitUntil(task.catch((e) => console.error('[background] Error:', e)));
}

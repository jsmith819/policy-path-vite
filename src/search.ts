// src/search.ts
import type { DocumentMeta } from './types';
import { fetchDocumentHtml } from './api';

// You can add more docs here over time.
export const documents: DocumentMeta[] = [
  {
    title: '1. The Individual - Commitment Statement',
    segment: '1. The Individual',
    policy: 'Commitment Statement',
    filename: '1_the_individual_tokenised.html',
    content: ''
  }
];

// Convert HTML → plain text for indexing
function toPlainText(html: string): string {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
  } catch {
    // Fallback if DOMParser isn’t available
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}

export async function indexDocuments() {
  for (const d of documents) {
    try {
      // IMPORTANT: go through the Netlify Function
      const html = await fetchDocumentHtml(d.filename);
      d.content = toPlainText(html).toLowerCase();
    } catch (err) {
      console.warn('[SearchIndex] failed to index', d.filename, err);
      d.content = '';
    }
  }
}

export function search(query: string): DocumentMeta[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const terms = q.split(/\s+/);

  return documents
    .map(d => {
      const hay = (d.title + ' ' + d.content).toLowerCase();
      const score = terms.reduce((s, t) => s + (hay.includes(t) ? 1 : 0), 0);
      return { d, score };
    })
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(r => r.d);
}

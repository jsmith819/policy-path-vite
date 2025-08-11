import type { DocumentMeta } from './types';
export const documents: DocumentMeta[] = [
  { title: '1. The Individual - Commitment Statement', segment: '1. The Individual', policy: 'Commitment Statement', filename: '1_the_individual_tokenised.html', content: '' }
];
export async function indexDocuments() {
  for (const doc of documents) {
    try {
      const res = await fetch(doc.filename);
      if (!res.ok) throw new Error(`Failed to load ${doc.filename}`);
      doc.content = (await res.text()).replace(/<\/?[^>]+(>|$)/g, '').toLowerCase();
    } catch (e) { /* ignore */ }
  }
}
export function search(query: string): DocumentMeta[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];
  return documents.filter(doc => doc.title.toLowerCase().includes(q) || (doc.content && doc.content.includes(q)));
}

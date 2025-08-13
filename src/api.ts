import { slugify } from './slugify';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/.netlify/functions';

export async function fetchDocumentHtml(filename: string): Promise<string> {
  const url = `${API_BASE_URL}/get-document?file=${encodeURIComponent(filename)}`;
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`get-document ${res.status}: ${text}`);
  }
  return res.text();
}

export function filenameFor(segment: string, policy: string): string {
  if (segment === '1. The Individual' && policy === 'Commitment Statement') {
    return '1_the_individual_tokenised.html';
  }
  return `${slugify(segment)}_${slugify(policy)}.html`;
}
// Optional: bump this so you can see if the build that’s running is new
console.log('[PolicyPath] BUILD TAG:', '2025‑08‑13‑10:55');

import { slugify } from './slugify';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/.netlify/functions';

export async function fetchDocumentHtml(filename: string): Promise<string> {
  const url = `${API_BASE_URL}/get-document?file=${encodeURIComponent(filename)}`;
  console.log('[PolicyPath] fetching document via function:', url);
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

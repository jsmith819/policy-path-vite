import { slugify } from './slugify';

const API_BASE_URL    = import.meta.env.VITE_API_BASE_URL || 'https://policypath-backend.onrender.com';
const BASIC_AUTH_USER = import.meta.env.VITE_BASIC_AUTH_USER || 'nick';
const BASIC_AUTH_PASS = import.meta.env.VITE_BASIC_AUTH_PASS || 'supersecret123';

console.log('[PolicyPath] API_BASE_URL =', API_BASE_URL);

const authHeader = () => ({ 'Authorization': 'Basic ' + btoa(`${BASIC_AUTH_USER}:${BASIC_AUTH_PASS}`) });

export async function fetchSignedUrl(filename: string): Promise<string> {
  const url = `${API_BASE_URL}/get-signed-url?file=${encodeURIComponent(filename)}`;
  console.log('[PolicyPath] fetching signed URL:', url);
  const res = await fetch(url, { headers: authHeader() });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Signed URL ${res.status}: ${text}`);
  }
  const data = await res.json();
  const presigned =
    data.url || data.signedUrl || data.presignedUrl || data.signed_url || data.preSignedUrl;
  if (!presigned) throw new Error('No URL returned from backend');
  return presigned;
}

export async function fetchDocumentHtml(filename: string): Promise<string> {
  const s3 = await fetchSignedUrl(filename);
  const res = await fetch(s3);
  if (!res.ok) throw new Error(`S3 ${res.status}: ${res.statusText}`);
  return res.text();
}

export function filenameFor(segment: string, policy: string): string {
  if (segment === '1. The Individual' && policy === 'Commitment Statement') {
    return '1_the_individual_tokenised.html';
  }
  return `${slugify(segment)}_${slugify(policy)}.html`;
}

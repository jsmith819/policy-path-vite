export const slugify = (s: string) => s
  .toLowerCase()
  .replace(/\./g, '')
  .replace(/&/g, 'and')
  .replace(/[’']/g, '')
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '');

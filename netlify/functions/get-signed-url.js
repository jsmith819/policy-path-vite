// CommonJS style
exports.handler = async (event) => {
  const file = (event.queryStringParameters?.file || '').toString().trim();
  if (!file) return { statusCode: 400, body: 'Missing file' };

  const url = `${process.env.BACKEND_URL}/get-signed-url?file=${encodeURIComponent(file)}`;

  const auth = Buffer
    .from(`${process.env.BASIC_AUTH_USER}:${process.env.BASIC_AUTH_PASS}`)
    .toString('base64');

  const res = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });
  const text = await res.text();

  return {
    statusCode: res.status,
    headers: { 'content-type': 'application/json' },
    body: text
  };
};

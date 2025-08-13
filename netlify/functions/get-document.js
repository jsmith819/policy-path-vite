// netlify/functions/get-document.js
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');

const s3 = new S3Client({
  region: process.env.S3_REGION || process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const SAFE_KEY = /^[a-z0-9._/-]+$/i;

function streamToString(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (c) => chunks.push(Buffer.from(c)));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
  });
}

exports.handler = async (event) => {
  const file = (event.queryStringParameters?.file || '').toString().trim();
  if (!file || !SAFE_KEY.test(file)) {
    return { statusCode: 400, body: 'Bad file parameter' };
  }
  try {
    const res = await s3.send(new GetObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: file,
    }));
    const html = await streamToString(res.Body);
    return {
      statusCode: 200,
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
      body: html,
    };
  } catch (e) {
    return { statusCode: 500, body: String(e) };
  }
};

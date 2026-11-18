const fs = require('fs');
const path = require('path');
const { UPLOADS_DIR } = require('../config.cjs');

function detectImageExtension(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
  if (
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
    buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a
  ) return 'png';
  if (
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) return 'webp';
  if (
    buffer.subarray(0, 6).toString('ascii') === 'GIF87a' ||
    buffer.subarray(0, 6).toString('ascii') === 'GIF89a'
  ) return 'gif';
  return null;
}

function saveUploadedPhoto(code, base64Data) {
  if (!base64Data || typeof base64Data !== 'string' || !base64Data.startsWith('data:image/')) {
    return null;
  }
  const matches = base64Data.match(/^data:image\/[a-zA-Z0-9.+]+;base64,(.+)$/);
  if (!matches || matches.length < 2) {
    throw new Error('รูปแบบไฟล์ภาพ Base64 ไม่ถูกต้อง');
  }

  const buffer = Buffer.from(matches[1], 'base64');
  if (buffer.length > 5 * 1024 * 1024) {
    throw new Error('ขนาดไฟล์รูปภาพเกินกำหนด 5MB');
  }

  const ext = detectImageExtension(buffer);
  if (!ext) {
    throw new Error('ไฟล์รูปภาพไม่ถูกต้อง (รองรับเฉพาะ JPG, PNG, WebP, GIF)');
  }

  const safeCode = String(code || 'prop').replace(/[^a-zA-Z0-9_-]/g, '');
  const filename = `prop_${safeCode}_${Date.now()}.${ext}`;
  const uploadsRoot = path.resolve(UPLOADS_DIR);
  const diskPath = path.resolve(uploadsRoot, filename);

  if (!diskPath.startsWith(uploadsRoot + path.sep)) {
    throw new Error('Path traversal attempt in image upload');
  }

  fs.writeFileSync(diskPath, buffer);
  return `uploads/${filename}`;
}

module.exports = {
  detectImageExtension,
  saveUploadedPhoto
};

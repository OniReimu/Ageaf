import fs from 'node:fs';
import path from 'node:path';

export type TextAttachmentEntry = {
  id?: string;
  path?: string;
  name?: string;
  ext?: string;
  content?: string;
  sizeBytes?: number;
  lineCount?: number;
};

export type TextAttachmentMeta = {
  id: string;
  path?: string;
  name: string;
  ext: string;
  sizeBytes: number;
  lineCount: number;
  mime: string;
  content?: string;
};

export type AttachmentLimits = {
  maxFiles: number;
  maxFileBytes: number;
  maxTotalBytes: number;
};

const DEFAULT_LIMITS: AttachmentLimits = {
  maxFiles: 10,
  maxFileBytes: 512 * 1024,
  maxTotalBytes: 1024 * 1024,
};

const EXT_LANGUAGE: Record<string, string> = {
  '.txt': 'text',
  '.md': 'markdown',
  '.json': 'json',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.csv': 'csv',
  '.xml': 'xml',
  '.toml': 'toml',
  '.ini': 'ini',
  '.log': 'text',
  '.tex': 'tex',
};

const EXT_MIME: Record<string, string> = {
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.json': 'application/json',
  '.yaml': 'text/yaml',
  '.yml': 'text/yaml',
  '.csv': 'text/csv',
  '.xml': 'application/xml',
  '.toml': 'text/toml',
  '.ini': 'text/plain',
  '.log': 'text/plain',
  '.tex': 'text/plain',
};

export const ALLOWED_TEXT_EXTENSIONS = Object.keys(EXT_LANGUAGE);

export function getAttachmentLimits(
  input?: Partial<AttachmentLimits>
): AttachmentLimits {
  return {
    maxFiles:
      typeof input?.maxFiles === 'number' && input.maxFiles > 0
        ? input.maxFiles
        : DEFAULT_LIMITS.maxFiles,
    maxFileBytes:
      typeof input?.maxFileBytes === 'number' && input.maxFileBytes > 0
        ? input.maxFileBytes
        : DEFAULT_LIMITS.maxFileBytes,
    maxTotalBytes:
      typeof input?.maxTotalBytes === 'number' && input.maxTotalBytes > 0
        ? input.maxTotalBytes
        : DEFAULT_LIMITS.maxTotalBytes,
  };
}

export function getLanguageForExtension(ext: string): string {
  return EXT_LANGUAGE[ext] ?? 'text';
}

function normalizeExtension(value: string | undefined): string {
  if (!value) return '';
  const normalized = value.startsWith('.') ? value : `.${value}`;
  return normalized.toLowerCase();
}

function getExtensionFromName(name: string): string {
  return normalizeExtension(path.extname(name));
}

function getMimeForExtension(ext: string): string {
  return EXT_MIME[ext] ?? 'text/plain';
}

function isAllowedExtension(ext: string): boolean {
  return ALLOWED_TEXT_EXTENSIONS.includes(ext);
}

function isProbablyBinary(buffer: Buffer): boolean {
  if (buffer.length === 0) return false;
  let suspicious = 0;
  for (const byte of buffer) {
    if (byte === 0) return true;
    if (byte < 9 || (byte > 13 && byte < 32)) {
      suspicious += 1;
    }
  }
  return suspicious / buffer.length > 0.2;
}

function isProbablyBinaryText(text: string): boolean {
  let suspicious = 0;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code === 0) return true;
    if (code < 9 || (code > 13 && code < 32)) {
      suspicious += 1;
    }
  }
  return text.length > 0 && suspicious / text.length > 0.2;
}

function countLinesFromText(text: string): number {
  if (!text) return 1;
  return text.split(/\r\n|\r|\n/).length;
}

async function readSample(pathname: string, size = 8192): Promise<Buffer> {
  const handle = await fs.promises.open(pathname, 'r');
  try {
    const buffer = Buffer.alloc(size);
    const { bytesRead } = await handle.read(buffer, 0, size, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

async function countLinesInFile(pathname: string): Promise<number> {
  return new Promise((resolve, reject) => {
    let lineCount = 0;
    let totalBytes = 0;
    let lastByte: number | null = null;
    const stream = fs.createReadStream(pathname);
    stream.on('data', (chunk) => {
      const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
      totalBytes += buffer.length;
      for (const byte of buffer) {
        if (byte === 10) lineCount += 1;
      }
      lastByte = buffer[buffer.length - 1] ?? lastByte;
    });
    stream.on('error', (error) => reject(error));
    stream.on('end', () => {
      if (totalBytes === 0) {
        resolve(1);
        return;
      }
      const endsWithNewline = lastByte === 10;
      resolve(lineCount + (endsWithNewline ? 0 : 1));
    });
  });
}

function makeAttachmentId(): string {
  return `att-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export async function validateAttachmentEntries(
  entries: TextAttachmentEntry[],
  limits: AttachmentLimits
): Promise<{ attachments: TextAttachmentMeta[]; errors: Array<{ id?: string; path?: string; message: string }> }> {
  const attachments: TextAttachmentMeta[] = [];
  const errors: Array<{ id?: string; path?: string; message: string }> = [];
  let totalBytes = 0;

  for (const entry of entries) {
    if (attachments.length >= limits.maxFiles) {
      errors.push({
        id: entry.id,
        path: entry.path,
        message: `Too many attachments (max ${limits.maxFiles}).`,
      });
      continue;
    }

    const name =
      entry.name ??
      (entry.path ? path.basename(entry.path) : '') ??
      'attachment';
    const ext = normalizeExtension(entry.ext) || getExtensionFromName(name);
    if (!ext || !isAllowedExtension(ext)) {
      errors.push({
        id: entry.id,
        path: entry.path,
        message: `Unsupported file type (${ext || 'unknown'}).`,
      });
      continue;
    }

    if (entry.path) {
      try {
        const stat = await fs.promises.stat(entry.path);
        if (!stat.isFile()) {
          errors.push({
            id: entry.id,
            path: entry.path,
            message: 'Not a file.',
          });
          continue;
        }
        const sizeBytes = stat.size;
        if (sizeBytes > limits.maxFileBytes) {
          errors.push({
            id: entry.id,
            path: entry.path,
            message: `File exceeds ${limits.maxFileBytes} bytes.`,
          });
          continue;
        }
        if (totalBytes + sizeBytes > limits.maxTotalBytes) {
          errors.push({
            id: entry.id,
            path: entry.path,
            message: `Total attachments exceed ${limits.maxTotalBytes} bytes.`,
          });
          continue;
        }
        const sample = await readSample(entry.path);
        if (isProbablyBinary(sample)) {
          errors.push({
            id: entry.id,
            path: entry.path,
            message: 'File appears to be binary.',
          });
          continue;
        }
        const lineCount = await countLinesInFile(entry.path);
        totalBytes += sizeBytes;
        attachments.push({
          id: entry.id ?? makeAttachmentId(),
          path: entry.path,
          name,
          ext,
          sizeBytes,
          lineCount,
          mime: getMimeForExtension(ext),
        });
      } catch (error) {
        errors.push({
          id: entry.id,
          path: entry.path,
          message: error instanceof Error ? error.message : 'Failed to read file.',
        });
      }
      continue;
    }

    if (typeof entry.content === 'string') {
      const sizeBytes = Buffer.byteLength(entry.content, 'utf8');
      if (sizeBytes > limits.maxFileBytes) {
        errors.push({
          id: entry.id,
          path: entry.path,
          message: `File exceeds ${limits.maxFileBytes} bytes.`,
        });
        continue;
      }
      if (totalBytes + sizeBytes > limits.maxTotalBytes) {
        errors.push({
          id: entry.id,
          path: entry.path,
          message: `Total attachments exceed ${limits.maxTotalBytes} bytes.`,
        });
        continue;
      }
      if (isProbablyBinaryText(entry.content)) {
        errors.push({
          id: entry.id,
          path: entry.path,
          message: 'File appears to be binary.',
        });
        continue;
      }
      const lineCount =
        typeof entry.lineCount === 'number' && entry.lineCount > 0
          ? entry.lineCount
          : countLinesFromText(entry.content);
      totalBytes += sizeBytes;
      attachments.push({
        id: entry.id ?? makeAttachmentId(),
        name,
        ext,
        sizeBytes,
        lineCount,
        mime: getMimeForExtension(ext),
        content: entry.content,
      });
      continue;
    }

    errors.push({
      id: entry.id,
      path: entry.path,
      message: 'Missing attachment data.',
    });
  }

  return { attachments, errors };
}

async function readAttachmentContent(
  entry: TextAttachmentEntry,
  limits: AttachmentLimits
): Promise<{ content: string; omittedBytes: number; sizeBytes: number }> {
  if (typeof entry.content === 'string') {
    const buffer = Buffer.from(entry.content, 'utf8');
    if (buffer.length <= limits.maxFileBytes) {
      return { content: entry.content, omittedBytes: 0, sizeBytes: buffer.length };
    }
    const headBytes = Math.floor(limits.maxFileBytes * 0.6);
    const tailBytes = limits.maxFileBytes - headBytes;
    const omittedBytes = buffer.length - headBytes - tailBytes;
    const head = buffer.subarray(0, headBytes).toString('utf8');
    const tail = buffer.subarray(buffer.length - tailBytes).toString('utf8');
    const marker = `\n\n[... omitted ${omittedBytes} bytes ...]\n\n`;
    return {
      content: `${head}${marker}${tail}`,
      omittedBytes,
      sizeBytes: buffer.length,
    };
  }

  if (entry.path) {
    const stat = await fs.promises.stat(entry.path);
    if (stat.size <= limits.maxFileBytes) {
      const content = await fs.promises.readFile(entry.path, 'utf8');
      return { content, omittedBytes: 0, sizeBytes: stat.size };
    }
    const headBytes = Math.floor(limits.maxFileBytes * 0.6);
    const tailBytes = limits.maxFileBytes - headBytes;
    const omittedBytes = stat.size - headBytes - tailBytes;
    const handle = await fs.promises.open(entry.path, 'r');
    try {
      const headBuffer = Buffer.alloc(headBytes);
      const tailBuffer = Buffer.alloc(tailBytes);
      await handle.read(headBuffer, 0, headBytes, 0);
      await handle.read(tailBuffer, 0, tailBytes, stat.size - tailBytes);
      const head = headBuffer.toString('utf8');
      const tail = tailBuffer.toString('utf8');
      const marker = `\n\n[... omitted ${omittedBytes} bytes ...]\n\n`;
      return {
        content: `${head}${marker}${tail}`,
        omittedBytes,
        sizeBytes: stat.size,
      };
    } finally {
      await handle.close();
    }
  }

  return { content: '', omittedBytes: 0, sizeBytes: 0 };
}

export async function buildAttachmentBlock(
  entries: TextAttachmentEntry[],
  limits: AttachmentLimits
): Promise<{ block: string }> {
  if (!entries || entries.length === 0) return { block: '' };
  const { attachments } = await validateAttachmentEntries(entries, limits);
  if (attachments.length === 0) return { block: '' };

  const lines: string[] = ['[Attachments]'];
  let totalBytes = 0;

  for (const attachment of attachments) {
    if (totalBytes >= limits.maxTotalBytes) break;
    const { content } = await readAttachmentContent(attachment, limits);
    const language = getLanguageForExtension(attachment.ext);
    lines.push(`- name: ${attachment.name}`);
    if (attachment.path) {
      lines.push(`  path: ${attachment.path}`);
    }
    lines.push(`  lines: ${attachment.lineCount}`);
    lines.push(`  bytes: ${attachment.sizeBytes}`);
    lines.push(`  type: ${attachment.mime}`);
    lines.push('');
    lines.push(`\`\`\`${language}`);
    lines.push(content);
    lines.push('```');
    lines.push('');
    totalBytes += attachment.sizeBytes;
  }

  lines.push('[/Attachments]');

  return { block: lines.join('\n') };
}


import fs from 'node:fs';
import path from 'node:path';

export type DocumentAttachmentEntry = {
  id?: string;
  name: string;
  mediaType: string;
  data?: string; // base64 from drag-drop
  path?: string; // file path from picker
  size: number;
};

export type DocumentAttachmentMeta = {
  id: string;
  name: string;
  mediaType: string;
  size: number;
};

export type ResolvedDocument = {
  id: string;
  name: string;
  mediaType: string;
  base64: string;
  extractedText: string;
  size: number;
};

export const DOCUMENT_EXTENSIONS: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.docx':
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.pptx':
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.xlsx':
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

export const ALLOWED_DOCUMENT_EXTENSIONS = Object.keys(DOCUMENT_EXTENSIONS);

export const MAX_DOCUMENT_BYTES = 32 * 1024 * 1024;

export type DocumentLimits = {
  maxFiles: number;
  maxFileBytes: number;
  maxTotalBytes: number;
};

const DEFAULT_LIMITS: DocumentLimits = {
  maxFiles: 10,
  maxFileBytes: MAX_DOCUMENT_BYTES,
  maxTotalBytes: 100 * 1024 * 1024,
};

export function getDocumentLimits(
  input?: Partial<DocumentLimits>
): DocumentLimits {
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

function makeDocumentId(): string {
  return `doc-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeExtension(name: string): string {
  const ext = path.extname(name).toLowerCase();
  return ext;
}

function isAllowedDocumentExtension(ext: string): boolean {
  return ALLOWED_DOCUMENT_EXTENSIONS.includes(ext);
}

function getMimeForExtension(ext: string): string {
  return DOCUMENT_EXTENSIONS[ext] ?? 'application/octet-stream';
}

export async function validateDocumentEntries(
  entries: DocumentAttachmentEntry[],
  limits: DocumentLimits
): Promise<{
  documents: DocumentAttachmentMeta[];
  errors: Array<{ id?: string; path?: string; message: string }>;
}> {
  const documents: DocumentAttachmentMeta[] = [];
  const errors: Array<{ id?: string; path?: string; message: string }> = [];
  let totalBytes = 0;

  for (const entry of entries) {
    if (documents.length >= limits.maxFiles) {
      errors.push({
        id: entry.id,
        path: entry.path,
        message: `Too many document attachments (max ${limits.maxFiles}).`,
      });
      continue;
    }

    const ext = normalizeExtension(entry.name);
    if (!ext || !isAllowedDocumentExtension(ext)) {
      errors.push({
        id: entry.id,
        path: entry.path,
        message: `Unsupported document type (${ext || 'unknown'}). Supported: PDF, DOCX, PPTX, XLSX.`,
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
            message: `Document exceeds ${Math.round(limits.maxFileBytes / (1024 * 1024))} MB limit.`,
          });
          continue;
        }
        if (totalBytes + sizeBytes > limits.maxTotalBytes) {
          errors.push({
            id: entry.id,
            path: entry.path,
            message: `Total document attachments exceed ${Math.round(limits.maxTotalBytes / (1024 * 1024))} MB.`,
          });
          continue;
        }
        totalBytes += sizeBytes;
        documents.push({
          id: entry.id ?? makeDocumentId(),
          name: entry.name,
          mediaType: getMimeForExtension(ext),
          size: sizeBytes,
        });
      } catch (error) {
        errors.push({
          id: entry.id,
          path: entry.path,
          message:
            error instanceof Error ? error.message : 'Failed to read file.',
        });
      }
      continue;
    }

    // Drag-drop path: entry has data (base64) and size
    if (entry.data) {
      const sizeBytes = entry.size;
      if (sizeBytes > limits.maxFileBytes) {
        errors.push({
          id: entry.id,
          message: `Document exceeds ${Math.round(limits.maxFileBytes / (1024 * 1024))} MB limit.`,
        });
        continue;
      }
      if (totalBytes + sizeBytes > limits.maxTotalBytes) {
        errors.push({
          id: entry.id,
          message: `Total document attachments exceed ${Math.round(limits.maxTotalBytes / (1024 * 1024))} MB.`,
        });
        continue;
      }
      totalBytes += sizeBytes;
      documents.push({
        id: entry.id ?? makeDocumentId(),
        name: entry.name,
        mediaType: getMimeForExtension(ext),
        size: sizeBytes,
      });
      continue;
    }

    errors.push({
      id: entry.id,
      message: 'Missing document data or path.',
    });
  }

  return { documents, errors };
}

export async function resolveDocumentContent(
  entry: DocumentAttachmentEntry
): Promise<ResolvedDocument> {
  let buffer: Buffer;

  if (entry.path) {
    buffer = await fs.promises.readFile(entry.path);
  } else if (entry.data) {
    buffer = Buffer.from(entry.data, 'base64');
  } else {
    throw new Error(`Document ${entry.name}: no data or path provided.`);
  }

  const base64 = buffer.toString('base64');

  let extractedText = '';
  try {
    const { OfficeParser } = await import('officeparser');
    const ast = await OfficeParser.parseOffice(buffer);
    extractedText = ast.toText();
  } catch {
    extractedText = `[Could not extract text from ${entry.name}]`;
  }

  return {
    id: entry.id ?? makeDocumentId(),
    name: entry.name,
    mediaType: entry.mediaType,
    base64,
    extractedText,
    size: buffer.length,
  };
}

export async function buildDocumentAttachmentBlock(
  entries: DocumentAttachmentEntry[]
): Promise<{ block: string }> {
  if (!entries || entries.length === 0) return { block: '' };

  const lines: string[] = ['[Document Attachments]'];

  for (const entry of entries) {
    let resolved: ResolvedDocument;
    try {
      resolved = await resolveDocumentContent(entry);
    } catch {
      lines.push(`- name: ${entry.name}`);
      lines.push(`  error: Could not read document`);
      lines.push('');
      continue;
    }

    lines.push(`- name: ${resolved.name}`);
    if (entry.path) {
      lines.push(`  path: ${entry.path}`);
    }
    lines.push(`  bytes: ${resolved.size}`);
    lines.push(`  type: ${resolved.mediaType}`);
    lines.push('');
    if (resolved.extractedText.trim()) {
      lines.push('```');
      lines.push(resolved.extractedText);
      lines.push('```');
    } else {
      lines.push('[No text content extracted]');
    }
    lines.push('');
  }

  lines.push('[/Document Attachments]');

  return { block: lines.join('\n') };
}

import { execFile } from 'node:child_process';
import os from 'node:os';
import { promisify } from 'node:util';
import type { FastifyInstance } from 'fastify';

import {
  ALLOWED_TEXT_EXTENSIONS,
  getAttachmentLimits,
  validateAttachmentEntries,
  type TextAttachmentEntry,
} from '../attachments/textAttachments.js';
import {
  ALLOWED_DOCUMENT_EXTENSIONS,
  getDocumentLimits,
  validateDocumentEntries,
  type DocumentAttachmentEntry,
} from '../attachments/documentAttachments.js';

const execFileAsync = promisify(execFile);

async function openFileDialog(multiple: boolean): Promise<string[]> {
  if (os.platform() !== 'darwin') {
    throw new Error('File picker is only supported on macOS right now.');
  }

  const script = [
    'set picked to choose file' + (multiple ? ' with multiple selections allowed' : ''),
    'if class of picked is alias then set picked to {picked}',
    'set out to ""',
    'repeat with f in picked',
    'set out to out & POSIX path of f & "\\n"',
    'end repeat',
    'return out',
  ].join('\n');

  try {
    const { stdout } = await execFileAsync('osascript', ['-e', script], {
      maxBuffer: 1024 * 1024,
    });
    return stdout
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  } catch (error) {
    const messageParts: string[] = [];
    if (error instanceof Error) {
      messageParts.push(error.message);
    }
    const stderr = (error as { stderr?: unknown })?.stderr;
    if (typeof stderr === 'string') {
      messageParts.push(stderr);
    }
    const message = messageParts.join(' ').toLowerCase();
    if (message.includes('user canceled') || message.includes('user cancelled') || message.includes('canceled') || message.includes('cancelled')) {
      return [];
    }
    throw error;
  }
}

export function registerAttachments(server: FastifyInstance) {
  server.post('/v1/attachments/open', async (request, reply) => {
    const body = request.body as
      | { multiple?: unknown; extensions?: unknown }
      | undefined;
    const multiple = body?.multiple === true;
    const extensions = Array.isArray(body?.extensions)
      ? body?.extensions.filter((entry) => typeof entry === 'string')
      : [...ALLOWED_TEXT_EXTENSIONS, ...ALLOWED_DOCUMENT_EXTENSIONS];
    const normalized = new Set(
      extensions.map((entry) =>
        entry.startsWith('.') ? entry.toLowerCase() : `.${entry.toLowerCase()}`
      )
    );

    try {
      const paths = await openFileDialog(multiple);
      const filtered = paths.filter((pathname) => {
        const dot = pathname.lastIndexOf('.');
        if (dot === -1) return false;
        const ext = pathname.slice(dot).toLowerCase();
        return normalized.has(ext);
      });
      reply.send({ paths: filtered });
    } catch (error) {
      reply.status(500).send({
        error: 'open_failed',
        message: error instanceof Error ? error.message : 'Failed to open file dialog',
      });
    }
  });

  server.post('/v1/attachments/validate', async (request, reply) => {
    const body = request.body as
      | {
          entries?: TextAttachmentEntry[];
          paths?: string[];
          limits?: { maxFiles?: number; maxFileBytes?: number; maxTotalBytes?: number };
        }
      | undefined;
    const entries =
      body?.entries ??
      (Array.isArray(body?.paths)
        ? body?.paths
            .filter((entry) => typeof entry === 'string')
            .map((path) => ({ path }))
        : []);

    const limits = getAttachmentLimits(body?.limits);
    const { attachments, errors } = await validateAttachmentEntries(entries, limits);
    reply.send({ attachments, errors });
  });

  server.post('/v1/attachments/validate-documents', async (request, reply) => {
    const body = request.body as
      | {
          entries?: DocumentAttachmentEntry[];
          limits?: { maxFiles?: number; maxFileBytes?: number; maxTotalBytes?: number };
        }
      | undefined;
    const entries = Array.isArray(body?.entries) ? body.entries : [];
    const limits = getDocumentLimits(body?.limits);
    const { documents, errors } = await validateDocumentEntries(entries, limits);
    reply.send({ documents, errors });
  });
}


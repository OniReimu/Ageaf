import type { JobEvent } from '../../types.js';
import { extractAgeafPatchFence } from '../../patch/ageafPatchFence.js';
import {
  computePerHunkReplacements,
  extractOverleafFilesFromMessage,
  findOverleafFileContent,
} from '../../patch/fileUpdate.js';

type EmitEvent = (event: JobEvent) => void;

type ExtractedOverleafFile = {
  filePath: string;
  content: string;
};

export class PiStreamBuffer {
  private emitEvent: EmitEvent;
  private overleafFiles: ExtractedOverleafFile[];
  private visibleBuffer = '';
  private payloadStarted = false;
  private payloadBuffer = '';
  private insideDiagramFence = false;
  private diagramBuffer = '';
  private emittedPatchFiles = new Set<string>();
  private emittedFileStarted = new Set<string>();

  private readonly HOLD_BACK_CHARS = 32;
  private readonly MAX_DIAGRAM_CHARS = 350_000;
  private readonly payloadStartRe =
    /```(?:ageaf[-_]?patch)|<<<\s*AGEAF_REWRITE\s*>>>|<<<\s*AGEAF_FILE_UPDATE\b/i;
  private readonly fileUpdateOpenRe =
    /<<<\s*AGEAF_FILE_UPDATE\s+path="([^"]+)"\s*>>>/gi;
  private readonly diagramOpenRe = /```ageaf-diagram[^\n]*\n/i;

  constructor(emitEvent: EmitEvent, overleafFiles: ExtractedOverleafFile[]) {
    this.emitEvent = emitEvent;
    this.overleafFiles = overleafFiles;
  }

  pushDelta(text: string): void {
    if (!text) return;
    this.emitVisibleDelta(text);
  }

  flush(): void {
    if (this.insideDiagramFence) {
      const closeIdx = this.findDiagramCloseIndex(this.diagramBuffer);
      if (closeIdx !== -1) {
        const afterBackticks = closeIdx + 3;
        const afterClose = this.diagramBuffer.slice(afterBackticks);
        const closingLineMatch = afterClose.match(/^[ \t]*\r?\n/);
        const closingLineLen = closingLineMatch ? closingLineMatch[0].length : 0;
        const fenceContent = this.diagramBuffer.slice(0, closeIdx);
        this.emitDiagramFence(fenceContent);
        const remaining = this.diagramBuffer.slice(afterBackticks + closingLineLen);
        this.insideDiagramFence = false;
        this.diagramBuffer = '';
        if (remaining) {
          this.emitVisibleDelta(remaining);
        }
      } else {
        this.emitDiagramFence(this.diagramBuffer);
        this.insideDiagramFence = false;
        this.diagramBuffer = '';
      }
    }
    if (this.payloadStarted) return;
    if (!this.visibleBuffer) return;
    this.emitEvent({ event: 'delta', data: { text: this.visibleBuffer } });
    this.visibleBuffer = '';
  }

  getEmittedPatchFiles(): Set<string> {
    return this.emittedPatchFiles;
  }

  private emitVisibleDelta(text: string): void {
    if (!text) return;

    if (this.payloadStarted) {
      this.payloadBuffer += text;
      this.extractAndEmitCompletedBlocks();
      return;
    }

    // Diagram fence accumulation mode
    if (this.insideDiagramFence) {
      this.diagramBuffer += text;
      const closeIdx = this.findDiagramCloseIndex(this.diagramBuffer);
      if (closeIdx !== -1) {
        const afterBackticks = closeIdx + 3;
        const afterClose = this.diagramBuffer.slice(afterBackticks);
        const closingLineMatch = afterClose.match(/^[ \t]*\r?\n/);
        const closingLineLen = closingLineMatch ? closingLineMatch[0].length : 0;
        const fenceContent = this.diagramBuffer.slice(0, closeIdx);
        this.emitDiagramFence(fenceContent);
        this.insideDiagramFence = false;
        const remaining = this.diagramBuffer.slice(afterBackticks + closingLineLen);
        this.diagramBuffer = '';
        if (remaining) {
          this.emitVisibleDelta(remaining);
        }
        return;
      }
      return;
    }

    this.visibleBuffer += text;

    // Check for diagram fence opening
    const diagMatch = this.visibleBuffer.match(this.diagramOpenRe);
    if (diagMatch && diagMatch.index !== undefined) {
      const before = this.visibleBuffer.slice(0, diagMatch.index);
      if (before) {
        this.emitEvent({ event: 'delta', data: { text: before } });
      }
      this.emitEvent({ event: 'delta', data: { text: '\n*Rendering diagram\u2026*\n' } });
      this.insideDiagramFence = true;
      this.diagramBuffer = this.visibleBuffer.slice(diagMatch.index + diagMatch[0].length);
      this.visibleBuffer = '';
      return;
    }

    // Check for payload start
    const matchIndex = this.visibleBuffer.search(this.payloadStartRe);
    if (matchIndex >= 0) {
      const beforePayload = this.visibleBuffer.slice(0, matchIndex);
      if (beforePayload) {
        this.emitEvent({ event: 'delta', data: { text: beforePayload } });
      }
      this.payloadStarted = true;
      this.payloadBuffer = this.visibleBuffer.slice(matchIndex);
      this.visibleBuffer = '';
      this.extractAndEmitCompletedBlocks();
      return;
    }

    // Hold-back buffer to avoid premature emission
    if (this.visibleBuffer.length > this.HOLD_BACK_CHARS) {
      const flush = this.visibleBuffer.slice(0, this.visibleBuffer.length - this.HOLD_BACK_CHARS);
      this.visibleBuffer = this.visibleBuffer.slice(-this.HOLD_BACK_CHARS);
      if (flush) {
        this.emitEvent({ event: 'delta', data: { text: flush } });
      }
    }
  }

  private extractAndEmitCompletedBlocks(): void {
    if (this.overleafFiles.length === 0) return;

    // Detect file update open markers for per-file progress events
    this.fileUpdateOpenRe.lastIndex = 0;
    let openMatch: RegExpExecArray | null;
    while ((openMatch = this.fileUpdateOpenRe.exec(this.payloadBuffer)) !== null) {
      const markerPath = openMatch[1]?.trim();
      if (!markerPath) continue;
      const originalFile = findOverleafFileContent(markerPath, this.overleafFiles);
      if (!originalFile) continue;
      const canonicalPath = originalFile.filePath;
      if (this.emittedFileStarted.has(canonicalPath)) continue;
      this.emittedFileStarted.add(canonicalPath);
      this.emitEvent({ event: 'file_started', data: { filePath: canonicalPath } });
    }

    const blockRe =
      /<<<\s*AGEAF_FILE_UPDATE\s+path="([^"]+)"\s*>>>\s*\n([\s\S]*?)\n<<<\s*AGEAF_FILE_UPDATE_END\s*>>>/gi;
    let match: RegExpExecArray | null;
    let lastMatchEnd = 0;

    while ((match = blockRe.exec(this.payloadBuffer)) !== null) {
      const markerPath = match[1]?.trim();
      const content = match[2] ?? '';
      lastMatchEnd = match.index + match[0].length;
      if (!markerPath) continue;

      const originalFile = findOverleafFileContent(markerPath, this.overleafFiles);
      if (!originalFile) continue;

      const canonicalPath = originalFile.filePath;
      const patches = computePerHunkReplacements(canonicalPath, originalFile.content, content);
      for (const patch of patches) {
        this.emitEvent({ event: 'patch', data: patch });
      }
      if (patches.length > 0) {
        this.emittedPatchFiles.add(canonicalPath);
      }
    }

    if (lastMatchEnd > 0) {
      this.payloadBuffer = this.payloadBuffer.slice(lastMatchEnd);
    }
  }

  private findDiagramCloseIndex(buffer: string): number {
    let cursor = 0;
    while (cursor < buffer.length) {
      const idx = buffer.indexOf('```', cursor);
      if (idx === -1) return -1;
      const next = buffer[idx + 3];
      if (
        next === undefined ||
        next === '\n' ||
        next === '\r' ||
        next === ' ' ||
        next === '\t'
      ) {
        return idx;
      }
      cursor = idx + 3;
    }
    return -1;
  }

  private emitDiagramFence(content: string): void {
    if (content.length > this.MAX_DIAGRAM_CHARS) {
      this.emitEvent({
        event: 'delta',
        data: {
          text: '\n*Diagram output too large to render safely. Showing text only.*\n',
        },
      });
      return;
    }
    const fence = '```ageaf-diagram\n' + content + '\n```\n';
    this.emitEvent({ event: 'delta', data: { text: fence } });
  }
}

// Re-export for convenience
export { extractOverleafFilesFromMessage } from '../../patch/fileUpdate.js';

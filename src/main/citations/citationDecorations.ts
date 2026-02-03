import { BibEntry, CitationUsage, DuplicateTitleInfo } from './types';

export type Cm6ExportsLite = {
  Decoration: any;
  EditorView: any;
  StateEffect: any;
  StateField: any;
  WidgetType: any;
};

export type CitationDecorations = {
  citationDecorationField: any;
  updateCitationDecorations: any;
  citationExtension: any;
};

function getDuplicateInfo(
  duplicateTitleMap: Map<string, DuplicateTitleInfo> | undefined,
  key: string
): DuplicateTitleInfo | null {
  if (!duplicateTitleMap || typeof duplicateTitleMap.get !== 'function') {
    return null;
  }
  return duplicateTitleMap.get(key) ?? null;
}

export function initCitationDecorations(cm6: Cm6ExportsLite): CitationDecorations {
  const { Decoration, EditorView, StateEffect, StateField, WidgetType } = cm6;

  class CitationUsageWidget extends WidgetType {
    constructor(
      private usage: CitationUsage,
      private dup: DuplicateTitleInfo | null
    ) {
      super();
    }

    toDOM(): HTMLElement {
      const wrap = document.createElement('span');

      const usageEl = document.createElement('span');
      usageEl.className = 'ageaf-citation-indicator';

      if (this.usage.isUsed) {
        usageEl.className += ' ageaf-citation-used';
        usageEl.textContent = ` \u2713 ${this.usage.totalUsages}`;
        usageEl.title = this.buildUsageTooltip();
      } else {
        usageEl.className += ' ageaf-citation-unused';
        usageEl.textContent = ' \u25CB';
        usageEl.title = 'Not cited in any .tex file';
      }
      wrap.appendChild(usageEl);

      if (this.dup && this.dup.duplicateKeys.length > 0) {
        const dupEl = document.createElement('span');
        dupEl.className = 'ageaf-citation-dup';
        dupEl.textContent = `dup ${this.dup.duplicateKeys.length + 1}`;
        dupEl.title = `Duplicate title with: ${this.dup.duplicateKeys.join(', ')}`;
        wrap.appendChild(dupEl);
      }

      return wrap;
    }

    private buildUsageTooltip(): string {
      const files = this.usage.usedInFiles.map((f) => {
        const lines = (f.lineNumbers ?? []).join(', ');
        return `${f.fileName} (${f.occurrences}\u00D7, lines: ${lines})`;
      });
      return `Used ${this.usage.totalUsages} time(s) in:\n${files.join('\n')}`;
    }
  }

  const updateCitationDecorations = StateEffect.define();

  const citationDecorationField = StateField.define({
    create() {
      return Decoration.none;
    },

    update(decorations: any, transaction: any) {
      decorations = decorations.map(transaction.changes);

      for (const effect of transaction.effects) {
        if (!effect.is(updateCitationDecorations)) continue;

        const { entries, usageMap, duplicateTitleMap } = effect.value ?? {};
        const widgets: any[] = [];

        for (const entry of entries) {
          const usage = usageMap.get(entry.key);
          if (!usage) continue;

          const dup = getDuplicateInfo(duplicateTitleMap, entry.key);
          const doc = transaction.state.doc;
          const safeLineNumber = Math.max(1, Math.min(entry.lineNumber, doc.lines));
          const line = doc.line(safeLineNumber);

          const widget = Decoration.widget({
            widget: new CitationUsageWidget(usage, dup),
            side: 1,
          }).range(line.to);

          widgets.push(widget);
        }

        decorations = Decoration.set(widgets, true);
      }

      return decorations;
    },

    provide: (field: any) => EditorView.decorations.from(field),
  });

  return {
    citationDecorationField,
    updateCitationDecorations,
    citationExtension: [citationDecorationField],
  };
}

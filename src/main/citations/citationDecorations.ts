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

export function initCitationDecorations(cm6: Cm6ExportsLite): CitationDecorations {
  const { Decoration, EditorView, StateEffect, StateField, WidgetType } = cm6;

  // Widget for usage indicator
  class CitationUsageWidget extends WidgetType {
    constructor(
      private usage: CitationUsage,
      private entry: BibEntry,
      private dup: DuplicateTitleInfo | null
    ) {
      super();
    }

    toDOM() {
      const wrap = document.createElement('span');

      const usageEl = document.createElement('span');
      usageEl.className = 'ageaf-citation-indicator';

      if (this.usage.isUsed) {
        usageEl.className += ' ageaf-citation-used';
        usageEl.textContent = ` ✓ ${this.usage.totalUsages}`;
        usageEl.title = this.buildUsageTooltip();
      } else {
        usageEl.className += ' ageaf-citation-unused';
        usageEl.textContent = ' ○';
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
        return `${f.fileName} (${f.occurrences}×, lines: ${lines})`;
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
      // Map existing decorations through document changes
      decorations = decorations.map(transaction.changes);

      // Apply updates from effects
      for (const effect of transaction.effects) {
        if (effect.is(updateCitationDecorations)) {
          const { entries, usageMap, duplicateTitleMap } = effect.value ?? {};
          const widgets: any[] = [];

          for (const entry of entries) {
            const usage = usageMap.get(entry.key);
            if (!usage) continue;
            const dup =
              duplicateTitleMap && typeof duplicateTitleMap.get === 'function'
                ? (duplicateTitleMap.get(entry.key) as DuplicateTitleInfo | undefined) ?? null
                : null;
            // Place widget at end of @entry{key line
            const doc = transaction.state.doc;
            const safeLineNumber = Math.max(1, Math.min(entry.lineNumber, doc.lines));
            const line = doc.line(safeLineNumber);
            const widget = Decoration.widget({
              widget: new CitationUsageWidget(usage, entry, dup),
              side: 1,
            }).range(line.to);

            widgets.push(widget);
          }

          decorations = Decoration.set(widgets, true);
        }
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

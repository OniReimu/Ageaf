import * as Diff from 'diff';
import { getCmView } from './helpers';

export function applyReplacementAtRange(
  view: ReturnType<typeof getCmView>,
  from: number,
  to: number,
  nextContent: string
) {
  const originalContent = view.state.sliceDoc(from, to);
  const changes = [];
  let diffs = Diff.diffChars(originalContent, nextContent);

  if (diffs.length >= 500) {
    diffs = Diff.diffWordsWithSpace(originalContent, nextContent);
  }

  if (diffs.length >= 500) {
    changes.push({
      from,
      to,
      insert: nextContent,
    });
  } else {
    let index = 0;
    for (const diff of diffs) {
      if (diff.added) {
        changes.push({
          from: from + index,
          to: from + index,
          insert: diff.value,
        });
      } else if (diff.removed) {
        changes.push({
          from: from + index,
          to: from + index + diff.value.length,
        });
        index += diff.value.length;
      } else {
        index += diff.value.length;
      }
    }
  }

  const selection = { anchor: from + nextContent.length };
  view.dispatch({ changes, selection });
}

export function onReplaceContent(
  e: CustomEvent<{ content: string; from: number; to: number }>
) {
  const view = getCmView();
  const state = view.state;
  if (state.selection.main.from == e.detail.from && state.selection.main.to == e.detail.to) {
    applyReplacementAtRange(view, e.detail.from, e.detail.to, e.detail.content);
  }
}

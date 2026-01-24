import * as Diff from 'diff';
import { getCmView } from './helpers';

export function onReplaceContent(
  e: CustomEvent<{ content: string; from: number; to: number }>
) {
  var view = getCmView();
  const state = view.state;
  if (
    state.selection.main.from == e.detail.from &&
    state.selection.main.to == e.detail.to
  ) {
    const originalContent = state.sliceDoc(
      state.selection.main.from,
      state.selection.main.to
    )
    let changes = [];
    let diffs = Diff.diffChars(originalContent, e.detail.content);

    if (diffs.length >= 500) {
      diffs = Diff.diffWordsWithSpace(originalContent, e.detail.content);
    }

    if (diffs.length >= 500) {
      changes.push({
        from: e.detail.from,
        to: e.detail.to,
        insert: e.detail.content,
      });
    } else {
      let index = 0;
      for (const diff of diffs) {
        if (diff.added) {
          changes.push({
            from: e.detail.from + index,
            to: e.detail.from + index,
            insert: diff.value,
          });
        } else if (diff.removed) {
          changes.push({
            from: e.detail.from + index,
            to: e.detail.from + index + diff.value.length,
          });
          index += diff.value.length;
        } else {
          index += diff.value.length;
        }
      }
    }

    const selection = { anchor: e.detail.from + e.detail.content.length };
    view.dispatch({ changes, selection });
  }
}

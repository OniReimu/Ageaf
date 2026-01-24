import { EditorContent, EditorContentState } from "../types";

export function getCmView() {
  const editor = document.querySelector('.cm-content') as any as EditorContent;
  return editor.cmView.view;
}

export function getContentBeforeCursor(state: EditorContentState, pos: number, length: number) {
  const start = Math.max(0, pos - length);
  return state.sliceDoc(start, pos);
}

export function getContentAfterCursor(state: EditorContentState, pos: number, length: number) {
  const end = Math.min(state.doc.length, pos + length);
  return state.sliceDoc(pos, end);
}

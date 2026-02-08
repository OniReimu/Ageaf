/**
 * Pure-logic helpers for expanding LaTeX \input{}/\include{}/\bibliography{}
 * directives by inlining referenced file contents.  These functions are
 * deliberately side-effect-free (they receive a file-fetcher callback) so
 * they can be unit-tested without DOM or Overleaf dependencies.
 */

// ---- Types ----------------------------------------------------------------

export type DirectiveKind =
  | 'input'
  | 'include'
  | 'bibliography'
  | 'addbibresource';

/** Minimal description of a file in the Overleaf project tree. */
export interface ProjectFile {
  path: string;
  name: string;
}

/** Callback that returns file content by project path, or null on failure. */
export type FileFetcher = (path: string) => Promise<string | null>;

// ---- Configuration ---------------------------------------------------------

export const LATEX_EXPAND_MAX_DEPTH = 8;
export const LATEX_EXPAND_MAX_FILES = 50;

// ---- Helpers ---------------------------------------------------------------

/** Return the lowercase file extension including the dot, e.g. `.tex`. */
export const fileExt = (name: string): string => {
  const m = name.match(/\.[a-z0-9]+$/i);
  return m ? m[0].toLowerCase() : '';
};

/**
 * Resolve a LaTeX include reference to a project file path.
 *
 * Resolution strategy (in order):
 *   1. Relative to `contextDir` (the directory of the including file).
 *   2. Relative to the project root (empty string).
 *   3. Basename-only match (last resort).
 *
 * Extension inference is directive-aware:
 *   - input / include → `.tex`
 *   - bibliography / addbibresource → `.bib`
 */
export const resolveLatexRef = (
  inputRef: string,
  directive: DirectiveKind,
  contextDir: string,
  projectFiles: ProjectFile[]
): string | null => {
  const ref = inputRef.replace(/^\.\//, '');
  const hasExt = /\.(tex|bib|sty|cls|bst|bbl|dtx|ins|tikz)$/i.test(ref);
  const isBib = directive === 'bibliography' || directive === 'addbibresource';
  const extSuffix = isBib ? '.bib' : '.tex';
  const candidates = hasExt ? [ref] : [ref, `${ref}${extSuffix}`];

  // Build candidates relative to contextDir first, then project root.
  const relCandidates = contextDir
    ? candidates.map((c) => `${contextDir}/${c}`)
    : [];
  const allCandidates = [...relCandidates, ...candidates];

  // Exact match
  const exact = projectFiles.find((f) =>
    allCandidates.some((c) => f.path === c)
  );
  if (exact) return exact.path;

  // Case-insensitive
  const lower = allCandidates.map((c) => c.toLowerCase());
  const ci = projectFiles.find((f) =>
    lower.some((c) => f.path.toLowerCase() === c)
  );
  if (ci) return ci.path;

  // Basename fallback
  const basename = ref.split('/').pop() ?? ref;
  const baseCandidates = hasExt
    ? [basename.toLowerCase()]
    : [basename.toLowerCase(), `${basename.toLowerCase()}${extSuffix}`];
  const byName = projectFiles.find((f) =>
    baseCandidates.some((c) => f.name.toLowerCase() === c)
  );
  if (byName) return byName.path;

  return null;
};

/**
 * Recursively expand LaTeX include directives in `texContent`, replacing
 * each directive with the actual file content.
 *
 * Guarantees:
 *   - Prefix/suffix text on the same line as a directive is preserved.
 *   - Cycle detection uses an ancestor stack (not a global visited set),
 *     so the same file can be legitimately included in separate branches.
 *   - Expansion stops at `LATEX_EXPAND_MAX_DEPTH` nesting or
 *     `LATEX_EXPAND_MAX_FILES` total inlined files.
 *   - `\bibliography{a,b}` is split and each entry resolved separately.
 *   - Commented-out directives (`% \input{…}`) are left untouched.
 *   - Failed fetches leave the original directive in place.
 */
/**
 * Collect the project-file paths referenced by \\input/\\include/\\bibliography
 * directives in `texContent`.  Does NOT inline content — just returns the
 * resolved paths for attaching as read-only context.
 */
export const collectLatexInputPaths = (
  texContent: string,
  projectFiles: ProjectFile[],
  currentFilePath: string
): string[] => {
  const contextDir = currentFilePath.includes('/')
    ? currentFilePath.slice(0, currentFilePath.lastIndexOf('/'))
    : '';

  const directiveRe =
    /\\(input|include|bibliography|addbibresource)\s*\{([^}]+)\}/g;
  const paths: string[] = [];
  const seen = new Set<string>();

  for (const line of texContent.split('\n')) {
    if (line.trimStart().startsWith('%')) continue;
    const commentIdx = line.indexOf('%');
    const nonComment = commentIdx >= 0 ? line.slice(0, commentIdx) : line;

    let m: RegExpExecArray | null;
    directiveRe.lastIndex = 0;
    while ((m = directiveRe.exec(nonComment)) !== null) {
      const directive = m[1] as DirectiveKind;
      const rawArg = m[2].trim();
      const refList =
        directive === 'bibliography'
          ? rawArg.split(',').map((s) => s.trim())
          : [rawArg];

      for (const inputRef of refList) {
        const resolved = resolveLatexRef(inputRef, directive, contextDir, projectFiles);
        if (resolved && !seen.has(resolved)) {
          seen.add(resolved);
          paths.push(resolved);
        }
      }
    }
  }

  return paths;
};

export const expandLatexIncludes = async (
  texContent: string,
  fetchFile: FileFetcher,
  projectFiles: ProjectFile[],
  currentFilePath: string,
  ancestorStack: Set<string> = new Set(),
  inlinedFiles: Set<string> = new Set(),
  depth: number = 0
): Promise<string> => {
  if (depth >= LATEX_EXPAND_MAX_DEPTH) return texContent;

  const contextDir = currentFilePath.includes('/')
    ? currentFilePath.slice(0, currentFilePath.lastIndexOf('/'))
    : '';

  const directiveRe =
    /\\(input|include|bibliography|addbibresource)\s*\{([^}]+)\}/g;
  const lines = texContent.split('\n');
  const expanded: string[] = [];

  for (const line of lines) {
    // Skip comment-only lines
    if (line.trimStart().startsWith('%')) {
      expanded.push(line);
      continue;
    }

    // Only consider the non-comment portion of the line
    const commentIdx = line.indexOf('%');
    const nonComment = commentIdx >= 0 ? line.slice(0, commentIdx) : line;
    const commentSuffix = commentIdx >= 0 ? line.slice(commentIdx) : '';

    if (!directiveRe.test(nonComment)) {
      expanded.push(line);
      directiveRe.lastIndex = 0;
      continue;
    }

    // Reset and walk through all directives on this line, preserving
    // prefix and suffix text around each match.
    directiveRe.lastIndex = 0;
    let result = '';
    let lastIdx = 0;
    let m: RegExpExecArray | null;

    while ((m = directiveRe.exec(nonComment)) !== null) {
      const directive = m[1] as DirectiveKind;
      const rawArg = m[2].trim();

      // \bibliography{a,b} can list multiple files
      const refList =
        directive === 'bibliography'
          ? rawArg.split(',').map((s) => s.trim())
          : [rawArg];

      // Preserve text before this match
      result += nonComment.slice(lastIdx, m.index);

      let replacement = '';
      for (const inputRef of refList) {
        if (inlinedFiles.size >= LATEX_EXPAND_MAX_FILES) {
          replacement += m[0];
          continue;
        }

        const resolved = resolveLatexRef(
          inputRef,
          directive,
          contextDir,
          projectFiles
        );
        if (!resolved || ancestorStack.has(resolved)) {
          replacement += m[0];
          continue;
        }

        // eslint-disable-next-line no-await-in-loop
        const content = await fetchFile(resolved);
        if (content == null) {
          replacement += m[0];
          continue;
        }

        inlinedFiles.add(resolved);
        const isTex = fileExt(resolved) === '.tex';
        let body: string;

        if (isTex) {
          ancestorStack.add(resolved);
          // eslint-disable-next-line no-await-in-loop
          body = await expandLatexIncludes(
            content,
            fetchFile,
            projectFiles,
            resolved,
            ancestorStack,
            inlinedFiles,
            depth + 1
          );
          ancestorStack.delete(resolved);
        } else {
          body = content;
        }

        replacement +=
          `\n%%% --- begin included file: ${resolved} ---\n` +
          body +
          `\n%%% --- end included file: ${resolved} ---\n`;
      }

      result += replacement;
      lastIdx = m.index + m[0].length;
    }

    // Append remaining non-comment text + the comment suffix
    result += nonComment.slice(lastIdx) + commentSuffix;
    expanded.push(result);
  }

  return expanded.join('\n');
};

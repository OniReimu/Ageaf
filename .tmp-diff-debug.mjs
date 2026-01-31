console.log('start');
try {
  const { preloadDiffHTML } = await import('@pierre/diffs/ssr');
  console.log('imported ssr');
  const { parseDiffFromFile, setLanguageOverride, ResolvedThemes } = await import('@pierre/diffs');
  console.log('imported diffs');
  const githubDark = (await import('@shikijs/themes/github-dark')).default;
  console.log('imported theme');
  if (!ResolvedThemes.has('github-dark')) ResolvedThemes.set('github-dark', githubDark);
  console.log('theme set');
  const oldText='We write the paper here.';
  const newText='We write the paper here and add some more words to make it long.';
  const fileDiff=setLanguageOverride(parseDiffFromFile({name:'selection.tex',contents:oldText},{name:'selection.tex',contents:newText}),'text');
  console.log('fileDiff built');
  const html=await preloadDiffHTML({fileDiff, options:{theme:'github-dark', themeType:'dark', diffStyle:'unified', overflow:'scroll'}});
  console.log('done', html.length);
  console.log('data-line-type samples', (html.match(/data-line-type=\"[^\"]+\"/g) || []).slice(0,10));
} catch (e) {
  console.error('ERR', e && e.stack ? e.stack : e);
  process.exit(1);
}

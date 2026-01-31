const { preloadDiffHTML } = await import('@pierre/diffs/ssr');
const { parseDiffFromFile, setLanguageOverride, ResolvedThemes } = await import('@pierre/diffs');
const githubDark = (await import('@shikijs/themes/github-dark')).default;
if (!ResolvedThemes.has('github-dark')) ResolvedThemes.set('github-dark', githubDark);
const oldText='We write the paper here.';
const newText='We write the paper here and add some more words to make it long.';
const fileDiff=setLanguageOverride(parseDiffFromFile({name:'selection.tex',contents:oldText},{name:'selection.tex',contents:newText}),'text');
const html=await preloadDiffHTML({fileDiff, options:{theme:'github-dark', themeType:'dark', diffStyle:'unified', overflow:'scroll'}});
process.stdout.write(html);

/* eslint-disable @typescript-eslint/naming-convention */

declare let __webpack_public_path__: string;

type RuntimeLike = {
  getURL?: (path?: string) => string;
};

type ChromeLike = {
  runtime?: RuntimeLike;
};

export function resolveWebpackPublicPath(chromeLike?: ChromeLike): string {
  if (!chromeLike?.runtime?.getURL) return '';
  return chromeLike.runtime.getURL('');
}

export function setWebpackPublicPath(): void {
  const chromeLike: ChromeLike | undefined =
    typeof chrome !== 'undefined' ? (chrome as ChromeLike) : undefined;
  const publicPath = resolveWebpackPublicPath(chromeLike);
  if (!publicPath) return;
  __webpack_public_path__ = publicPath;
}

setWebpackPublicPath();

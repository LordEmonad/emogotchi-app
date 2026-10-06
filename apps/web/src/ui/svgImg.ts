/**
 * An on-chain SVG as an <img> source.
 *
 * Item pictures come from `EmogotchiItems.imageOf`, which the curator writes, and `innerHTML` runs inline event
 * handlers: `<img src=x onerror=…>` or `<svg><animate onbegin=…>` inside one of those pictures would be script on
 * this origin — the same origin that holds a passkey account's private key. An SVG loaded through `<img>` cannot run
 * script at all, whatever is in it, so the pictures come in that way and the question never arises.
 *
 * The cat and frok portraits come from the immutable art contract and have no writer, but they go the same way for
 * consistency: one route in, with no exception to remember.
 */
export const svgSrc = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

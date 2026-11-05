import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const cache = new Map<string, readonly string[] | null>();
/** Local, unmodified Hanzi Writer Data (Arphic Public License). Never fetch at runtime. */
export function characterStrokes(character: string): readonly string[] | null {
  if (!/^\p{Script=Han}$/u.test(character)) return null;
  if (cache.has(character)) return cache.get(character)!;
  try {
    const data: unknown = require(`hanzi-writer-data/${character}.json`);
    const strokes = (data as { strokes?: unknown })?.strokes;
    if (!Array.isArray(strokes) || !strokes.length || strokes.length > 64 || strokes.some(s => typeof s !== 'string' || !s.length)) throw new Error(`笔顺数据格式错误：${character}`);
    cache.set(character, strokes); return strokes;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'MODULE_NOT_FOUND') throw e;
    cache.set(character, null); return null;
  }
}

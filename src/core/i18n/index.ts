import type { ReactNode } from 'react';
import { settingsStore } from '../settings/store';
import fa from './fa.json';

const dictionary: Readonly<Record<string, string>> = fa;
const foldedDictionary = new Map(
  Object.entries(dictionary).map(([key, value]) => [key.toLowerCase(), value])
);
const cache = new Map<string, string>();
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Catalog data stays in English, shared with the server. Resolve generated
// descriptions at the presentation boundary, including nested catalog names.
const patterns = Object.entries(dictionary)
  .filter(
    ([source]) =>
      /\{\d+\}/.test(source) && source.replace(/\{\d+\}/g, '').replace(/[^a-z]/gi, '').length >= 2
  )
  .map(([source, target]) => {
    const slots: string[] = [];
    const chunks = source.split(/(\{\d+\})/g).map((chunk) => {
      if (/^\{\d+\}$/.test(chunk)) {
        slots.push(chunk);
        return '(.*?)';
      }
      return escape(chunk);
    });
    return { source, target, slots, regex: new RegExp(`^${chunks.join('')}$`, 'i') };
  })
  .sort(
    (a, b) => b.source.replace(/\{\d+\}/g, '').length - a.source.replace(/\{\d+\}/g, '').length
  );

function translate(text: string, depth = 0): string {
  if (depth > 6 || text.length > 2000) return text;
  const exact = dictionary[text] ?? foldedDictionary.get(text.toLowerCase());
  if (exact !== undefined) return exact;
  const trimmed = text.trim();
  if (trimmed !== text && dictionary[trimmed] !== undefined)
    return text.replace(trimmed, dictionary[trimmed]!);
  let best: { value: string; untranslated: number } | undefined;
  for (const pattern of patterns) {
    const match = pattern.regex.exec(text);
    if (!match) continue;
    // Rank/ability helpers append optional clauses directly to a duration.
    // A regex has no separator to distinguish "5s" from ", with two...".
    for (let index = 0; index < pattern.slots.length - 1; index++) {
      if (!pattern.source.includes(`${pattern.slots[index]}${pattern.slots[index + 1]}`)) continue;
      const combined = (match[index + 1] ?? '') + (match[index + 2] ?? '');
      const duration = /^([+-]?\d+(?:\.\d+)?(?:%|s)?)(.*)$/.exec(combined);
      if (duration) {
        match[index + 1] = duration[1]!;
        match[index + 2] = duration[2]!;
      }
    }
    const values = new Map(
      pattern.slots.map((slot, index) => [slot, translate(match[index + 1] ?? '', depth + 1)])
    );
    const value = pattern.target.replace(/\{\d+\}/g, (slot) => values.get(slot) ?? slot);
    const untranslated = value.replace(/[^a-z]/gi, '').length;
    if (!best || untranslated < best.untranslated) best = { value, untranslated };
    if (untranslated === 0) return value;
  }
  if (best) return best.value;
  // Composed summaries use these separators; translating each component also
  // covers content whose structure is assembled by core progression helpers.
  for (const separator of [' · ', '. ', '; ', ' + ', ' → ', ', ', ': ']) {
    if (!text.includes(separator)) continue;
    const parts = text.split(separator);
    const translated = parts.map((part) => translate(part, depth + 1));
    if (translated.some((part, index) => part !== parts[index])) return translated.join(separator);
  }
  // Generated courts, boss phases, and plural counters use known catalog
  // names followed by a number (or a known unit after a number).
  const numbered = /^(.*\S) (\d+(?:\/\d+)?)$/.exec(text);
  if (numbered && foldedDictionary.has(numbered[1]!.toLowerCase()))
    return `${translate(numbered[1]!, depth + 1)} ${numbered[2]}`;
  const counted = /^(\d+) ([a-z-]+)(?:s)?$/.exec(text);
  if (counted) {
    const word = counted[2]!.toLowerCase();
    const singular = word === 'lives' ? 'life' : word.replace(/s$/, '');
    const unit = foldedDictionary.has(singular) ? singular : word;
    if (foldedDictionary.has(unit)) return `${counted[1]} ${translate(unit, depth + 1)}`;
  }
  const duration = /^(\d+)h (\d+)m$/.exec(text);
  if (duration) return `${duration[1]} ساعت ${duration[2]} دقیقه`;
  const matchTime = /^(\d+)m (\d+)s$/.exec(text);
  if (matchTime) return `${matchTime[1]} دقیقه ${matchTime[2]} ثانیه`;
  const minutes = /^(\d+)m$/.exec(text);
  if (minutes) return `${minutes[1]} دقیقه`;
  const seconds = /^(\d+(?:\.\d+)?)s$/.exec(text);
  if (seconds) return `${seconds[1]} ثانیه`;
  const ordinal = /^(\d+)(?:st|nd|rd|th)$/.exec(text);
  if (ordinal) return ordinal[1]!;
  if (text.endsWith('.')) {
    const sentence = translate(text.slice(0, -1), depth + 1);
    if (sentence !== text.slice(0, -1)) return `${sentence}.`;
  }
  return text;
}

/** Translate only rendered text. Never pass ids, saves, or player input here. */
export function t<T extends ReactNode>(value: T): T {
  if (settingsStore.getSnapshot().language !== 'fa') return value;
  if (typeof value === 'number')
    return String(value).replace(/\d/g, (digit) => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)]!) as T;
  if (typeof value !== 'string' || !value) return value;
  const cached = cache.get(value);
  if (cached !== undefined) return cached as T;
  const result = translate(value).replace(/\d/g, (digit) => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)]!);
  if (cache.size >= 3000) cache.clear();
  cache.set(value, result);
  return result as T;
}

export function locale(): string {
  return settingsStore.getSnapshot().language === 'fa' ? 'fa-IR' : 'en';
}

/** Explicit placeholders let a translation reorder values without guessing. */
export function msg(source: keyof typeof fa, values: readonly ReactNode[]): string {
  const template = settingsStore.getSnapshot().language === 'fa' ? dictionary[source]! : source;
  return template.replace(/\{(\d+)\}/g, (_, index: string) => String(values[Number(index)] ?? ''));
}

/** Apply the saved locale before rendering, and subscribe for instant changes. */
export function installLanguage(): () => void {
  const apply = () => {
    const language = settingsStore.getSnapshot().language;
    document.documentElement.lang = language;
    document.documentElement.dir = language === 'fa' ? 'rtl' : 'ltr';
    document.title = language === 'fa' ? 'bBall · بازی توپ و راکت' : 'bBall';
  };
  apply();
  return settingsStore.subscribe(apply);
}

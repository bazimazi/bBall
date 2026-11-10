/**
 * Persian is the shipped default language. Browser checks that find controls
 * by their English labels start a fresh browser save in English instead.
 *
 * Seeds only when no device settings exist yet, so a language or preference a
 * check changes later survives reloads. Accepts a Playwright page or context.
 */
export function preferEnglish(target) {
  return target.addInitScript(() => {
    if (!localStorage.getItem('bball.settings'))
      localStorage.setItem('bball.settings', JSON.stringify({ v: 1, data: { language: 'en' } }));
  });
}

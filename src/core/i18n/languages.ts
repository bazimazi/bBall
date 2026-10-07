export type Language = 'en' | 'fa';

export const LANGUAGES = [
  { id: 'en', label: 'English', direction: 'ltr' },
  { id: 'fa', label: 'فارسی', direction: 'rtl' }
] as const;

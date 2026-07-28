import { el, id } from './dom';

const toastRoot = () => id('toast-root');

export function toast(text: string, kind: 'info' | 'gold' | 'bad' = 'info'): void {
  const box = el('div', `toast ${kind === 'info' ? '' : kind}`, text);
  toastRoot().appendChild(box);
  while (toastRoot().children.length > 4) toastRoot().firstChild?.remove();
  setTimeout(() => box.remove(), 4200);
}

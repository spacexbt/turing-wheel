import { h } from './dom';

export function lamp(tone: string): HTMLElement {
  return h('span', { class: 'lamp', 'data-tone': tone, 'aria-hidden': 'true' });
}

let openTip: (() => void) | null = null;

/** The square question mark from the panel corners. Click or Enter opens it, Escape closes it. */
export function helpTip(label: string, text: string): HTMLElement {
  const tip = h('div', { class: 'tip', role: 'note', hidden: true }, text);
  const onPointerDown = (event: PointerEvent): void => {
    if (event.target instanceof Node && !wrapper.contains(event.target)) close();
  };
  const close = (): void => {
    tip.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', onPointerDown);
    if (openTip === close) openTip = null;
  };
  const button = h(
    'button',
    {
      class: 'help',
      type: 'button',
      'aria-label': label,
      'aria-expanded': 'false',
      onClick: () => {
        const wasOpen = !tip.hidden;
        openTip?.();
        if (wasOpen) return;
        tip.hidden = false;
        button.setAttribute('aria-expanded', 'true');
        openTip = close;
        document.addEventListener('pointerdown', onPointerDown);
      },
      onKeydown: (event: Event) => {
        if ((event as KeyboardEvent).key === 'Escape') close();
      },
      onBlur: () => close(),
    },
    '?',
  );
  const wrapper = h('span', { class: 'help-wrap' }, button, tip);
  return wrapper;
}

export function panelBar(
  title: string,
  tone: string,
  ...rest: readonly (Node | null)[]
): { readonly bar: HTMLElement; readonly lamp: HTMLElement } {
  const indicator = lamp(tone);
  const bar = h(
    'header',
    { class: 'bar' },
    indicator,
    h('h2', { class: 'bar__title' }, title),
    ...rest,
  );
  return { bar, lamp: indicator };
}

export interface Segmented<T extends string> {
  readonly element: HTMLElement;
  set(value: T): void;
  setDisabled(value: T, disabled: boolean): void;
}

export function segmented<T extends string>(
  label: string,
  options: readonly { readonly value: T; readonly text: string }[],
  initial: T,
  onChange: (value: T) => void,
): Segmented<T> {
  let current = initial;
  const buttons = new Map<T, HTMLButtonElement>();

  const paint = (): void => {
    for (const [value, button] of buttons) {
      const active = value === current;
      button.dataset['active'] = active ? 'true' : 'false';
      button.setAttribute('aria-checked', active ? 'true' : 'false');
      button.tabIndex = active ? 0 : -1;
    }
  };

  const move = (from: T, step: number): void => {
    const enabled = options.filter((option) => !buttons.get(option.value)?.disabled);
    const index = enabled.findIndex((option) => option.value === from);
    const target = enabled[(index + step + enabled.length) % enabled.length];
    if (!target) return;
    onChange(target.value);
    buttons.get(target.value)?.focus();
  };

  const element = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': label });
  for (const option of options) {
    const button = h(
      'button',
      {
        type: 'button',
        role: 'radio',
        onClick: () => onChange(option.value),
        onKeydown: (event: Event) => {
          const key = (event as KeyboardEvent).key;
          if (key === 'ArrowRight' || key === 'ArrowDown') {
            event.preventDefault();
            move(option.value, 1);
          }
          if (key === 'ArrowLeft' || key === 'ArrowUp') {
            event.preventDefault();
            move(option.value, -1);
          }
        },
      },
      option.text,
    );
    buttons.set(option.value, button);
    element.appendChild(button);
  }
  paint();

  return {
    element,
    set(value) {
      if (value === current) return;
      current = value;
      paint();
    },
    setDisabled(value, disabled) {
      const button = buttons.get(value);
      if (button) button.disabled = disabled;
    },
  };
}

export interface ToastHost {
  readonly element: HTMLElement;
  show(text: string, tone?: string, link?: { readonly href: string; readonly text: string }): void;
}

export function toastHost(): ToastHost {
  const element = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
  return {
    element,
    show(text, tone = 'green', link) {
      const anchor = link
        ? h('a', { class: 'toast__link', href: link.href, target: '_blank', rel: 'noreferrer' }, link.text)
        : null;
      const toast = h('div', { class: 'toast' }, lamp(tone), h('span', {}, text, anchor ? ' ' : null, anchor));
      element.appendChild(toast);
      window.setTimeout(() => {
        toast.dataset['leaving'] = 'true';
        window.setTimeout(() => toast.remove(), 240);
      }, link || tone === 'red' ? 9000 : 3200);
    },
  };
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

type Child = Node | string | number | null | undefined | false;

export interface Props {
  class?: string;
  text?: string;
  html?: string;
  style?: Partial<CSSStyleDeclaration>;
  dataset?: Record<string, string>;
  [key: string]: unknown;
}

/** Tiny element helper — enough structure for this UI, no framework needed. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') el.className = String(value);
    else if (key === 'text') el.textContent = String(value);
    else if (key === 'html') el.innerHTML = String(value);
    else if (key === 'style') Object.assign(el.style, value as object);
    else if (key === 'dataset') Object.assign(el.dataset, value as object);
    else if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
    } else if (key in el) {
      // Assign as a property (checked, value, disabled…), which keeps the DOM
      // and the element state in sync.
      (el as unknown as Record<string, unknown>)[key] = value;
    } else {
      el.setAttribute(key, String(value));
    }
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    el.append(typeof child === 'object' ? child : document.createTextNode(String(child)));
  }
  return el;
}

export function clear(node: HTMLElement): HTMLElement {
  node.replaceChildren();
  return node;
}

export function field(label: string, control: HTMLElement, hint?: string): HTMLElement {
  return h('label', { class: 'field' }, h('span', { class: 'field-label', text: label }), control,
    hint ? h('span', { class: 'field-hint', text: hint }) : null);
}

export function numberInput(value: number, onChange: (value: number) => void, min = 0, max = 9999, step = 1): HTMLInputElement {
  return h('input', {
    class: 'input',
    type: 'number',
    value: String(value),
    min: String(min),
    max: String(max),
    step: String(step),
    onchange: (event: Event) => {
      const raw = Number((event.target as HTMLInputElement).value);
      if (Number.isFinite(raw)) onChange(raw);
    },
  });
}

export function toggle(label: string, checked: boolean, onChange: (value: boolean) => void): HTMLElement {
  const input = h('input', {
    type: 'checkbox',
    checked,
    onchange: (event: Event) => onChange((event.target as HTMLInputElement).checked),
  });
  return h('label', { class: 'toggle' }, input, h('span', { class: 'toggle-track' }, h('span', { class: 'toggle-thumb' })), h('span', { text: label }));
}

export function button(label: string, onClick: () => void, variant: 'primary' | 'ghost' | 'danger' = 'ghost'): HTMLButtonElement {
  return h('button', { class: `btn btn-${variant}`, type: 'button', onclick: onClick }, label);
}

export function select<T extends string>(
  value: T,
  options: { value: T; label: string }[],
  onChange: (value: T) => void,
): HTMLSelectElement {
  return h(
    'select',
    {
      class: 'input',
      onchange: (event: Event) => onChange((event.target as HTMLSelectElement).value as T),
    },
    ...options.map((option) => h('option', { value: option.value, selected: option.value === value }, option.label)),
  );
}

export function formatRect(r: { x: number; y: number; width: number; height: number }): string {
  return `${Math.round(r.width)}×${Math.round(r.height)} @ ${Math.round(r.x)},${Math.round(r.y)}`;
}

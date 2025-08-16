interface DirectiveContructor<D, T extends Element> {
  new (el: T): D;
}

/**
 * You may get the `has no properties in common with type 'Directive'` error
 * if you do not implement any of the methods because it trigger typescript
 * weak type detection. This is very annoying. So if you do not implement any
 * of theses methods just do no `implements Directive` the rest will work
 */
export interface Directive {
  onChange?(el: HTMLElement, mutation: MutationRecord): void;
  onDetach?(): void;
}

export class DirectiveManager<D, T extends Element> {
  symbol: symbol;
  attrsToObserve: string[];
  constructor(private directive: DirectiveContructor<D, T>, public selector: string) {
    this.symbol = Symbol(directive.name);
    this.attrsToObserve = extractAttributesFromSelector(selector);
  }

  observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === "childList") {
        for (let node of m.addedNodes) {
          if (!(node instanceof Element)) continue;
          this.attachTo(node);
        }

        for (let node of m.removedNodes) {
          if (!(node instanceof Element)) continue;
          this.detachFrom(node);
        }
      }

      if (m.type === "attributes" && m.target instanceof Element) {
        const el = m.target;
        if (el.matches(this.selector)) this.update(el, m);
        else this.#detach(el);
      }
    }
  });

  observe(root: ParentNode) {
    this.observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: this.attrsToObserve.length > 0 ? this.attrsToObserve : undefined,
    });
  }

  disconnect(root: ParentNode) {
    this.observer.disconnect(); // WARN: we can only disconnect for everything, so we need to detach from everything but how ? (a table of all observed root ?)
    for (let el of root.querySelectorAll<Element>(this.selector)) this.#detach(el);
  }

  getDir(element: Element) {
    return element[this.symbol] as D;
  }

  attachTo(root: ParentNode | Element) {
    if (root instanceof Element && root.matches(this.selector)) this.#attach(root);
    for (let el of root.querySelectorAll<Element>(this.selector)) this.#attach(el);
  }

  detachFrom(root: Element) {
    for (let el of root.querySelectorAll<Element>(this.selector)) this.#detach(el);
    if (root.matches(this.selector)) this.#detach(root);
  }

  #attach(element: any) {
    if (element[this.symbol]) return false;
    element[this.symbol] = new this.directive(element as T);
    return true;
  }

  #detach(el: any) {
    if (!el[this.symbol]) return;
    el[this.symbol].onDetach?.(el as T);
    delete el[this.symbol];
  }

  update(el: Element, mutation: MutationRecord) {
    if (!this.#attach(el)) {
      el[this.symbol].onChange?.(el as T, mutation);
    }
  }

  mutationObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === "childList") {
        for (let node of m.addedNodes) {
          if (!(node instanceof Element)) continue;
          this.attachTo(node);
        }

        for (let node of m.removedNodes) {
          if (!(node instanceof Element)) continue;
          this.detachFrom(node);
        }
      }

      if (m.type === "attributes" && m.target instanceof Element) {
        const el = m.target;
        if (el.matches(this.selector)) this.update(el, m);
        else this.#detach(el);
      }
    }
  });
}

export function registerDirective<D, T extends Element>(
  root: ParentNode,
  selector: string,
  directive: DirectiveContructor<D, T>
) {
  const dirManager = new DirectiveManager(directive, selector);
  dirManager.attachTo(root);
  dirManager.observe(root);

  return dirManager;
}

/**
 * Extract attribute names from a CSS selector.
 * Handles selectors like [attr], [attr=value], [attr|=value], etc.
 */
function extractAttributesFromSelector(selector: string): string[] {
  const attrPattern = /\[\s*([a-zA-Z_:][-a-zA-Z0-9_:.]*)/g;
  const attrs = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = attrPattern.exec(selector)) !== null) {
    attrs.add(match[1]);
  }
  return Array.from(attrs);
}

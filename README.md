# DOM Element Lifecycle Observer

Small, framework-agnostic TypeScript helpers to attach _directive_ classes to DOM elements that match a CSS selector, observe attribute changes and subtree mutations, and run lifecycle hooks (init/onChange/onDetach).

---

## Getting started

```ts
import { registerDirective, type Directive } from "directive";

class CopyTextDirective {
  el: HTMLElement;
  constructor(el: HTMLElement) {
    this.el = el;
    this.el.addEventListener("click", this.copyText);
  }

  copyText() {
    const text = this.innerText;
    navigator.clipboard.writeText(text);
  }

  // Called when directive is removed from element
  onDetach() {
    this.el.removeEventListener("click", this.copyText);
  }
}

const copyTextManager = registerDirective(document, "button[copy-text]", CopyTextDirective);

// Later, stop observing and detach all matching directives
disconnect(document);
copyTextManager.disconnect(document);
```

**Explanation**

- `CopyTextDirective` is the directive class. An instance of it is created for each element the directive is attached on.
- The constructor receives the element it is attached to. Inside it, we do whatever we want with the element. In this example, we add a click event listener that copies its innerText to the clipboard.
- We define the `onDetach` lifecycle method to clean up when the directive is detached.
- `registerDirective(document, "button[copy-text]", CopyTextDirective)` registers the directive on the `document`. It creates directive instances for all existing matching elements and starts listening for changes.
- `copyTextManager.disconnect(document)` detaches all directive instances from `document` matching the selector and stops observing further changes.

---

## Implementation details

### Lifecycle flow

- When an element matches the selector (present initially, added later, or becomes matching after an attribute change), an instance of the directive is created and attached to the element.
- When a matching element receives attribute mutations while still matching, the directive's `onChange` hook is called with the `MutationRecord`.
- When the element is removed from the DOM (or no longer matches because of attribute changes), the directive's `onDetach` is called and the instance reference is removed.

This library optimizes the `MutationObserver` by extracting attribute names used in attribute selectors and passing them to `attributeFilter` when possible.

### Per-element directive instances and the unique `Symbol`

Each `registerDirective` call creates a `DirectiveManager` with a unique `Symbol`. The manager attaches the directive instance to the element using that symbol as the property key. This ensures:

- Instances are per-element (one instance per element per registration).
- Multiple different managers (even for the same selector or the same directive type) do not collide because each manager uses its own `Symbol`.

> **MDN quote (symbols & uniqueness)**
>
> "Symbol is a built-in object whose constructor returns a symbol primitive — also called a Symbol value or just a Symbol — that's guaranteed to be unique. Symbols are often used to add unique property keys to an object that won't collide with keys any other code might add to the object, and which are hidden from any mechanisms other code will typically use to access the object. That enables a form of weak encapsulation, or a weak form of information hiding."

The implementation exposes `DirectiveManager.getDir(element)` to retrieve the directive instance stored on the element for that manager (typed to the directive class). Use this for debugging or when you need programmatic access to the directive instance from outside the class.

**Important**: The library does not rely on any global state across registrations: each manager holds its own symbol and state.

---

## API

### Directive class definition

A directive is a class you implement with the following structure:

```ts
class MyDirective {
  constructor(el: HTMLElement) {
    // Called when the directive is attached to an element
  }

  onChange?(el: HTMLElement, mutation: MutationRecord): void {
    // Called when an attribute mutation happens on an attached element
    // and the element still matches the selector
  }

  onDetach?(): void {
    // Called when the element is removed or no longer matches
  }
}
```

**Constructor**

- Signature: `(el: HTMLElement)`
- Called when the directive is first attached to an element that matches the selector.
- Receives the element as argument. Use this to set up state, event listeners, etc.

**Lifecycle methods**

- `onChange(el: HTMLElement, mutation: MutationRecord)`

  - Called when an already attached element has an attribute change and still matches the selector.
  - Arguments:

    - `el` — the element.
    - `mutation` — the mutation record describing the attribute change.

- `onDetach()`

  - Called when the element is removed from the DOM or no longer matches the selector.
  - Use this to clean up event listeners or other state.

### `registerDirective(root: ParentNode, selector: string, directive: { new (el: T): D }): DirectiveManager<D, T>`

- Registers a directive constructor on the provided `root` for elements matching `selector`.
- Immediately scans `root` for existing matches and attaches directive instances.
- Starts observing `root` for `childList`, `subtree`, and `attributes` mutations. When necessary, an optimized `attributeFilter` is provided.
- Returns the `DirectiveManager` instance for further control or inspection.

**Example**

```ts
const manager = registerDirective(document.body, "button[copy-text]", CopyTextDirective);
```

### `class DirectiveManager<D, T extends Element>`

**Constructor**

```ts
new DirectiveManager(directive: { new (el: T): D }, selector: string)
```

- Creates a manager for the directive and selector pair. Internally a unique `Symbol` is created for instance storage and `attrsToObserve` is extracted from the selector.

**Properties**

- `symbol: symbol` — unique symbol used as a property key on elements to store the directive instance.
- `attrsToObserve: string[]` — attribute names extracted from the selector (used to build `attributeFilter`).
- `selector: string` — the CSS selector the manager tracks.

**Key methods**

- `attachTo(root: ParentNode | Element): void` — scan `root` and attach instances to any elements that match the manager's selector (checks the node itself and its descendants).
- `detachFrom(root: Element): void` — detach matching elements on the removed subtree (calls `onDetach` and removes the stored instance), and handles the root node if it matches.
- `observe(root: ParentNode): void` — start the manager's `MutationObserver` on `root` with `{ childList: true, subtree: true, attributes: true, attributeFilter: ... }`.
- `disconnect(root: ParentNode): void` — disconnects the manager's `MutationObserver` and detaches any currently matching elements found in `root`.

  - **Note / caveat:** The implementation calls `observer.disconnect()` which stops observation globally for that manager. The method will also run a detach pass on the provided `root` to call `onDetach` for remaining matches, but it is not per-root in the sense of multiple roots — the observer is a single `MutationObserver` instance per manager.

- `getDir(element: Element): D | undefined` — returns the directive instance attached to `element` for this manager (reads `element[this.symbol]`).

**Internal/utility methods** (described so you know what's available in the code):

- `update(el: Element, mutation: MutationRecord)` — if the element is not attached yet, attach it; otherwise call `onChange` on the stored instance. If the element no longer matches, detach it.
- `#attach(element)` / `#detach(element)` — private helpers that create/destroy the instance and set/remove the symbol property.

### `extractAttributesFromSelector(selector: string): string[]`

- Utility used internally to parse attribute selectors and extract attribute names such as `data-id`, `role`, etc.
- Returned array is used to populate `MutationObserver`'s `attributeFilter` when possible. If no attributes are found the observer leaves `attributeFilter` undefined (so it will receive all attribute changes).

---

## Notes & caveats

- The manager creates a new `Symbol` for each `registerDirective` call. That guarantees per-registration isolation but also means you cannot access another manager's instances unless you hold that manager reference and call its `getDir()`.
- `disconnect` currently disconnects the single `MutationObserver` instance for that manager. If you call `observe` on multiple roots with the same manager, you must manage detach behavior accordingly (the current implementation stores no explicit list of observed roots).
- The manager optimizes attribute observation only when attribute selectors are present in the selector string. For complex selectors that rely on pseudo-classes, combinators, or dynamic computed state (like `:first-child`) there is no attribute optimization and `attributeFilter` will be left undefined.
- The implementation attaches instances directly to DOM elements using the manager's unique symbol. This is by design for fast lookup and per-element instance lifetime tied to the element's presence in the DOM.

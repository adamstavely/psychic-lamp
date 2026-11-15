/**
 * Whether a tc-open-change is the dialog's own. The controls inside a tc-dialog (a tc-select opening its list) fire
 * tc-open-change too, and it bubbles to the dialog: only the dialog's own may open or close it.
 */
export function ownOpenChange(event: Event): event is CustomEvent<{ open: boolean }> {
  return event.target instanceof Element && event.target.localName === 'tc-dialog';
}

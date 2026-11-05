/** Resolve the upload control belonging to the user's drop, including styled
 * buttons backed by a hidden file input. Never guess between multiple inputs. */
export function pdfUploadInput(target: Element): HTMLInputElement | undefined {
  const usable = (input: Element | null): input is HTMLInputElement =>
    input instanceof HTMLInputElement &&
    input.type === 'file' &&
    !input.disabled &&
    (!input.accept ||
      input.accept
        .split(',')
        .some((part) => /^(\.pdf|application\/pdf|application\/\*|\*\/\*)$/i.test(part.trim())));
  if (usable(target)) return target;
  const label = target.closest('label');
  if (label && usable(label.control)) return label.control;
  let scope: Element | null = target;
  for (let depth = 0; scope && depth < 6; depth++, scope = scope.parentElement) {
    if (scope.matches('body,html')) break;
    const inputs = [...scope.querySelectorAll('input[type=file]')].filter(usable);
    if (inputs.length === 1) return inputs[0];
    if (inputs.length > 1) return undefined;
  }
  return undefined;
}
export function deliverPDF(target: Element, file: File): 'input' | 'drop' {
  if (!target.isConnected) throw new Error('The upload area changed. Drag the PDF again.');
  const transfer = new DataTransfer();
  transfer.items.add(file);
  const input = pdfUploadInput(target);
  if (input) {
    input.files = transfer.files;
    input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    return 'input';
  }
  for (const type of ['dragenter', 'dragover', 'drop'])
    target.dispatchEvent(
      new DragEvent(type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        dataTransfer: transfer,
      }),
    );
  return 'drop';
}

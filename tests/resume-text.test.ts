import { describe, expect, it } from 'vitest';
import { formatPDFPage } from '../src/ai/resume-text';
const item = (str: string, x: number, y: number, width = 40) => ({
  str,
  transform: [10, 0, 0, 10, x, y],
  width,
  height: 10,
});
describe('local résumé PDF text formatting', () => {
  it('preserves visual lines even when the PDF does not mark hasEOL', () => {
    const result = formatPDFPage([
      item('Example Applicant', 20, 700),
      item('Projects', 20, 675),
      item('Built an agent', 20, 655),
      item('with Python.', 105, 655),
    ]);
    expect(result.text).toBe('Example Applicant\nProjects\nBuilt an agent with Python.');
  });
  it('reassembles fragmented words while retaining explicit line endings', () => {
    const result = formatPDFPage([
      item('Py', 20, 700, 12),
      { ...item('thon', 32, 700, 20), hasEOL: true },
      item('Engineer', 20, 680),
    ]);
    expect(result.text).toBe('Python\nEngineer');
  });
  it('keeps actual résumé hyperlinks but ignores unsafe and duplicate annotations', () => {
    const result = formatPDFPage(
      [item('Portfolio', 20, 700)],
      [
        { url: 'https://example.test/project', rect: [19, 698, 70, 712] },
        { url: 'javascript:alert(1)' },
        { url: 'https://user:password@example.test' },
        { url: 'https://example.test/project' },
      ],
    );
    expect(result.links).toBe(1);
    expect(result.text).toContain('Portfolio: https://example.test/project');
    expect(result.text).not.toMatch(/javascript|password/);
  });
});

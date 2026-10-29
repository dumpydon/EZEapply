import { describe, expect, it } from 'vitest';
import { moveField, orderFields } from '../src/order';

describe('field ordering', () => {
  const fields = [
    { id: 'builtin:first', label: 'First name' },
    { id: 'builtin:middle', label: 'Middle name' },
    { id: 'builtin:last', label: 'Last name' },
    { id: 'custom:new', label: 'New answer' },
  ];

  it('puts last name directly after first name while preserving default order for new fields', () => {
    const result = orderFields(fields, ['builtin:first', 'builtin:last']);
    expect(result.map((field) => field.id)).toEqual([
      'builtin:first',
      'builtin:last',
      'builtin:middle',
      'custom:new',
    ]);
    expect(result[0]).toBe(fields[0]);
    expect(fields.map((field) => field.id)).toEqual([
      'builtin:first',
      'builtin:middle',
      'builtin:last',
      'custom:new',
    ]);
  });

  it('ignores stale order IDs and uses the first occurrence of duplicate entries', () => {
    expect(
      orderFields(fields, ['removed', 'builtin:last', 'builtin:first', 'builtin:last']).map(
        (field) => field.id,
      ),
    ).toEqual(['builtin:last', 'builtin:first', 'builtin:middle', 'custom:new']);
  });

  it('preserves the default order for legacy profiles without saved ordering', () => {
    const result = orderFields(fields);
    expect(result).toEqual(fields);
    expect(result).not.toBe(fields);
    expect(orderFields(fields, [])).toEqual(fields);
  });

  it('moves an item upward or downward relative to the requested target', () => {
    const order = ['first', 'middle', 'last', 'phone'];
    expect(moveField(order, 'last', 'first', 'after')).toEqual([
      'first',
      'last',
      'middle',
      'phone',
    ]);
    expect(moveField(order, 'first', 'phone', 'after')).toEqual([
      'middle',
      'last',
      'phone',
      'first',
    ]);
    expect(moveField(order, 'phone', 'first', 'before')).toEqual([
      'phone',
      'first',
      'middle',
      'last',
    ]);
    expect(moveField(order, 'first', 'last', 'before')).toEqual([
      'middle',
      'first',
      'last',
      'phone',
    ]);
    expect(order).toEqual(['first', 'middle', 'last', 'phone']);
  });

  it('leaves the list unchanged for absent or identical IDs', () => {
    const order = ['a', 'b', 'c'];
    expect(moveField(order, 'a', 'a', 'after')).toEqual(order);
    expect(moveField(order, 'missing', 'b', 'before')).toEqual(order);
    expect(moveField(order, 'a', 'missing', 'before')).toEqual(order);
    expect(moveField([], 'a', 'b', 'after')).toEqual([]);
  });

  it('supports adjacent moves and retains all non-moved relative positions', () => {
    expect(moveField(['a', 'b', 'c', 'd'], 'a', 'b', 'after')).toEqual(['b', 'a', 'c', 'd']);
    expect(moveField(['a', 'b', 'c', 'd'], 'd', 'c', 'before')).toEqual(['a', 'b', 'd', 'c']);
    expect(moveField(['a', 'b', 'c', 'd'], 'a', 'b', 'before')).toEqual(['a', 'b', 'c', 'd']);
  });
});

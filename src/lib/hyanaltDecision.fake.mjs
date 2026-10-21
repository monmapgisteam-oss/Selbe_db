/** Independent, deliberately small SQL interpreter for mocked /calculate tests.
 * Parses AND/OR, parentheses, equality, SQL strings (including N'…'), and IS NULL.
 * It never infers a successful match from an OID or blindly accepts a predicate. */
import assert from 'node:assert/strict';

export function whereMatches(sql, row) {
  const tokens = [];
  for (let rest = sql.trim(); rest;) {
    const m = /^(\s+|[()=]|N?'(?:''|[^'])*'|-?\d+(?:\.\d+)?|[\p{L}\p{N}_]+)/iu.exec(rest);
    assert.ok(m, `Unsupported SQL near ${rest.slice(0, 60)}`);
    rest = rest.slice(m[0].length);
    if (!/^\s+$/.test(m[0])) tokens.push(m[0]);
  }
  let i = 0;
  const take = (wanted) => {
    const t = tokens[i++];
    if (wanted) assert.equal(t?.toUpperCase(), wanted, `SQL expected ${wanted}`);
    return t;
  };
  const primary = () => {
    if (tokens[i] === '(') { take('('); const v = or(); take(')'); return v; }
    const field = take();
    assert.ok(/^[\p{L}_][\p{L}\p{N}_]*$/u.test(field ?? ''), 'SQL field required');
    const actual = row[field];
    if (tokens[i]?.toUpperCase() === 'IS') { take('IS'); take('NULL'); return actual == null; }
    take('=');
    const literal = take();
    let value;
    if (/^N?'/i.test(literal ?? '')) value = literal.replace(/^N?'/i, '').slice(0, -1).replace(/''/g, "'");
    else { assert.match(literal ?? '', /^-?\d+(?:\.\d+)?$/); value = Number(literal); }
    return actual != null && actual === value;
  };
  const and = () => {
    let v = primary();
    while (tokens[i]?.toUpperCase() === 'AND') { take('AND'); const rhs = primary(); v = v && rhs; }
    return v;
  };
  const or = () => {
    let v = and();
    while (tokens[i]?.toUpperCase() === 'OR') { take('OR'); const rhs = and(); v = v || rhs; }
    return v;
  };
  const matched = or();
  assert.equal(i, tokens.length, 'SQL must be consumed completely');
  return matched;
}

/** Evaluate and mutate synchronously, as one server UPDATE statement. */
export function calculateRows(rows, body, onUpdate = () => {}) {
  assert.equal(body.get('sqlFormat'), 'standard');
  const expression = JSON.parse(body.get('calcExpression'));
  assert.ok(Array.isArray(expression) && expression.length > 0, 'scalar calcExpression array required');
  const patch = {};
  for (const item of expression) {
    assert.equal(typeof item.field, 'string');
    assert.ok(Object.hasOwn(item, 'value'), 'scalar calculation value required');
    assert.ok(item.value === null || typeof item.value === 'string' || (typeof item.value === 'number' && Number.isFinite(item.value)));
    assert.deepEqual(Object.keys(item).sort(), ['field', 'value']);
    patch[item.field] = item.value;
  }
  const matched = rows.filter((r) => whereMatches(body.get('where') ?? '', r));
  for (const row of matched) { Object.assign(row, patch); onUpdate(patch, row); }
  return { success: true, updatedFeatureCount: matched.length };
}

const { Types } = require('mongoose');

// Query-string input is attacker-controlled: Express (via qs) happily turns
// `?search[$ne]=x` into an object and `?a=1&a=2` into an array, and a bare string can be
// a regex that throws. These helpers make a controller state what it expects, and turn
// anything else into a clean 400 instead of a database error (a 500) or a query operator.

class BadRequest extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
  }
}

/** A plain string (optionally bounded), or undefined when absent/empty. */
const str = (v, name = 'value', max = 100) => {
  if (v === undefined || v === null || v === '') return undefined;
  if (typeof v !== 'string') throw new BadRequest(`${name} must be a single value`);
  if (v.length > max) throw new BadRequest(`${name} is too long`);
  return v;
};

/** A 24-hex ObjectId string, or undefined. */
const oid = (v, name = 'id') => {
  const s = str(v, name, 24);
  if (s === undefined) return undefined;
  if (!Types.ObjectId.isValid(s) || !/^[0-9a-fA-F]{24}$/.test(s)) throw new BadRequest(`${name} is not a valid id`);
  return s;
};

/** A whole number within [min, max], or `def` when absent. */
const int = (v, { name = 'value', min = 0, max = 10 ** 9, def } = {}) => {
  const s = str(v, name, 12);
  if (s === undefined) return def;
  const n = Number(s);
  if (!Number.isInteger(n) || n < min || n > max) throw new BadRequest(`${name} must be a whole number between ${min} and ${max}`);
  return n;
};

/** A parseable date, or undefined. */
const date = (v, name = 'date') => {
  const s = str(v, name, 40);
  if (s === undefined) return undefined;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw new BadRequest(`${name} is not a valid date`);
  return d;
};

/** One of a fixed set of values, or undefined. */
const oneOf = (v, allowed, name = 'value') => {
  const s = str(v, name, 40);
  if (s === undefined) return undefined;
  if (!allowed.includes(s)) throw new BadRequest(`${name} must be one of: ${allowed.join(', ')}`);
  return s;
};

/** Makes user text safe to put inside a RegExp (so "(" is just a bracket, not a syntax error). */
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

module.exports = { BadRequest, str, oid, int, date, oneOf, escapeRegex };

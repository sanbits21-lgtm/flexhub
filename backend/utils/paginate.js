// Equipment/staff/membership-plan lists historically returned a plain array, and a lot
// of callers are dropdown fills that depend on exactly that shape. Pagination is
// therefore opt-in: pass ?page or ?limit to get { items, total, page, limit } instead
// of a bare array. Existing callers keep working untouched.
const wantsPagination = (req) => req.query.page !== undefined || req.query.limit !== undefined;

const pageParams = (req, { defaultLimit = 20 } = {}) => {
  // Anything that is not a clean positive number (arrays, objects, text, 0, negatives)
  // falls back to the default instead of reaching the database.
  const num = (v) => (typeof v === 'string' && /^\d{1,9}$/.test(v) ? Number(v) : NaN);
  const page = Math.max(1, num(req.query.page) || 1);
  // Capped so a client can't ask for the entire collection in one request.
  const limit = Math.min(200, Math.max(1, num(req.query.limit) || defaultLimit));
  return { page, limit };
};

// Runs the query either paginated or whole, and sends the appropriate shape.
const sendList = async (res, req, model, filter, { sort = { createdAt: -1 }, select } = {}) => {
  const build = () => {
    const q = model.find(filter).sort(sort);
    return select ? q.select(select) : q;
  };

  if (!wantsPagination(req)) return res.json(await build());

  const { page, limit } = pageParams(req);
  const [items, total] = await Promise.all([
    build().skip((page - 1) * limit).limit(limit),
    model.countDocuments(filter),
  ]);
  res.json({ items, total, page, limit });
};

module.exports = { wantsPagination, pageParams, sendList };

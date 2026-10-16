import { AppError } from './util.js';

export function parse(schema, data) {
  const r = schema.safeParse(data ?? {});
  if (!r.success) {
    const first = r.error.issues[0];
    throw new AppError(400, 'VALIDATION', first?.message || 'Please check what you entered.', {
      fields: r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }
  return r.data;
}

import { test as base, expect } from '@playwright/test';
import { createHash } from 'node:crypto';

// Each acceptance case represents a separate client. Only the isolated test API trusts this hop.
export const test = base.extend({
  context: async ({ context }, use, info) => {
    const digest = createHash('sha256').update(`${info.project.name}:${info.title}`).digest();
    await context.setExtraHTTPHeaders({
      'X-Forwarded-For': `10.${digest[0]}.${digest[1]}.${digest[2]}`,
    });
    await use(context);
  },
});
export { expect };

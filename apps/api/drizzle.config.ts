// drizzle-kit reads this to turn src/db/schema.ts into SQL migrations
// (`npm run db:generate`). It never connects to a database: migrations are
// applied by src/db/cli.ts, so the same files run on PGlite and on Postgres.
//
// drizzle-orm is also a root devDependency, on purpose. npm hoists drizzle-kit
// to the root node_modules but, in this workspace tree, left drizzle-orm in
// apps/api/node_modules, where drizzle-kit can't import it ("Please install
// latest version of drizzle-orm"). Declaring it at the root keeps one hoisted
// copy for both. Keep the two version ranges the same.
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
});

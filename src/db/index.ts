import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const connectionString =
  process.env["DATABASE_URL"] ?? "postgres://kamkazi:kamkazi@localhost:5433/kamkazi";

const pool = new Pool({ connectionString, max: 5 });

export const db = drizzle(pool, { schema });
export { pool, schema };

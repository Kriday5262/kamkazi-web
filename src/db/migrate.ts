/** Apply pending Drizzle migrations. Run: npm run db:migrate */
import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

const pool = new Pool({
  connectionString:
    process.env["DATABASE_URL"] ?? "postgres://kamkazi:kamkazi@localhost:5433/kamkazi",
});

try {
  await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  console.log("Migrations applied.");
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await pool.end();
}

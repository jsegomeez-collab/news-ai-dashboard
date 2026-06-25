// Borra y recrea la base de datos. Uso: npm run db:reset
import { rmSync } from "node:fs";
import { join } from "node:path";

for (const f of ["app.db", "app.db-wal", "app.db-shm"]) {
  try {
    rmSync(join(process.cwd(), "data", f));
  } catch {
    /* no existía */
  }
}
console.log("Base de datos eliminada. Se recreará al próximo arranque.");

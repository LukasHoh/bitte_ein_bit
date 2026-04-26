# customer_data

Local DuckDB store for the UNMAPPED app.

The frontend (TanStack Start server functions) opens a DuckDB connection at
`customer_data/app.duckdb` on first request and applies the schema in
`frontend/src/integrations/db/schema.ts` if the DB is empty.

Files generated here are gitignored — wipe them to reset the dev DB:

```bash
rm -f customer_data/app.duckdb customer_data/app.duckdb.wal
```

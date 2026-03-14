import pg from "pg"

const { Pool } = pg

export interface DbSchemaResult {
  success: boolean
  schema: string
  tableCount: number
  error?: string
}

interface ColumnInfo {
  table_name: string
  column_name: string
  data_type: string
  character_maximum_length: number | null
  is_nullable: string
  column_default: string | null
}

interface PrimaryKeyInfo {
  table_name: string
  column_name: string
}

interface ForeignKeyInfo {
  table_name: string
  column_name: string
  foreign_table_name: string
  foreign_column_name: string
}

interface UniqueConstraintInfo {
  table_name: string
  column_name: string
  constraint_name: string
}

interface EnumInfo {
  enum_name: string
  enum_value: string
}

function detectSupabaseUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return (
      parsed.hostname.includes("supabase") ||
      parsed.hostname.includes("pooler.supabase") ||
      parsed.port === "6543"
    )
  } catch {
    return false
  }
}

function formatColumnType(col: ColumnInfo): string {
  let type = col.data_type
  if (
    col.character_maximum_length &&
    (col.data_type === "character varying" || col.data_type === "character")
  ) {
    type =
      col.data_type === "character varying"
        ? `varchar(${col.character_maximum_length})`
        : `char(${col.character_maximum_length})`
  }
  // Shorten common PG type names
  const typeMap: Record<string, string> = {
    "character varying": "varchar",
    "timestamp without time zone": "timestamp",
    "timestamp with time zone": "timestamptz",
    "time without time zone": "time",
    "time with time zone": "timetz",
    integer: "int",
    boolean: "bool",
    "double precision": "float8",
    real: "float4",
    "USER-DEFINED": "enum",
  }
  if (!col.character_maximum_length && typeMap[type]) {
    type = typeMap[type]
  }
  return type
}

function formatDefault(defaultVal: string | null): string {
  if (!defaultVal) return ""
  // Simplify common defaults
  const simplified = defaultVal
    .replace(/^'([^']*)'::.*$/, "'$1'")
    .replace(/^nextval\(.*\)$/, "autoincrement")
    .replace(/^now\(\)$/, "now()")
    .replace(/^CURRENT_TIMESTAMP$/, "now()")
    .replace(/^gen_random_uuid\(\)$/, "gen_random_uuid()")
  return ` DEFAULT ${simplified}`
}

export async function introspectDatabaseSchema(
  databaseUrl: string,
  options?: { timeoutMs?: number; maxTables?: number }
): Promise<DbSchemaResult> {
  const timeoutMs = options?.timeoutMs ?? 10_000
  const maxTables = options?.maxTables ?? 100
  const MAX_SCHEMA_CHARS = 30_000

  const isSupabase = detectSupabaseUrl(databaseUrl)

  const pool = new Pool({
    connectionString: databaseUrl,
    max: 1,
    connectionTimeoutMillis: timeoutMs,
    idleTimeoutMillis: 5_000,
    ssl: isSupabase ? { rejectUnauthorized: false } : undefined,
    options: `-c statement_timeout=${timeoutMs}`,
  })

  try {
    // ── 1. Fetch tables ──────────────────────────────────────────────
    const tablesRes = await pool.query<{ table_name: string }>(
      `SELECT table_name
         FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
        ORDER BY table_name
        LIMIT $1`,
      [maxTables]
    )

    const tableNames = tablesRes.rows.map((r) => r.table_name)
    if (tableNames.length === 0) {
      return {
        success: true,
        schema: "## Database Schema\n\nNo tables found in public schema.",
        tableCount: 0,
      }
    }

    // ── 2. Fetch columns ─────────────────────────────────────────────
    const columnsRes = await pool.query<ColumnInfo>(
      `SELECT table_name, column_name, data_type,
              character_maximum_length, is_nullable, column_default
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = ANY($1)
        ORDER BY table_name, ordinal_position`,
      [tableNames]
    )

    // ── 3. Fetch primary keys ────────────────────────────────────────
    const pkRes = await pool.query<PrimaryKeyInfo>(
      `SELECT kcu.table_name, kcu.column_name
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        WHERE tc.constraint_type = 'PRIMARY KEY'
          AND tc.table_schema = 'public'
          AND tc.table_name = ANY($1)`,
      [tableNames]
    )

    // ── 4. Fetch foreign keys ────────────────────────────────────────
    const fkRes = await pool.query<ForeignKeyInfo>(
      `SELECT kcu.table_name, kcu.column_name,
              ccu.table_name AS foreign_table_name,
              ccu.column_name AS foreign_column_name
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
         JOIN information_schema.constraint_column_usage ccu
           ON tc.constraint_name = ccu.constraint_name
          AND tc.table_schema = ccu.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_schema = 'public'
          AND tc.table_name = ANY($1)`,
      [tableNames]
    )

    // ── 5. Fetch unique constraints ──────────────────────────────────
    const uniqueRes = await pool.query<UniqueConstraintInfo>(
      `SELECT kcu.table_name, kcu.column_name, tc.constraint_name
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        WHERE tc.constraint_type = 'UNIQUE'
          AND tc.table_schema = 'public'
          AND tc.table_name = ANY($1)`,
      [tableNames]
    )

    // ── 6. Fetch enums ───────────────────────────────────────────────
    const enumsRes = await pool.query<EnumInfo>(
      `SELECT t.typname AS enum_name, e.enumlabel AS enum_value
         FROM pg_type t
         JOIN pg_enum e ON t.oid = e.enumtypid
         JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public'
        ORDER BY t.typname, e.enumsortorder`
    )

    // ── Build lookup maps ────────────────────────────────────────────
    const pkSet = new Set(
      pkRes.rows.map((r) => `${r.table_name}.${r.column_name}`)
    )

    const fkMap = new Map<string, string>()
    for (const fk of fkRes.rows) {
      fkMap.set(
        `${fk.table_name}.${fk.column_name}`,
        `${fk.foreign_table_name}.${fk.foreign_column_name}`
      )
    }

    const uniqueSet = new Set(
      uniqueRes.rows.map((r) => `${r.table_name}.${r.column_name}`)
    )

    // Group columns by table
    const columnsByTable = new Map<string, ColumnInfo[]>()
    for (const col of columnsRes.rows) {
      if (!columnsByTable.has(col.table_name)) {
        columnsByTable.set(col.table_name, [])
      }
      columnsByTable.get(col.table_name)!.push(col)
    }

    // Group enums
    const enumMap = new Map<string, string[]>()
    for (const e of enumsRes.rows) {
      if (!enumMap.has(e.enum_name)) {
        enumMap.set(e.enum_name, [])
      }
      enumMap.get(e.enum_name)!.push(e.enum_value)
    }

    // ── Format output ────────────────────────────────────────────────
    const lines: string[] = [
      `## Database Schema (${tableNames.length} tables)`,
      "",
    ]

    for (const table of tableNames) {
      lines.push(`### ${table}`)

      const cols = columnsByTable.get(table) ?? []
      for (const col of cols) {
        const key = `${table}.${col.column_name}`
        const type = formatColumnType(col)
        const parts: string[] = [type]

        if (pkSet.has(key)) parts.push("PK")
        if (col.is_nullable === "NO" && !pkSet.has(key))
          parts.push("NOT NULL")
        if (uniqueSet.has(key)) parts.push("UNIQUE")
        parts.push(formatDefault(col.column_default))
        if (fkMap.has(key)) parts.push(`FK -> ${fkMap.get(key)}`)

        const suffix = parts.filter(Boolean).join(" ")
        lines.push(`- ${col.column_name}: ${suffix}`)
      }

      lines.push("")
    }

    // Enums section
    if (enumMap.size > 0) {
      lines.push("### Enums")
      for (const [name, values] of enumMap.entries()) {
        lines.push(`- ${name}: ${values.join(", ")}`)
      }
      lines.push("")
    }

    let schema = lines.join("\n")

    // Truncate if too long
    if (schema.length > MAX_SCHEMA_CHARS) {
      schema =
        schema.slice(0, MAX_SCHEMA_CHARS) +
        "\n\n... [Schema truncated at 30,000 chars. Query specific tables for full details.]"
    }

    return {
      success: true,
      schema,
      tableCount: tableNames.length,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      success: false,
      schema: "",
      tableCount: 0,
      error: `Database introspection failed: ${message}`,
    }
  } finally {
    await pool.end().catch(() => {
      /* ignore close errors */
    })
  }
}

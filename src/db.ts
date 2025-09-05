import { Pool } from 'pg'

const { DATABASE_URL } = process.env
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL faltante en .env')
}

export const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})

pool.on('error', (err: Error) => { // <-- CORRECCIÓN AQUÍ
  console.error('DB pool error:', err)
})

// Ping de inicio (solo log)
;(async () => {
  try {
    const { rows } = await pool.query(
      'select now() as now, current_user, current_database() as db'
    )
    console.log('DB OK:', {
      now: rows[0].now,
      current_user: rows[0].current_user,
      current_database: rows[0].db,
    })
  } catch (e) {
    console.error('DB FAIL al iniciar:', e)
  }
})()

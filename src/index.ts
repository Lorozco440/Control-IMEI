import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import ExcelJS from 'exceljs'
import { pool } from './db.js'
import { fileURLToPath } from 'url'

// --- App ---
const app = express()
const PORT = Number(process.env.PORT || 3001)
const JWT_SECRET = process.env.JWT_SECRET || 'default_secret'

app.use(cors({ origin: true }))
app.use(express.json())

// --- Servir /public ---
const PUBLIC_DIR = fileURLToPath(new URL('../public', import.meta.url))
app.use(express.static(PUBLIC_DIR))
app.get('/', (_req, res) => res.sendFile(fileURLToPath(new URL('../public/login.html', import.meta.url))))
app.get('/admin', (_req, res) => res.sendFile(fileURLToPath(new URL('../public/admin/login.html', import.meta.url))))

// --- Middleware de Autenticación para Admin ---
import { Request, Response, NextFunction } from 'express';

const authenticateAdmin = (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (authHeader) {
        const token = authHeader.split(' ')[1];
        jwt.verify(token, JWT_SECRET, (err, user) => {
            if (err) return res.sendStatus(403);
            (req as any).user = user;
            next();
        });
    } else {
        res.sendStatus(401);
    }
};

// --- Endpoints Públicos (Clientes) ---
app.post('/api/clientes/login', async (req, res) => {
    const { codigo_sap } = req.body;
    if (!codigo_sap) return res.status(400).json({ ok: false, error: 'codigo_sap es requerido' });
    try {
        const { rows } = await pool.query('SELECT codigo_sap, nombre_negocio FROM "Clientes" WHERE codigo_sap = $1', [codigo_sap]);
        if (rows.length === 0) return res.status(404).json({ ok: false, error: 'Cliente no encontrado' });
        res.json({ ok: true, cliente: rows[0] });
    } catch (err) { res.status(500).json({ ok: false, error: 'error_interno' }); }
});
app.get('/api/bajas/activas', async (_req, res) => {
    try {
        const query = `
            SELECT b.id, b.nombre_baja, json_agg(json_build_object('id', m.id, 'nombre_modelo', m.nombre_modelo)) as modelos
            FROM "Bajas" b JOIN "Bajas_Modelos" bm ON b.id = bm.baja_id JOIN "Modelos" m ON bm.modelo_id = m.id
            WHERE b.esta_activa = TRUE GROUP BY b.id ORDER BY b.fecha_baja DESC;
        `;
        const { rows } = await pool.query(query);
        res.json({ ok: true, bajas: rows });
    } catch (err) { res.status(500).json({ ok: false, error: 'error_interno' }); }
});
app.post('/api/imeis/registrar', async (req, res) => {
    const { cliente_sap, registros, baja_id } = req.body;
    if (!cliente_sap || !registros || !Array.isArray(registros) || registros.length === 0 || !baja_id) {
        return res.status(400).json({ ok: false, error: 'Datos incompletos' });
    }
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const query = 'INSERT INTO "Imeis_registrados" (imei, cliente_sap, modelo_id, baja_id, fecha_registro) VALUES ($1, $2, $3, $4, NOW())';
        for (const registro of registros) {
            await client.query(query, [registro.imei, cliente_sap, registro.modelo_id, baja_id]);
        }
        await client.query('COMMIT');
        res.status(201).json({ ok: true, message: `${registros.length} IMEIs registrados.` });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ ok: false, error: 'error_interno' });
    } finally {
        client.release();
    }
});

// --- Endpoint de Login para Admin ---
app.post('/api/admin/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const { rows } = await pool.query('SELECT id, username, password_hash FROM "Admins" WHERE username = $1', [username]);
        if (rows.length === 0) return res.status(401).json({ error: 'Credenciales incorrectas' });
        const admin = rows[0];
        const match = await bcrypt.compare(password, admin.password_hash);
        if (match) {
            const token = jwt.sign({ id: admin.id, username: admin.username }, JWT_SECRET, { expiresIn: '8h' });
            res.json({ ok: true, token });
        } else {
            res.status(401).json({ error: 'Credenciales incorrectas' });
        }
    } catch (err) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

// --- Endpoints Protegidos para Admin ---
const adminRouter = express.Router();
adminRouter.use(authenticateAdmin);

// --- Gestión de Modelos ---
adminRouter.get('/modelos', async (_req, res) => {
    const { rows } = await pool.query('SELECT * FROM "Modelos" ORDER BY nombre_modelo');
    res.json({ ok: true, modelos: rows });
});
adminRouter.post('/modelos', async (req, res) => {
    const { nombre_modelo } = req.body;
    if (!nombre_modelo) {
        return res.status(400).json({ ok: false, error: 'El nombre del modelo es requerido.' });
    }
    try {
        const { rows } = await pool.query('INSERT INTO "Modelos" (nombre_modelo) VALUES ($1) RETURNING *', [nombre_modelo]);
        res.status(201).json({ ok: true, modelo: rows[0] });
    } catch (err) {
        if (typeof err === 'object' && err !== null && 'code' in err && (err as any).code === '23505') {
            return res.status(409).json({ ok: false, error: 'Ya existe un modelo con ese nombre.' });
        }
        res.status(500).json({ ok: false, error: 'Error interno del servidor' });
    }
});
adminRouter.put('/modelos/:id', async (req, res) => {
    const { nombre_modelo } = req.body;
    const { rows } = await pool.query('UPDATE "Modelos" SET nombre_modelo = $1 WHERE id = $2 RETURNING *', [nombre_modelo, req.params.id]);
    res.json({ ok: true, modelo: rows[0] });
});
adminRouter.delete('/modelos/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM "Modelos" WHERE id = $1', [req.params.id]);
        res.json({ ok: true });
    } catch (err) {
        if (typeof err === 'object' && err !== null && 'code' in err && (err as any).code === '23503') {
            return res.status(409).json({ ok: false, error: 'No se puede eliminar un modelo que está asignado a una campaña.' });
        }
        res.status(500).json({ ok: false, error: 'error_interno' });
    }
});

// --- Gestión de Campañas (Bajas) ---
adminRouter.get('/bajas', async (_req, res) => {
    const query = `
        SELECT b.*, COALESCE(json_agg(m.*) FILTER (WHERE m.id IS NOT NULL), '[]') as modelos
        FROM "Bajas" b LEFT JOIN "Bajas_Modelos" bm ON b.id = bm.baja_id LEFT JOIN "Modelos" m ON bm.modelo_id = m.id
        GROUP BY b.id ORDER BY b.fecha_baja DESC;
    `;
    const { rows } = await pool.query(query);
    res.json({ ok: true, bajas: rows });
});
adminRouter.post('/bajas', async (req, res) => {
    const { nombre_baja, fecha_baja } = req.body;
    const { rows } = await pool.query('INSERT INTO "Bajas" (nombre_baja, fecha_baja) VALUES ($1, $2) RETURNING *', [nombre_baja, fecha_baja]);
    res.status(201).json({ ok: true, baja: rows[0] });
});
adminRouter.put('/bajas/:id/toggle', async (req, res) => {
    const { rows } = await pool.query('UPDATE "Bajas" SET esta_activa = NOT esta_activa WHERE id = $1 RETURNING *', [req.params.id]);
    res.json({ ok: true, baja: rows[0] });
});
adminRouter.post('/bajas/:baja_id/modelos', async (req, res) => {
    await pool.query('INSERT INTO "Bajas_Modelos" (baja_id, modelo_id) VALUES ($1, $2)', [req.params.baja_id, req.body.modelo_id]);
    res.status(201).json({ ok: true });
});
adminRouter.delete('/bajas/:baja_id/modelos/:modelo_id', async (req, res) => {
    await pool.query('DELETE FROM "Bajas_Modelos" WHERE baja_id = $1 AND modelo_id = $2', [req.params.baja_id, req.params.modelo_id]);
    res.json({ ok: true });
});
adminRouter.put('/bajas/:id', async (req, res) => {
    const { nombre_baja, fecha_baja } = req.body;
    const { rows } = await pool.query('UPDATE "Bajas" SET nombre_baja = $1, fecha_baja = $2 WHERE id = $3 RETURNING *', [nombre_baja, fecha_baja, req.params.id]);
    res.json({ ok: true, baja: rows[0] });
});
adminRouter.delete('/bajas/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM "Bajas" WHERE id = $1', [req.params.id]);
        res.json({ ok: true, message: 'Campaña eliminada' });
    } catch (err) {
        if (typeof err === 'object' && err !== null && 'code' in err && (err as any).code === '23503') {
            return res.status(409).json({ ok: false, error: 'No se puede eliminar una campaña que ya tiene IMEIs registrados.' });
        }
        res.status(500).json({ ok: false, error: 'error_interno' });
    }
});

// --- INICIO: ENDPOINTS COMPLETOS PARA GESTIÓN DE CLIENTES ---
adminRouter.get('/clientes', async (_req, res) => {
    try {
        const { rows } = await pool.query('SELECT * FROM "Clientes" ORDER BY nombre_negocio ASC');
        res.json({ ok: true, clientes: rows });
    } catch (err) {
        res.status(500).json({ ok: false, error: 'Error interno del servidor' });
    }
});

adminRouter.post('/clientes', async (req, res) => {
    const { codigo_sap, nombre_negocio } = req.body;
    if (!codigo_sap || !nombre_negocio) {
        return res.status(400).json({ ok: false, error: 'Código SAP y Nombre son requeridos' });
    }
    try {
        const { rows } = await pool.query(
            'INSERT INTO "Clientes" (codigo_sap, nombre_negocio) VALUES ($1, $2) RETURNING *',
            [codigo_sap.toUpperCase(), nombre_negocio]
        );
        res.status(201).json({ ok: true, cliente: rows[0] });
    } catch (err) {
        if (typeof err === 'object' && err !== null && 'code' in err && (err as any).code === '23505') {
            return res.status(409).json({ ok: false, error: 'El Código SAP ya existe' });
        }
        res.status(500).json({ ok: false, error: 'Error interno del servidor' });
    }
});

adminRouter.put('/clientes/:id', async (req, res) => {
    const { id } = req.params;
    const { codigo_sap, nombre_negocio } = req.body;
    if (!codigo_sap || !nombre_negocio) {
        return res.status(400).json({ ok: false, error: 'Código SAP y Nombre son requeridos' });
    }
    try {
        const { rows } = await pool.query(
            'UPDATE "Clientes" SET codigo_sap = $1, nombre_negocio = $2 WHERE id = $3 RETURNING *',
            [codigo_sap.toUpperCase(), nombre_negocio, id]
        );
        if (rows.length === 0) {
            return res.status(404).json({ ok: false, error: 'Cliente no encontrado' });
        }
        res.json({ ok: true, cliente: rows[0] });
    } catch (err) {
        if (typeof err === 'object' && err !== null && 'code' in err && (err as any).code === '23505') {
            return res.status(409).json({ ok: false, error: 'El Código SAP ya existe' });
        }
        res.status(500).json({ ok: false, error: 'Error interno del servidor' });
    }
});

adminRouter.delete('/clientes/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const registros = await pool.query('SELECT id FROM "Imeis_registrados" WHERE cliente_sap = (SELECT codigo_sap FROM "Clientes" WHERE id = $1) LIMIT 1', [id]);
        if (registros.rows.length > 0) {
            return res.status(409).json({ ok: false, error: 'No se puede eliminar un cliente con IMEIs ya registrados.' });
        }
        const result = await pool.query('DELETE FROM "Clientes" WHERE id = $1', [id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ ok: false, error: 'Cliente no encontrado' });
        }
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ ok: false, error: 'Error interno del servidor' });
    }
});
// --- FIN: ENDPOINTS COMPLETOS PARA GESTIÓN DE CLIENTES ---

// --- Gestión de Registros ---
adminRouter.get('/registros', async (req, res) => {
    const { page = 1, limit = 10, bajaId, search } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    let whereClauses = [];
    let queryParams = [];
    let paramIndex = 1;
    if (bajaId) { whereClauses.push(`b.id = $${paramIndex++}`); queryParams.push(bajaId); }
    if (search) {
        whereClauses.push(`(i.imei ILIKE $${paramIndex} OR c.nombre_negocio ILIKE $${paramIndex} OR c.codigo_sap ILIKE $${paramIndex})`);
        queryParams.push(`%${search}%`);
        paramIndex++;
    }
    const whereString = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
    try {
        const dataQuery = `
            SELECT i.imei, i.fecha_registro, c.nombre_negocio, c.codigo_sap, m.nombre_modelo, b.nombre_baja, b.fecha_baja
            FROM "Imeis_registrados" i JOIN "Clientes" c ON i.cliente_sap = c.codigo_sap JOIN "Modelos" m ON i.modelo_id = m.id JOIN "Bajas" b ON i.baja_id = b.id
            ${whereString} ORDER BY i.fecha_registro DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++};
        `;
        const countQuery = `SELECT COUNT(i.id) FROM "Imeis_registrados" i JOIN "Clientes" c ON i.cliente_sap = c.codigo_sap JOIN "Modelos" m ON i.modelo_id = m.id JOIN "Bajas" b ON i.baja_id = b.id ${whereString};`;
        const dataResult = await pool.query(dataQuery, [...queryParams, limit, offset]);
        const countResult = await pool.query(countQuery, queryParams.slice(0, paramIndex - 3));
        const totalItems = parseInt(countResult.rows[0].count, 10);
        const totalPages = Math.ceil(totalItems / Number(limit));
        res.json({ ok: true, registros: dataResult.rows, pagination: { currentPage: Number(page), totalPages, totalItems } });
    } catch (err) { res.status(500).json({ ok: false, error: 'error_interno' }); }
});

adminRouter.get('/registros/export', async (req, res) => {
    const { bajaId, search } = req.query;
    let whereClauses = [];
    let queryParams = [];
    let paramIndex = 1;
    if (bajaId) { whereClauses.push(`b.id = $${paramIndex++}`); queryParams.push(bajaId); }
    if (search) {
        whereClauses.push(`(i.imei ILIKE $${paramIndex} OR c.nombre_negocio ILIKE $${paramIndex} OR c.codigo_sap ILIKE $${paramIndex})`);
        queryParams.push(`%${search}%`);
    }
    const whereString = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
    try {
        const query = `
            SELECT c.codigo_sap, m.nombre_modelo, i.imei, b.fecha_baja
            FROM "Imeis_registrados" i JOIN "Clientes" c ON i.cliente_sap = c.codigo_sap JOIN "Modelos" m ON i.modelo_id = m.id JOIN "Bajas" b ON i.baja_id = b.id
            ${whereString} ORDER BY b.fecha_baja, c.codigo_sap, m.nombre_modelo;
        `;
        const { rows } = await pool.query(query, queryParams);
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('IMEIs');
        worksheet.columns = [
            { header: 'Código SAP', key: 'codigo_sap', width: 15 },
            { header: 'Modelo', key: 'nombre_modelo', width: 30 },
            { header: 'IMEI', key: 'imei', width: 20 },
            { header: 'Fecha Campaña', key: 'fecha_baja', width: 15, style: { numFmt: 'dd/mm/yyyy' } }
        ];
        worksheet.addRows(rows);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="reporte_imeis.xlsx"');
        await workbook.xlsx.write(res);
        res.end();
    } catch (err) { res.status(500).send('Error al generar el archivo Excel'); }
});

app.use('/api/admin', adminRouter);

// --- 404 Handler ---
app.use((req, res) => { res.status(404).json({ error: 'Not found', path: req.path }) })

// --- Start Server ---
app.listen(PORT, () => { console.log(`API en http://localhost:${PORT}`) })

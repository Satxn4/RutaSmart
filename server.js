const express = require('express');
const mysql = require('mysql2');
const cors = require('cors'); // Necesario para permitir peticiones desde tu frontend
const app = express();

// Middleware para habilitar CORS y leer datos JSON
app.use(cors());
app.use(express.json());

// === Configuración de la conexión a MySQL ===
// Cambia estos valores por los de tu base de datos
const db = mysql.createConnection({
  host: 'localhost',
  user: 'root', // Por defecto en XAMPP, WAMP, etc.
  password: '', // Por defecto en XAMPP, WAMP, etc.
  database: 'rutasmart'
});

db.connect(err => {
  if (err) {
    console.error('Error al conectar a MySQL:', err);
    return;
  }
  console.log('Conectado a la base de datos MySQL exitosamente.');
});

// === Rutas de la API ===

// GET /api/trabajadores
// Obtiene la lista completa de trabajadores
app.get('/api/trabajadores', (req, res) => {
  const sql = 'SELECT * FROM trabajadores';
  db.query(sql, (err, results) => {
    if (err) {
      console.error('Error al obtener trabajadores:', err);
      return res.status(500).json({ error: 'Error al obtener datos' });
    }
    res.json(results);
  });
});

// POST /api/trabajadores
// Agrega un nuevo trabajador a la base de datos
app.post('/api/trabajadores', (req, res) => {
  const { nombre, telefono, direccion, dia, turno, notas, lat, lng } = req.body;
  if (!nombre || !telefono || !direccion || !dia || !turno) {
    return res.status(400).json({ error: 'Faltan campos requeridos.' });
  }

  const sql = 'INSERT INTO trabajadores (nombre, telefono, direccion, dia, turno, notas, lat, lng) VALUES (?, ?, ?, ?, ?, ?, ?, ?)';
  db.query(sql, [nombre, telefono, direccion, dia, turno, notas, lat, lng], (err, result) => {
    if (err) {
      console.error('Error al insertar trabajador:', err);
      return res.status(500).json({ error: 'Error al guardar el trabajador' });
    }
    res.status(201).json({ message: 'Trabajador agregado con éxito', id: result.insertId });
  });
});

// PUT /api/trabajadores/:id
// Actualiza los datos de un trabajador
app.put('/api/trabajadores/:id', (req, res) => {
    const { id } = req.params;
    const { nombre, telefono, direccion, dia, turno, notas, lat, lng } = req.body;
    if (!nombre || !telefono || !direccion || !dia || !turno) {
        return res.status(400).json({ error: 'Faltan campos requeridos.' });
    }
    
    const sql = 'UPDATE trabajadores SET nombre=?, telefono=?, direccion=?, dia=?, turno=?, notas=?, lat=?, lng=? WHERE id = ?';
    db.query(sql, [nombre, telefono, direccion, dia, turno, notas, lat, lng, id], (err, result) => {
        if (err) {
            console.error('Error al actualizar trabajador:', err);
            return res.status(500).json({ error: 'Error al actualizar el trabajador' });
        }
        res.json({ message: 'Trabajador actualizado con éxito' });
    });
});

// DELETE /api/trabajadores/:id
// Elimina un trabajador
app.delete('/api/trabajadores/:id', (req, res) => {
    const { id } = req.params;
    const sql = 'DELETE FROM trabajadores WHERE id = ?';
    db.query(sql, [id], (err, result) => {
        if (err) {
            console.error('Error al eliminar trabajador:', err);
            return res.status(500).json({ error: 'Error al eliminar el trabajador' });
        }
        res.json({ message: 'Trabajador eliminado con éxito' });
    });
});

// Inicia el servidor
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});

// Importa la librería para conectar con PostgreSQL
// Asegúrate de instalarla primero ejecutando: npm install postgres
import postgres from 'postgres';
import 'dotenv/config'; // Para cargar variables de entorno desde un archivo .env

// --- IMPORTANTE ---
// Debes crear un archivo .env en la raíz de tu proyecto con tu cadena de conexión de Neon:
// NETLIFY_DATABASE_URL="postgres://user:password@host:port/dbname?sslmode=require"

// Conecta a tu base de datos Neon
// CORRECCIÓN: Usamos 'NETLIFY_DATABASE_URL' para que coincida con lo que tienes en el archivo .env
const sql = postgres(process.env.NETLIFY_DATABASE_URL, {
  ssl: 'require',
});

async function setupDatabase() {
  console.log('Creando tablas en la base de datos...');
  try {
    // Crea la tabla de productos si no existe
    await sql`
      CREATE TABLE IF NOT EXISTS products (
        "id" SERIAL PRIMARY KEY,
        "nombre" VARCHAR(255) NOT NULL,
        "sku" VARCHAR(100) UNIQUE,
        "precioVenta" NUMERIC(10, 2) NOT NULL,
        "precioCompra" NUMERIC(10, 2),
        "precioMayoreo" NUMERIC(10, 2),
        "cantidad" INTEGER NOT NULL,
        "codigoBarras" VARCHAR(255) UNIQUE,
        "urlFoto1" TEXT
      );
    `;
    console.log('Tabla "products" creada o ya existente.');

    // Crea la tabla de ventas si no existe
    await sql`
      CREATE TABLE IF NOT EXISTS sales (
        "id" SERIAL PRIMARY KEY,
        "saleId" VARCHAR(50) UNIQUE NOT NULL,
        "fechaVenta" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        "nombreCliente" VARCHAR(255),
        "contacto" VARCHAR(100),
        "nitCi" VARCHAR(100),
        "totalVenta" NUMERIC(10, 2) NOT NULL,
        "productosVendidos" JSONB,
        "estado" VARCHAR(50) DEFAULT 'Completada'
      );
    `;
    console.log('Tabla "sales" creada o ya existente.');
    
    console.log('¡Configuración de la base de datos completada!');
  } catch (error) {
    console.error('Error configurando la base de datos:', error);
  } finally {
    // Cierra la conexión
    await sql.end();
  }
}

setupDatabase();

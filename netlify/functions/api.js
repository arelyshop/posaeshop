// Carga la librería de postgres y dotenv.
const postgres = require('postgres');
require('dotenv').config();

// Obtiene la URL de la base de datos desde las variables de entorno de Netlify.
const sql = postgres(process.env.NETLIFY_DATABASE_URL, { ssl: 'require' });

// Define la función principal que Netlify ejecutará.
exports.handler = async (event) => {
  // Configura los encabezados para permitir el acceso desde cualquier origen (CORS).
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Content-Type': 'application/json',
  };

  // Maneja las solicitudes OPTIONS de pre-vuelo para CORS.
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers,
      body: '',
    };
  }

  // Divide la ruta de la solicitud para determinar la acción a realizar.
  const pathParts = event.path.replace('/.netlify/functions/api', '').split('/');
  const resource = pathParts[1]; // El recurso principal (ej: 'products' o 'sales').
  const action = pathParts[2]; // Acción específica (ej: 'annul').

  try {
    // --- MANEJO DE PRODUCTOS ---
    if (resource === 'products') {
      // OBTENER TODOS LOS PRODUCTOS
      if (event.httpMethod === 'GET') {
        const products = await sql`
            SELECT id, nombre, sku, "precioVenta", "precioCompra", "precioMayoreo", cantidad, "codigoBarras", "urlFoto1" 
            FROM products ORDER BY nombre ASC`;
        return { statusCode: 200, headers, body: JSON.stringify({ status: 'success', data: products }) };
      }
      // AÑADIR UN NUEVO PRODUCTO
      if (event.httpMethod === 'POST') {
        const { data } = JSON.parse(event.body);
        await sql`INSERT INTO products (nombre, sku, "precioVenta", "precioCompra", "precioMayoreo", cantidad, "codigoBarras", "urlFoto1") 
                   VALUES (${data.nombre}, ${data.sku}, ${data.precioVenta}, ${data.precioCompra}, ${data.precioMayoreo}, ${data.cantidad}, ${data.codigoBarras}, ${data.urlFoto1})`;
        return { statusCode: 201, headers, body: JSON.stringify({ status: 'success', message: 'Producto añadido' }) };
      }
      // ACTUALIZAR UN PRODUCTO
      if (event.httpMethod === 'PUT') {
        const { data } = JSON.parse(event.body);
        await sql`UPDATE products SET 
                   nombre = ${data.nombre}, sku = ${data.sku}, "precioVenta" = ${data.precioVenta}, "precioCompra" = ${data.precioCompra}, 
                   "precioMayoreo" = ${data.precioMayoreo}, cantidad = ${data.cantidad}, "codigoBarras" = ${data.codigoBarras}, "urlFoto1" = ${data.urlFoto1} 
                   WHERE sku = ${data.originalSku}`;
        return { statusCode: 200, headers, body: JSON.stringify({ status: 'success', message: 'Producto actualizado' }) };
      }
    }

    // --- MANEJO DE VENTAS ---
    if (resource === 'sales') {
      // ANULAR UNA VENTA
      if (action === 'annul' && event.httpMethod === 'PUT') {
        const { data } = JSON.parse(event.body);
        const { saleId } = data;

        await sql.begin(async (sql) => {
          const saleToAnnul = await sql`SELECT "productosVendidos" FROM sales WHERE "saleId" = ${saleId}`;
          if (saleToAnnul.length === 0) throw new Error('Venta no encontrada');
          
          const productsSold = typeof saleToAnnul[0].productosVendidos === 'string' 
              ? JSON.parse(saleToAnnul[0].productosVendidos) 
              : saleToAnnul[0].productosVendidos;

          for (const item of productsSold) {
            await sql`UPDATE products SET cantidad = cantidad + ${item.cantidad} WHERE sku = ${item.SKU}`;
          }

          await sql`UPDATE sales SET estado = 'Anulada' WHERE "saleId" = ${saleId}`;
        });

        return { statusCode: 200, headers, body: JSON.stringify({ status: 'success', message: 'Venta anulada y stock restaurado' }) };
      }

      // OBTENER TODAS LAS VENTAS
      if (event.httpMethod === 'GET') {
        const sales = await sql`SELECT id, "saleId", "fechaVenta", "nombreCliente", contacto, "nitCi", "totalVenta", "productosVendidos", estado FROM sales ORDER BY "fechaVenta" DESC`;
        return { statusCode: 200, headers, body: JSON.stringify({ status: 'success', data: sales }) };
      }
      // REGISTRAR UNA NUEVA VENTA
      if (event.httpMethod === 'POST') {
        const { data } = JSON.parse(event.body);
        const { customer, items, total } = data;
        
        let newSaleId = 'AS1';
        const lastSale = await sql`SELECT "saleId" FROM sales ORDER BY id DESC LIMIT 1`;
        if (lastSale.length > 0) {
          const lastIdNumber = parseInt(lastSale[0].saleId.substring(2));
          newSaleId = 'AS' + (lastIdNumber + 1);
        }

        await sql.begin(async (sql) => {
          await sql`INSERT INTO sales ("saleId", "nombreCliente", contacto, "nitCi", "totalVenta", "productosVendidos", estado) 
                     VALUES (${newSaleId}, ${customer.name}, ${customer.contact}, ${customer.id}, ${total}, ${JSON.stringify(items)}, 'Completada')`;
          
          for (const item of items) {
            await sql`UPDATE products SET cantidad = cantidad - ${item.cantidad} WHERE sku = ${item.SKU}`;
          }
        });

        return { statusCode: 201, headers, body: JSON.stringify({ status: 'success', message: 'Venta registrada', saleId: newSaleId }) };
      }
    }
    
    // Si no se encuentra la ruta, devuelve un error 404.
    return { statusCode: 404, headers, body: JSON.stringify({ status: 'error', message: 'Ruta no encontrada' }) };

  } catch (error) {
    console.error('Error en la API:', error);
    // Devuelve un error 500 si algo sale mal.
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ status: 'error', message: error.message || 'Error interno del servidor' }),
    };
  }
};


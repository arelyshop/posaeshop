import postgres from 'postgres';

// La URL de la base de datos se obtiene de las variables de entorno de Netlify
// CORRECCIÓN: Usamos 'NETLIFY_DATABASE_URL' que es el nombre que la integración de Neon crea.
const sql = postgres(process.env.NETLIFY_DATABASE_URL, {
  ssl: 'require',
});

// Función principal que maneja todas las peticiones
export async function handler(event) {
  const path = event.path.replace('/.netlify/functions/api', '');
  const method = event.httpMethod;
  const body = event.body ? JSON.parse(event.body) : {};

  try {
    // --- RUTAS DE PRODUCTOS ---
    if (path === '/products' && method === 'GET') {
      const products = await sql`SELECT * FROM products ORDER BY nombre ASC`;
      return { statusCode: 200, body: JSON.stringify({ status: 'success', data: products }) };
    }
    if (path === '/products' && method === 'POST') {
      const p = body.data;
      await sql`INSERT INTO products ("nombre", "sku", "precioVenta", "precioCompra", "precioMayoreo", "cantidad", "codigoBarras", "urlFoto1")
                 VALUES (${p.nombre}, ${p.sku || null}, ${p.precioVenta}, ${p.precioCompra || null}, ${p.precioMayoreo || null}, ${p.cantidad}, ${p.codigoBarras || null}, ${p.urlFoto1 || null})`;
      return { statusCode: 200, body: JSON.stringify({ status: 'success', message: 'Producto añadido' }) };
    }
     if (path === '/products' && method === 'PUT') {
      const p = body.data;
      await sql`UPDATE products SET
                  "nombre" = ${p.nombre}, "sku" = ${p.sku}, "precioVenta" = ${p.precioVenta}, "precioCompra" = ${p.precioCompra},
                  "precioMayoreo" = ${p.precioMayoreo}, "cantidad" = ${p.cantidad}, "codigoBarras" = ${p.codigoBarras}, "urlFoto1" = ${p.urlFoto1}
                 WHERE "sku" = ${p.originalSku}`;
      return { statusCode: 200, body: JSON.stringify({ status: 'success', message: 'Producto actualizado' }) };
    }

    // --- RUTAS DE VENTAS ---
    if (path === '/sales' && method === 'GET') {
      const sales = await sql`SELECT * FROM sales ORDER BY "fechaVenta" DESC`;
      return { statusCode: 200, body: JSON.stringify({ status: 'success', data: sales }) };
    }
    if (path === '/sales' && method === 'POST') {
        const sale = body.data;
        
        // Iniciar una transacción para asegurar la consistencia de los datos
        const result = await sql.begin(async sql => {
            // 1. Obtener el último ID de venta para generar el siguiente
            const lastSale = await sql`SELECT "saleId" FROM sales ORDER BY id DESC LIMIT 1`;
            let nextIdNumber = 1;
            if (lastSale.length > 0) {
                const lastIdNumber = parseInt(lastSale[0].saleId.substring(2));
                if (!isNaN(lastIdNumber)) {
                    nextIdNumber = lastIdNumber + 1;
                }
            }
            const newSaleId = `AS${nextIdNumber}`;

            // 2. Insertar la nueva venta
            await sql`INSERT INTO sales ("saleId", "nombreCliente", "contacto", "nitCi", "totalVenta", "productosVendidos")
                       VALUES (${newSaleId}, ${sale.customer.name}, ${sale.customer.contact}, ${sale.customer.id}, ${sale.total}, ${JSON.stringify(sale.items)})`;
            
            // 3. Actualizar el stock de cada producto vendido
            for (const item of sale.items) {
                await sql`UPDATE products SET cantidad = cantidad - ${item.cantidad} WHERE sku = ${item.SKU}`;
            }
            
            return { saleId: newSaleId };
        });

        return { statusCode: 200, body: JSON.stringify({ status: 'success', saleId: result.saleId }) };
    }
    if (path.startsWith('/sales/annul') && method === 'PUT') {
        const saleId = body.data.saleId;

        await sql.begin(async sql => {
            // 1. Obtener los detalles de la venta a anular
            const saleToAnnul = await sql`SELECT "productosVendidos" FROM sales WHERE "saleId" = ${saleId} AND "estado" != 'Anulada'`;
            if (saleToAnnul.length === 0) {
                throw new Error('Venta no encontrada o ya ha sido anulada.');
            }
            const items = saleToAnnul[0].productosVendidos;

            // 2. Restaurar el stock de cada producto
            for (const item of items) {
                await sql`UPDATE products SET cantidad = cantidad + ${item.cantidad} WHERE sku = ${item.SKU}`;
            }

            // 3. Actualizar el estado de la venta a 'Anulada'
            await sql`UPDATE sales SET estado = 'Anulada' WHERE "saleId" = ${saleId}`;
        });

        return { statusCode: 200, body: JSON.stringify({ status: 'success', message: `Venta ${saleId} anulada con éxito.` }) };
    }
    
    // --- RUTA DE CONFIGURACIÓN ---
    if (path === '/config' && method === 'GET') {
        // La URL del QR ahora se gestiona como una variable de entorno en Netlify
        const qrUrl = process.env.QR_CODE_URL || 'https://placehold.co/192x192/e2e8f0/94a3b8?text=QR+NO+CONFIGURADO';
        return { statusCode: 200, body: JSON.stringify({ qrUrl }) };
    }

    // Si no se encuentra la ruta
    return { statusCode: 404, body: 'Ruta no encontrada' };

  } catch (error) {
    console.error('Error en la función API:', error);
    return { statusCode: 500, body: JSON.stringify({ status: 'error', message: error.message }) };
  }
}

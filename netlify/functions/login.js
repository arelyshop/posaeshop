// Carga la librería de postgres y dotenv.
const postgres = require('postgres');
require('dotenv').config();

// Obtiene la URL de la base de datos desde las variables de entorno de Netlify.
const sql = postgres(process.env.NETLIFY_DATABASE_URL, { ssl: 'require' });

// Define la función principal que Netlify ejecutará para el login.
exports.handler = async (event) => {
  // Configura los encabezados para permitir el acceso desde cualquier origen (CORS).
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
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
  
  // Solo permite solicitudes POST.
  if (event.httpMethod !== 'POST') {
    return {
        statusCode: 405,
        headers,
        body: JSON.stringify({ status: 'error', message: 'Método no permitido' })
    };
  }

  try {
    const { username, password } = JSON.parse(event.body);
    
    // Busca al usuario en la nueva tabla 'users'.
    const users = await sql`
        SELECT username, "fullName", role FROM users 
        WHERE username = ${username} AND password = ${password}`; // Nota: En una app real, las contraseñas deberían estar encriptadas (hashed).

    if (users.length > 0) {
      // Si se encuentra el usuario, devuelve sus datos.
      const user = users[0];
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
            status: 'success', 
            user: {
                username: user.username,
                fullName: user.fullName,
                role: user.role
            }
        }),
      };
    } else {
      // Si no se encuentra, devuelve un error de autorización.
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ status: 'error', message: 'Usuario o contraseña incorrectos' }),
      };
    }

  } catch (error) {
    console.error('Error en la función de login:', error);
    // Devuelve un error 500 si algo sale mal.
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ status: 'error', message: error.message || 'Error interno del servidor' }),
    };
  }
};

require('dotenv').config({ path: __dirname + '/../../.env' });
const { Pool } = require('pg');


    //configuracion de la conexion a la BD

    const pool = new Pool({
        user: process.env.DB_USER,
        host: process.env.DB_HOST,
        database: process.env.DB_DATABASE, 
        password: process.env.DB_PASSWORD,
        port: process.env.DB_PORT,
    });

    // Opcional: verficiar la conexion al iniciar

    pool.on('connect', () =>{
        console.log(`conectado con exito a la base de datos...`)
    });

    pool.on('error', (error) =>{
        console.error(`Error inesperado en el pool de la base de datos \n ---- ERROR: ${error}`)
    });

    //funcion para ejecutar consultar sql
    async function query(text, params){
        //eliminar la parte del console.log siguiente cuando se mande a produccion por temas de seguridad, por ahora se queda para debug
        console.log(`QUERY A EJECUTAR: ${text} -- ${params}`)
        return await pool.query(text, params)
    }

    module.exports = {
        query,
    };
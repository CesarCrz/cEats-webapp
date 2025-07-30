const express = require('express');
const session = require('express-session');
const path = require('path');
const http = require('http');
const fs = require('fs');
const socketIo = require('socket.io');
const { error, Console } = require('console');
const app = express();
const server = http.createServer(app)
const io = socketIo(server)
const PORT = process.env.PORT || 3000;
const db = require('./db'); //importa el modulo de acceso a datos

// Rutas relativas al backend/src
const PEDIDOS_FILE = path.join(__dirname, 'pedidos.json');

// Carpeta frontend raíz y src
const FRONTEND_ROOT = path.join(__dirname, '..', '..', 'frontend');
const FRONTEND_SRC = path.join(FRONTEND_ROOT, 'src');

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: 'soru-secret-key',
  resave: false,
  saveUninitialized: false
}));

// Servir archivos estáticos desde frontend/src
app.use('/CSS', express.static(path.join(FRONTEND_SRC, 'CSS')));           
app.use('/JS', express.static(path.join(FRONTEND_SRC, 'JS')));
app.use('/Audio', express.static(path.join(FRONTEND_SRC, 'Audio')));
app.use('/Img', express.static(path.join(FRONTEND_SRC, 'Img')));

// Para servir el index.html directamente
app.get('/', (req, res) => {
  res.sendFile(path.join(FRONTEND_ROOT, 'index.html'));
});
app.get('/main', (req, res) => {
  res.sendFile(path.join(FRONTEND_SRC, 'pages', 'main.html'));
});
app.get('/ticket', (req, res) => {
  res.sendFile(path.join(FRONTEND_SRC, 'pages', 'ticket.html'));
});
app.get('/main/pedidos/:sucursal', (req, res) => {
  res.sendFile(path.join(FRONTEND_SRC, 'pages', 'main.html'));
});

/*
function cargarPedidos() {
  if (!fs.existsSync(PEDIDOS_FILE)) return []
  const raw = fs.readFileSync(PEDIDOS_FILE, 'utf-8');
  return JSON.parse(raw);
}

function guardarPedidos(pedidos) {
  fs.writeFileSync(PEDIDOS_FILE, JSON.stringify(pedidos, null, 2), 'utf-8');
}*/

// -- Endpoint para obtener los pedidos por sucursal

app.get('/api/pedidos/sucursal/:sucursal', async (req, res) => {
    //obtenemos el valor del del parametro ':sucursal' de la URL
    const sucursal = req.params.sucursal;

    // paso de validacion para asegurarnos  que se proporciono el nombre de la sucursal
    
    if (!sucursal) return res.status(400).json({ success: false, error: `Se requiere especificar la sucursal para obtener los pedidos`});

    try {
      // consulta SQL para obtener pedidos filtrador por Sucursal
      // seleccionamos todas las columnas ("*") de la tabla 'pedidos'
      // ordena los resultados por la columna 'time' de forma DESCENDENTE - ESC

      const queryText = 'SELECT * FROM pedidos WHERE sucursal = $1 ORDER BY hora DESC';
      //usamos placeholder
      const values = [sucursal];

      const result = await db.query(queryText, values);

      const pedidosFiltrados = result.rows;

      res.json(pedidosFiltrados)

    } catch (error) {
      console.error(`Error al obtener los pedidos de la sucursal ${sucursal} de la BD -- ERROR: ${error}`);
      res.status(500).json({success: false, error: 'Error interno del servidor al obtener los pedidos por sucursal'});
    }    

});


/*app.post('/api/pedidos/:codigo/estado', (req, res) => {
  const { codigo } = req.params;
  const { estado} = req.body;
  
  if (!estado) {
    return res.status(400).json({error: 'Falto el campo de estado'});
  }

  let pedidos = cargarPedidos();
  const idx = pedidos.findIndex(p => p.codigo === codigo || p.orderId === codigo);

  if (idx === -1) {
    return res.status(404).json({error: 'Pedido no encontrado'});
  }

  pedidos[idx].estado = estado;
  guardarPedidos(pedidos);

  io.emit('update_order', pedidos[idx]);

  res.json({ success: true, pedido: pedidos[idx] });
});*/

app.post('/api/pedidos/:codigo/estado', async (req, res) =>{
    const codigoPedido = req.params.codigo; //obtiene el codigo de la URL
    const {estado: nuevoEstado} = req.body; //y obtiene el nuevo estado del pedido directo del body de la solicitud POST
    if (!nuevoEstado) return res.status(400).send('Se requiere el nuevo estado del pedido para poder actualizar');
    try {
      //Vamos a hacer una consulta SQL para actualizar el estado de un pedido especifico a traves de su código
      const queryText = `
          UPDATE pedidos
          SET estado = $1
          WHERE codigo = $2
      `
      const values = [nuevoEstado, codigoPedido];
      //primero mandamos a la base de datos...
      const result = await db.query(queryText, values); 
      
      //si las filas afectadas o result.rowCount son al menos 1 es que encontró el pedido con el codigo
      if (result.rowCount > 0 ){
          //mandamos a Google appscript pero sin añadir latencia ya que primero se ejecuta la ejecucion a la BD
          fetch('https://script.google.com/macros/s/AKfycbzhwNTB1cK11Y3Wm7uiuVrzNmu1HD1IlDTPlAJ37oUDgPIabCWbZqMZr-86mnUDK_JPBA/exec', {
            method: 'POST',
            body: JSON.stringify({
              action: 'actualizarEstadoPedido',
              codigo: codigoPedido,
              nuevoEstado: nuevoEstado
            }),
            headers: {'Cotent-Type': 'appliation/json'} 
          })
          .then(response => {
              console.log(`Google Sheets Api response status ${response.status}`);
              return response.json();
            })
          .then(gsData => console.log(`Google Sheets Api response data: ${gsData}`))
          .catch(gsError => console.error(`Error al llamar a la API de Google Sheets: --- ERROR: ${gsError}`));

          res.json({succes: true, mensaje: `Estado del pedido ${codigoPedido} actualizado a: ${nuevoEstado} en DB`});
        
      } else {
        res.status(404).json({succes: false, error: `Pedido con código ${codigoPedido} no encontrado en la BD`});
      }
    } catch (error) {
      console.error(`Error al actualziar le estado del pedido ${codigoPedido} en la BD`);
      res.status(500).json({success: false, error: 'Error interno del servidor al actualizar el estado del pedido'});
    }
});

// Endpoint para que Google Apps Script mande nuevos pedidos
/*app.post('/api/pedidos/:sucursal', (req, res) => {
  const { sucursal } = req.params;
  const pedido = req.body;

  pedido.codigo = pedido.codigo || pedido.orderId;

  // Normaliza el pedido para que siempre tenga un array en pedido.pedido
  if (typeof pedido.productDetails === 'string') {
    try {
      pedido.pedido = JSON.parse(pedido.productDetails);
    } catch (e) {
      pedido.pedido = [];
    }
  } else if (Array.isArray(pedido.productDetails)) {
    pedido.pedido = pedido.productDetails;
  } else if (typeof pedido.pedido === 'string') {
    try {
      pedido.pedido = JSON.parse(pedido.pedido);
    } catch (e) {
      pedido.pedido = [];
    }
  } else if (Array.isArray(pedido.pedido)) {
    // Ya está bien
  } else {
    pedido.pedido = [];
  }

  console.log(`Pedido nuevo para ${sucursal}:`, pedido);
  let pedidos = cargarPedidos();

  const yaExiste = pedidos.some(p => p.codigo === pedido.codigo);
  if (!yaExiste) {
    pedidos.push(pedido);
    guardarPedidos(pedidos);
  }
  
  io.emit('new_order', pedido);

  res.sendStatus(201);
});*/
app.post('/api/pedidos/:sucursal', async (req, res) =>{
    const { sucursal } = req.params; //Obtenemos la sucursal de la URL
    const datosEntrada = req.body; //Obtenemos los datos entrantes

    // -- logica de Normalización y Mapeo (Ajustado para ambos tipos de pedidos (recoger o domicilio) )
    
    const tipoPedido = datosEntrada.deliverOrRest ? datosEntrada.deliverOrRest: 'desconocido'; 
    //Vamos a mapear los campos de 'datosEntrada' a las propiedades esperadas en el objeto pedido y que coinciden con las columnas de la BD

    const pedidoParaDB = {
      codigo : datosEntrada.orderId,
      deliver_or_rest: tipoPedido,
      estado: datosEntrada.estado || 'Pendiente', //Estado 'Pendiente' por default
      nombre: datosEntrada.name,
      celular: datosEntrada.numero,
      sucursal: sucursal,
      pedido: datosEntrada.productDetails,
      instrucciones: datosEntrada.specs,
      entregar_a: tipoPedido === 'recoger' ? datosEntrada.deliverTo: datosEntrada.name,
      domicilio: tipoPedido === 'domicilio' ? datosEntrada.address: null,
      total: datosEntrada.total,
      currency: datosEntrada.currency,
      pago: tipoPedido === 'domicilio' ? datosEntrada.payMethod : null,
      // Generemos fecha y hora a partir de la hora mexicana 'America/Mexico_City'
      fecha: new Date().toLocaleDateString('es-MX', {timeZone: 'America/Mexico_City'}).split('/').reverse().join('-'),
      hora: new Date().toLocaleTimeString('es-MX', {timeZone: 'America/Mexico_City', hour12: false}), //se guarda en formato 24 horas (PREGUNTAR A DANI SI HAY PROBLEMA CON ESTO)
      tiempo: tiempo ? tiempo: '' 
    };

    if (typeof pedidoParaDB.pedido !== 'string'){
      console.error(`productDetails no es un JSON string válido, por lo tanto no puede ser procesado. \n---FORMATO ACTUAL: ${pedidoParaDB.pedido}`);
      return res.status(400).json({success: false, error: `El formato de 'productDetails' debe ser un string`});
    }

    if (!pedidoParaDB.codigo || !pedidoParaDB.deliverOrRest || !pedidoParaDB.estado || !pedidoParaDB.name || !pedidoParaDB.numero || !pedidoParaDB.sucursal || !pedidoParaDB.pedido || !pedidoParaDB.total || !pedidoParaDB.currency || !pedidoParaDB.pago || !pedidoParaDB.fecha || !pedidoParaDB.hora || pedidoParaDB.entregarA === undefined) { // Validar campos clave y que 'entregarA' este definido
      console.error('Intento de crear pedido con datos faltantes (despues de mapeo):', pedidoParaDB);
      console.error('Datos recibidos:', datosEntrada); 
      return res.status(400).json({ success: false, error: 'Faltan datos requeridos para crear el pedido (codigo, deliverOrRest, estado, name, numero, sucursal, pedido, total, currency, pago, fecha, hora, entregarA son minimos).' });
  }
  
    if (tipoPedido === 'domicilio' && !pedidoParaDB.domicilio) {
      console.error('Pedido a domicilio sin direccion:', pedidoParaDB);
      return res.status(400).json({ success: false, error: 'Se requiere domicilio para pedidos a domicilio.' });
  } 

    if (tipoPedido === 'recoger' && !pedidoParaDB.entregar_a){
      console.error(`El pedido: ${pedidoParaDB.codigo} a recoger debe incluir nombre de la persona a entregar:`);
      return res.status(400).json({ success: false, error: 'Se requiere nombre de la persona a entregar para pedidos a recoger'});
    }

    //Creamos la consulta SQL para insertar un nuevo pedido en la BD

    const queryText = `
      INSERT INTO pedidos (
        codigo, deliver_or_rest, estado, nombre, celular, sucursal,
        pedido, instrucciones, entregar_a, domicilio, total, currency,
        pago, fecha, hora, tiempo
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING codigo;
    `;

    const values = [
      pedidoParaDB.codigo,
      pedidoParaDB.deliver_or_rest,
      pedidoParaDB.estado,
      pedidoParaDB.nombre,
      pedidoParaDB.celular,
      pedidoParaDB.sucursal,
      pedidoParaDB.pedido,
      pedidoParaDB.instrucciones,
      pedidoParaDB.entregar_a,
      pedidoParaDB.domicilio,
      pedidoParaDB.total,
      pedidoParaDB.currency,
      pedidoParaDB.pago,
      pedidoParaDB.fecha,
      pedidoParaDB.hora,
      pedidoParaDB.tiempo
    ];

    try {
      //mandamos el pedido a la BD
      const result = await db.query(queryText, values);
      const codigoPedidoInsertado = result.rows[0].codigo;

      //Sincronizacion y Notificación despues de la inserción exitosa en la BD
      res.status(201).json({succes: true, codigo: codigoPedidoInsertado, mensaje: `Se ha insertado con exito el pedido: ${codigoPedidoInsertado} en la BD`});
    } catch (error) {
      console.error(`Error al insertar el pedido en la base de Datos ---ERROR: ${error}`);
      if (error.code === '23505'){
        return res.status(409).json({succes: false, error: `Ya existe un pedido para el codigo: ${pedidoParaDB.codigo}`});
      }
      res.status(500).json({succes: false, error: 'Error interno del servidor al crear el pedido'}); 
    }


});
/*app.get('/api/pedidos/:codigo', async (req, res) => {
  const codigo = req.params.codigo;
  const pedidos = cargarPedidos();
  const pedido = pedidos.find(p => p.codigo === codigo || p.orderId === codigo);

  if (pedido) {
    res.json(pedido);
  } else {
    res.status(404).json({error: 'Pedido no encontrado'});
  }
});*/

app.get('/api/pedidos/:codigo', async (req, res) => {
    const codigo = req.params.codigo;
    if (!codigo){
       console.error('se requiere un codigo de pedido obligatoriamente');
       return res.status(400).send('Se requiere un codigo de pedido OBLIGATORIAMENTE');
    }
    try {
      // Consulta SQL para obtener un pedido por el codigo
      // Usamos placeholder $1 y pasamos [codiho] para evitar inyecciones SQL

      const queryText = 'SELECT * FROM pedidos WHERE codigo = $1';
      const values = [codigo];
      const result = await db.query(queryText, values);

      //si la consulta encontro al menos una fila....
      if (result.rows.length > 0 ){
        const pedido = result.rows[0]; //toma la primer fila (el pedido)
        res.json(pedido); // y envia el pedido
      } else {
        //si no encuentra ningun pedido con ese codigo, devuelve error con trazabilidad
        res.status(404).json({error: `Pedido con código ${codigo} no encontrado ne la BD`});
      } 
    } catch (error) {
      //en caso de error  al consultar la base de datos...
      console.error(`Error al obtener el pedido: ${codigo} de la BD`);
      res.status(500).send(`Error interno del servidor al obtener el pedido`);
    }    
});


// IMPORTANTE: Debes instalar node-fetch (npm install node-fetch)
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

app.get('/api/obtenerPedidos', async (req, res) => {
  try {
    const sucursal = req.query.sucursal || 'ALL';

    const url = `https://script.google.com/macros/s/AKfycbzhwNTB1cK11Y3Wm7uiuVrzNmu1HD1IlDTPlAJ37oUDgPIabCWbZqMZr-86mnUDK_JPBA/exec?action=getPedidos&sucursal=${sucursal}`;

    const response = await fetch(url);
    const data = await response.json();

    res.json(data);
  } catch (err) {
    console.log("Error al obtener pedidos:", err);
    res.status(500).json({ error: 'Error al obtener pedidos.' });
  }
});

app.delete('/api/pedidos/:codigo', (req, res) => {
  const codigo = req.params.codigo;
  let pedidos =cargarPedidos();

  const idx = pedidos.findIndex(p => p.codigo === codigo || p.orderId === codigo);
  if (idx === -1) {
    return res.status(404).json({ success: false, error: 'Pedido no encontrado' });
  }

  const eliminado = pedidos.splice(idx, 1)[0];
  guardarPedidos(pedidos);

  io.emit('pedido_eliminado', eliminado);

  res.json({ success: true, pedido: eliminado });
})

app.post('/api/cancelarPedido', async (req, res) => {
  const { codigoPedido, motivo } = req.body;
  const WEBHOOK_URL = 'https://webhook.site/e45ed4d4-7a0b-4258-b03a-f4fa20a53a41';

  if (!codigoPedido || !motivo) {
    return res.status(400).json({ success: false, error: 'Faltan datos' });
  }

  try {
    await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        codigoPedido,
        motivo,
        timestamp: new Date().toISOString()
      })
    });

    const sheetsResp = await fetch('https://script.google.com/macros/s/AKfycbzhwNTB1cK11Y3Wm7uiuVrzNmu1HD1IlDTPlAJ37oUDgPIabCWbZqMZr-86mnUDK_JPBA/exec', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `action=actualizarEstadoPedido&codigo=${encodeURIComponent(codigoPedido)}&nuevoEstado=Cancelado`
    });
    const sheetsData = await sheetsResp.json();
    if (sheetsData.estado !== 'ESTADO_ACTUALIZADO') {
      return res.status(500).json({ success: false, error: 'No se pudo actualizar el estado en Sheets.' });
    }

    let pedidos = cargarPedidos();
    const idx = pedidos.findIndex(p => p.codigo === codigoPedido || p.orderId === codigoPedido);
    if (idx === -1) {
      return res.status(404).json({ success: false, error: 'Pedido no encontrado' });
    }
    const eliminado = pedidos.splice(idx, 1)[0];
    guardarPedidos(pedidos);

    io.emit('pedido_eliminado', eliminado);

    res.json({ success: true });
  } catch (err) {
    console.error("Error en cancelarPedido:", err);
    res.status(500).json({ success: false, error: 'Error al cancelar el pedido.' });
  }
});

app.post('/api/verificarPassword', async (req, res) => {
  const { email, password } = req.body;
  try {
    const response = await fetch('https://script.google.com/macros/s/AKfycbzhwNTB1cK11Y3Wm7uiuVrzNmu1HD1IlDTPlAJ37oUDgPIabCWbZqMZr-86mnUDK_JPBA/exec', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'verificarPassword',
        email,
        password
      })
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Error al verificar la contraseña.' });
  }
});

app.post('/api/cambiarPassword', async (req, res) => {
  const { email, nuevaPassword} = req.body;

  try {
    const response = await fetch('https://script.google.com/macros/s/AKfycbzhwNTB1cK11Y3Wm7uiuVrzNmu1HD1IlDTPlAJ37oUDgPIabCWbZqMZr-86mnUDK_JPBA/exec', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'cambiarPassword',
        email,
        nuevaPassword
      })
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Error al cambiar la contraseña.' });
  }
});

app.get('/api/corte', async (req, res) => {
  const sucursal = req.query.sucursal;
  if (!sucursal) {
    return res.status(400).json({ error: 'Falta el parámetro de sucursal' });
  }

  try {
    // Cambia la URL a la de tu Apps Script
    const url = `https://script.google.com/macros/s/AKfycbzhwNTB1cK11Y3Wm7uiuVrzNmu1HD1IlDTPlAJ37oUDgPIabCWbZqMZr-86mnUDK_JPBA/exec?action=getPedidos&sucursal=${encodeURIComponent(sucursal)}&estados=liberado`;
    const response = await fetch(url);
    const data = await response.json();
    const pedidos = Array.isArray(data.pedidos) ? data.pedidos : [];

    let efectivo = 0, tarjeta = 0;
    pedidos.forEach(p => {
      const pago = (p.pago || p.payMethod || '').toLowerCase();
      const totalPedido = parseFloat(p.total) || 0;
      if (pago === 'efectivo') efectivo += totalPedido;
      else if (pago === 'tarjeta') tarjeta += totalPedido;
    });

    const total = efectivo + tarjeta;
    res.json({
      efectivo: efectivo.toFixed(2),
      tarjeta: tarjeta.toFixed(2),
      total: total.toFixed(2)
    });
  } catch (err) {
    console.error("Error en corte desde sheets:", err);
    res.status(500).json({ error: 'Error al obtener el corte desde Sheets.' });
  }
});;

app.get('/api/pedidos.json', async (req, res) =>{
  try {
    //vamos a ejecutar una consulta SQL para obtener todos los pedidos ordenados por hora descendente
    const result = await db.query('SELECT * FROM pedidos ORDER BY hora DESC');

    const pedidos = result.rows; //'result.rows' contiene el array de pedidos (resultados)
    res.json(pedidos);
  } catch (error) {
    //si hay error al consultar la base de datos, registrarlo y responder un error al cliente
    console.error(`ERROR AL OBTENER PEDIDOS DE LA BASE DE DATOS --- ERROR: ${error}`);
    res.status(500).send('Error interno del servidor al obtener pedidos')
  }
});

/*app.get('/api/pedidos.json', async (req, res) => {
  const pedidos = cargarPedidos();
  res.json(pedidos);
});*/

server.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});

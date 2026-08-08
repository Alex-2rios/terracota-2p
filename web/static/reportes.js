/*
 * Formulario de reportes.
 *
 * No hay ninguna lista de reportes codificada aquí: todo sale del catálogo que
 * publica la API en /administracion/reportes/opciones. Agregar un reporte en el
 * backend lo hace aparecer en esta pantalla sin tocar el frontend.
 */

(function () {
  const contenedorCatalogo = document.getElementById("catalogoReportes");
  const formulario = document.getElementById("formularioReporte");
  if (!contenedorCatalogo || !formulario) return;

  let catalogo;
  try {
    catalogo = JSON.parse(contenedorCatalogo.textContent);
  } catch (error) {
    console.error("No se pudo leer el catálogo de reportes", error);
    return;
  }

  // Cada filtro que declara un reporte se traduce a un campo del formulario.
  // Varios filtros comparten el mismo `name` porque la API los recibe en el
  // mismo parámetro (por ejemplo rol y categoría viajan como `categoria`).
  const CAMPOS = {
    categoria:         { name: "categoria", etiqueta: "Categoría",          opciones: "categoria" },
    rol:               { name: "categoria", etiqueta: "Rol",                opciones: "rol" },
    estado_pedido:     { name: "estado",    etiqueta: "Estado del pedido",  opciones: "estado_pedido" },
    estado_inventario: { name: "estado",    etiqueta: "Estado",             opciones: "estado_inventario" },
    estado_usuario:    { name: "estado",    etiqueta: "Estado de la cuenta", opciones: "estado_usuario" },
    mesa:              { name: "mesa",      etiqueta: "Mesa",               opciones: "mesa" },
    mesero:            { name: "usuario",   etiqueta: "Mesero",             opciones: "mesero" },
    cajero:            { name: "usuario",   etiqueta: "Cajero",             opciones: "cajero" },
    metodo_pago:       { name: "metodo",    etiqueta: "Método de pago",     opciones: "metodo_pago" },
  };

  const botones = document.querySelectorAll(".report-type[data-report]");
  const campoTipo = document.getElementById("tipoReporte");
  const resumen = document.getElementById("reportSummary");
  const pista = document.getElementById("exportHint");
  const contenedorCampos = document.getElementById("camposFiltro");
  const camposFecha = contenedorCampos.querySelectorAll('[data-campo="fechas"]');

  function crearSelect(clave, config) {
    const etiqueta = document.createElement("label");
    etiqueta.dataset.campo = clave;

    const titulo = document.createElement("span");
    titulo.textContent = config.etiqueta;

    const select = document.createElement("select");
    select.name = config.name;
    (catalogo.opciones[config.opciones] || []).forEach((valor) => {
      const opcion = document.createElement("option");
      opcion.value = valor;
      opcion.textContent = valor;
      select.appendChild(opcion);
    });

    etiqueta.append(titulo, select);
    return etiqueta;
  }

  function seleccionar(clave) {
    const tipo = catalogo.tipos.find((t) => t.clave === clave);
    if (!tipo) return;

    botones.forEach((boton) => {
      const activo = boton.dataset.report === clave;
      boton.classList.toggle("selected", activo);
      boton.setAttribute("aria-pressed", String(activo));
    });

    campoTipo.value = clave;
    resumen.textContent = tipo.descripcion;
    pista.textContent = `Para este reporte se recomienda ${tipo.formato_sugerido.toUpperCase()}.`;

    // Fuera los selects del reporte anterior: si quedaran ocultos pero
    // habilitados, seguirían enviando su valor y filtrarían de más.
    contenedorCampos
      .querySelectorAll('label[data-campo]:not([data-campo="fechas"])')
      .forEach((nodo) => nodo.remove());

    const usaFechas = tipo.filtros.includes("fechas");
    camposFecha.forEach((nodo) => {
      nodo.hidden = !usaFechas;
      nodo.querySelectorAll("input").forEach((input) => { input.disabled = !usaFechas; });
    });

    tipo.filtros
      .filter((filtro) => filtro !== "fechas" && CAMPOS[filtro])
      .forEach((filtro) => contenedorCampos.appendChild(crearSelect(filtro, CAMPOS[filtro])));
  }

  botones.forEach((boton) => {
    boton.addEventListener("click", () => seleccionar(boton.dataset.report));
  });

  seleccionar(catalogo.tipos[0].clave);
})();

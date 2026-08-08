/*
 * Configura el formulario de reportes. Los valores enviados coinciden con lo
 * que espera `GET /api/v1/administracion/reportes`.
 */

const CONFIG_REPORTES = {
  ventas: {
    resumen:
      "Reporte consolidado de ventas: resumen del periodo (ingresos, gastos y utilidad), " +
      "ranking de productos vendidos y detalle de todas las transacciones.",
    etiquetaCategoria: "Categoría de producto",
    categorias: ["Todos", "Bebidas", "Postres", "Alimentos", "Promociones"],
    estados: ["Todos", "Pagado", "Entregado", "Listo", "Preparando", "Pendiente", "Cancelado"],
    usaFechas: true,
    pista: "Se recomienda PDF para presentar las ventas del periodo.",
  },
  usuarios: {
    resumen:
      "Reporte del personal: usuarios agrupados por estado, con sus roles, " +
      "fecha de registro y último acceso.",
    etiquetaCategoria: "Rol",
    categorias: ["Todos los roles", "Administrador", "Mesero", "Cocina", "Cajero"],
    estados: ["Todos", "Activo", "Inactivo", "Eliminado"],
    usaFechas: false,
    pista: "Se recomienda PDF para entregar el resumen de usuarios.",
  },
  inventario: {
    resumen:
      "Estado actual del inventario: existencias, mínimos, disponibilidad y " +
      "productos dados de baja.",
    etiquetaCategoria: "Categoría",
    categorias: ["Todos", "Bebidas", "Postres", "Alimentos", "Promociones"],
    estados: ["Todos", "Disponible", "Bajo", "Agotado", "No disponible", "Eliminado"],
    usaFechas: false,
    pista: "Se recomienda XLSX para revisar y ajustar cantidades.",
  },
};

(function () {
  const botones = document.querySelectorAll(".report-type[data-report]");
  const campoTipo = document.getElementById("tipoReporte");
  const resumen = document.getElementById("reportSummary");
  const selectCategoria = document.getElementById("categoriaReporte");
  const selectEstado = document.getElementById("estadoReporte");
  const etiquetaCategoria = document.getElementById("etiquetaCategoria");
  const bloqueFechas = document.getElementById("bloqueFechas");
  const pista = document.getElementById("exportHint");

  function llenar(select, opciones) {
    select.innerHTML = "";
    opciones.forEach((texto) => {
      const opcion = document.createElement("option");
      opcion.value = texto;
      opcion.textContent = texto;
      select.appendChild(opcion);
    });
  }

  function seleccionar(tipo) {
    const config = CONFIG_REPORTES[tipo];
    if (!config) return;

    botones.forEach((boton) => {
      const activo = boton.dataset.report === tipo;
      boton.classList.toggle("selected", activo);
      boton.setAttribute("aria-pressed", String(activo));
    });

    campoTipo.value = tipo;
    resumen.textContent = config.resumen;
    etiquetaCategoria.textContent = config.etiquetaCategoria;
    pista.textContent = config.pista;
    llenar(selectCategoria, config.categorias);
    llenar(selectEstado, config.estados);

    // El rango de fechas sólo aplica al reporte de ventas; en los otros se
    // oculta para no dar la impresión de que filtra algo.
    bloqueFechas.hidden = !config.usaFechas;
    bloqueFechas.previousElementSibling.hidden = !config.usaFechas;
  }

  botones.forEach((boton) => {
    boton.addEventListener("click", () => seleccionar(boton.dataset.report));
  });

  seleccionar("ventas");
})();

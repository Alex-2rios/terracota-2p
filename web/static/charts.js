/*
 * Gráficas del tablero dibujadas con Canvas 2D.
 *
 * No se usa ninguna librería externa a propósito: el panel tiene que funcionar
 * en la revisión aunque no haya internet en el salón. Antes esto dependía de
 * Chart.js servido desde un CDN.
 */

(function () {
  const contenedor = document.getElementById("datosGraficas");
  if (!contenedor) return;

  let datos;
  try {
    datos = JSON.parse(contenedor.textContent);
  } catch (error) {
    console.error("No se pudieron leer los datos de las gráficas", error);
    return;
  }

  const PALETA = ["#a14f33", "#73351f", "#d4ad88", "#8a6b5c", "#c98663"];
  const TINTA = "#3b1c13";
  const SUAVE = "#8a6b5c";
  const REJILLA = "#eadccb";

  function preparar(canvas) {
    const escala = window.devicePixelRatio || 1;
    const ancho = canvas.parentElement.clientWidth;
    const alto = canvas.parentElement.clientHeight || 260;
    canvas.width = ancho * escala;
    canvas.height = alto * escala;
    canvas.style.width = ancho + "px";
    canvas.style.height = alto + "px";
    const ctx = canvas.getContext("2d");
    ctx.setTransform(escala, 0, 0, escala, 0, 0);
    ctx.clearRect(0, 0, ancho, alto);
    return { ctx, ancho, alto };
  }

  function textoCentrado(ctx, ancho, alto, texto) {
    ctx.fillStyle = SUAVE;
    ctx.font = "13px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(texto, ancho / 2, alto / 2);
  }

  function moneda(valor) {
    return "$" + Number(valor).toLocaleString("es-MX", { maximumFractionDigits: 0 });
  }

  // ------------------------------------------------ barras agrupadas
  function barrasAgrupadas(canvas, etiquetas, series) {
    const { ctx, ancho, alto } = preparar(canvas);
    // En pantallas angostas el margen del eje Y se encoge para que siga
    // quedando espacio de dibujo; si aun así no cabe, no se dibuja nada roto.
    const margen = { arriba: 16, derecha: 12, abajo: 30, izquierda: ancho < 320 ? 40 : 58 };
    const anchoUtil = ancho - margen.izquierda - margen.derecha;
    const altoUtil = alto - margen.arriba - margen.abajo;

    if (anchoUtil <= 0 || altoUtil <= 0 || !etiquetas.length || !series.length) {
      textoCentrado(ctx, ancho, alto, "Sin espacio para mostrar la gráfica");
      return;
    }

    const todos = series.flatMap((s) => s.valores);
    const maximo = Math.max(1, ...todos);
    const pasos = 4;

    // Rejilla y escala del eje Y
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.font = "11px system-ui, sans-serif";
    for (let i = 0; i <= pasos; i++) {
      const valor = (maximo / pasos) * i;
      const y = margen.arriba + altoUtil - (altoUtil / pasos) * i;
      ctx.strokeStyle = REJILLA;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(margen.izquierda, y + 0.5);
      ctx.lineTo(margen.izquierda + anchoUtil, y + 0.5);
      ctx.stroke();
      ctx.fillStyle = SUAVE;
      ctx.fillText(moneda(valor), margen.izquierda - 8, y);
    }

    const anchoGrupo = anchoUtil / etiquetas.length;
    const anchoBarra = Math.min(26, (anchoGrupo * 0.62) / series.length);

    etiquetas.forEach((etiqueta, indice) => {
      const centro = margen.izquierda + anchoGrupo * indice + anchoGrupo / 2;
      const inicio = centro - (anchoBarra * series.length) / 2;

      series.forEach((serie, s) => {
        const valor = serie.valores[indice] || 0;
        const altoBarra = (valor / maximo) * altoUtil;
        const x = inicio + anchoBarra * s;
        const y = margen.arriba + altoUtil - altoBarra;

        ctx.fillStyle = serie.color;
        ctx.fillRect(x, y, anchoBarra - 2, Math.max(altoBarra, valor > 0 ? 2 : 0));
      });

      ctx.fillStyle = TINTA;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.font = "11px system-ui, sans-serif";
      ctx.fillText(etiqueta, centro, margen.arriba + altoUtil + 8);
    });

    // Eje X
    ctx.strokeStyle = REJILLA;
    ctx.beginPath();
    ctx.moveTo(margen.izquierda, margen.arriba + altoUtil + 0.5);
    ctx.lineTo(margen.izquierda + anchoUtil, margen.arriba + altoUtil + 0.5);
    ctx.stroke();
  }

  // ------------------------------------------------------------ dona
  function dona(canvas, etiquetas, valores, leyenda) {
    const { ctx, ancho, alto } = preparar(canvas);
    const total = valores.reduce((suma, v) => suma + Number(v), 0);

    if (!total) {
      textoCentrado(ctx, ancho, alto, "Sin ventas registradas todavía");
      if (leyenda) leyenda.innerHTML = "";
      return;
    }

    const centroX = ancho / 2;
    const centroY = alto / 2;
    const radio = Math.min(ancho, alto) / 2 - 12;
    const radioInterno = radio * 0.58;

    let anguloInicio = -Math.PI / 2;
    valores.forEach((valor, indice) => {
      const porcion = (Number(valor) / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(centroX, centroY);
      ctx.arc(centroX, centroY, radio, anguloInicio, anguloInicio + porcion);
      ctx.closePath();
      ctx.fillStyle = PALETA[indice % PALETA.length];
      ctx.fill();
      anguloInicio += porcion;
    });

    // Hueco central
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(centroX, centroY, radioInterno, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";

    ctx.fillStyle = TINTA;
    ctx.font = "700 18px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(total), centroX, centroY - 6);
    ctx.font = "10px system-ui, sans-serif";
    ctx.fillStyle = SUAVE;
    ctx.fillText("vendidos", centroX, centroY + 12);

    if (leyenda) {
      leyenda.innerHTML = etiquetas
        .map((etiqueta, indice) => {
          const color = PALETA[indice % PALETA.length];
          const porcentaje = Math.round((Number(valores[indice]) / total) * 100);
          return `<span><i class="swatch" style="background:${color}"></i>${etiqueta} · ${porcentaje}%</span>`;
        })
        .join("");
    }
  }

  // ------------------------------------------ filtro de series (Ambas/una)
  const SERIES = {
    ganancias: { nombre: "Ganancias", valores: datos.ganancias, color: "#a14f33" },
    gastos: { nombre: "Gastos", valores: datos.gastos, color: "#d4ad88" },
  };

  let filtro = "ambas";

  function seriesVisibles() {
    return filtro === "ambas" ? [SERIES.ganancias, SERIES.gastos] : [SERIES[filtro]];
  }

  function actualizarResumen() {
    const resumen = document.getElementById("salesTotal");
    if (!resumen) return;

    const totales = seriesVisibles().map((serie) => {
      const suma = serie.valores.reduce((acumulado, valor) => acumulado + Number(valor), 0);
      return `${serie.nombre}: ${moneda(suma)}`;
    });

    if (filtro === "ambas") {
      const ganancias = SERIES.ganancias.valores.reduce((a, v) => a + Number(v), 0);
      const gastos = SERIES.gastos.valores.reduce((a, v) => a + Number(v), 0);
      const balance = ganancias - gastos;
      const signo = balance >= 0 ? "Utilidad" : "Pérdida";
      totales.push(`${signo}: ${moneda(Math.abs(balance))}`);
    }

    resumen.textContent = totales.join("  ·  ");
  }

  function dibujar() {
    const ventas = document.getElementById("salesChart");
    if (ventas) {
      barrasAgrupadas(ventas, datos.ventas, seriesVisibles());
      actualizarResumen();
    }

    const productos = document.getElementById("productsChart");
    if (productos) {
      dona(productos, datos.productos, datos.cantidades, document.getElementById("productsLegend"));
    }
  }

  const filtroVentas = document.getElementById("salesFilter");
  if (filtroVentas) {
    filtroVentas.addEventListener("click", (evento) => {
      const boton = evento.target.closest("button[data-serie]");
      if (!boton) return;

      filtro = boton.dataset.serie;
      filtroVentas.querySelectorAll("button[data-serie]").forEach((otro) => {
        const activo = otro === boton;
        otro.classList.toggle("active", activo);
        otro.setAttribute("aria-pressed", String(activo));
      });
      dibujar();
    });
  }

  dibujar();

  let temporizador;
  window.addEventListener("resize", () => {
    clearTimeout(temporizador);
    temporizador = setTimeout(dibujar, 150);
  });
})();


(function () {
  const INTERVALO = 5000;

  const regiones = Array.from(document.querySelectorAll("[data-live]"));
  if (!regiones.length) return;

  let enCurso = false;

  function hayDialogoAbierto() {
    const confirmacion = document.getElementById("confirmOverlay");
    if (confirmacion && confirmacion.classList.contains("visible")) return true;

    const detalle = document.getElementById("detalleModal");
    if (detalle && !detalle.hidden) return true;

    return false;
  }

  function escribiendoEnRegion() {
    const activo = document.activeElement;
    if (!activo || activo === document.body) return false;

    const editable = ["INPUT", "TEXTAREA", "SELECT"].includes(activo.tagName) ||
      activo.isContentEditable;
    if (!editable) return false;

    return regiones.some((region) => region.contains(activo));
  }

  function debeEsperar() {
    return document.hidden || enCurso || hayDialogoAbierto() || escribiendoEnRegion();
  }

  async function actualizar() {
    if (debeEsperar()) return;
    enCurso = true;

    try {

      const respuesta = await fetch(window.location.href, {
        credentials: "same-origin",
        cache: "no-store",
        headers: { "X-Actualizacion-Viva": "1" },
      });
      if (!respuesta.ok) return;

      const doc = new DOMParser().parseFromString(await respuesta.text(), "text/html");

      if (!doc.querySelector("[data-live]")) {
        if (doc.querySelector('input[name="password"]')) window.location.reload();
        return;
      }

      let huboCambios = false;

      regiones.forEach((region) => {
        const nueva = doc.querySelector('[data-live="' + region.dataset.live + '"]');
        if (!nueva || nueva.innerHTML === region.innerHTML) return;

        const desplazamiento = region.scrollLeft;
        region.innerHTML = nueva.innerHTML;
        region.scrollLeft = desplazamiento;
        huboCambios = true;
      });

      if (huboCambios) {
        document.dispatchEvent(new CustomEvent("panel:actualizado"));
      }
    } catch (error) {

    } finally {
      enCurso = false;
    }
  }

  setInterval(actualizar, INTERVALO);

  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) actualizar();
  });
})();

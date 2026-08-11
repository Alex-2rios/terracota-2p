const overlay = document.getElementById("confirmOverlay");
const message = document.getElementById("confirmMessage");
const cancelButton = document.getElementById("cancelConfirm");
const acceptButton = document.getElementById("acceptConfirm");

const title = document.getElementById("confirmTitle");
const motivoCampo = document.getElementById("confirmMotivoCampo");
const motivoInput = document.getElementById("confirmMotivo");
const motivoEtiqueta = document.getElementById("confirmMotivoEtiqueta");
const motivoError = document.getElementById("confirmMotivoError");
const preguntaCampo = document.getElementById("confirmPreguntaCampo");
const preguntaInput = document.getElementById("confirmPregunta");
const preguntaTexto = document.getElementById("confirmPreguntaTexto");

let pendingAction = null;

function openConfirm(text, action, motivo, pregunta) {
  pendingAction = action;
  title.textContent = "Confirmar acción";
  if (preguntaCampo) {
    preguntaCampo.hidden = !pregunta;
    if (pregunta) {
      preguntaTexto.textContent = pregunta;
      preguntaInput.checked = false;
    }
  }
  if (motivoCampo) {
    motivoCampo.hidden = !motivo;
    if (motivo) {
      motivoEtiqueta.textContent = motivo;
      motivoInput.value = "";
      motivoError.hidden = true;
    }
  }
  message.textContent = text || "¿Deseas continuar?";
  cancelButton.hidden = false;
  acceptButton.textContent = "Confirmar";
  overlay.classList.add("visible");
  overlay.setAttribute("aria-hidden", "false");
  acceptButton.focus();
}

function openInfo(heading, text) {
  pendingAction = null;
  title.textContent = heading;
  message.textContent = text;
  cancelButton.hidden = true;
  acceptButton.textContent = "Entendido";
  overlay.classList.add("visible");
  overlay.setAttribute("aria-hidden", "false");
  acceptButton.focus();
}

function closeConfirm() {
  pendingAction = null;
  overlay.classList.remove("visible");
  overlay.setAttribute("aria-hidden", "true");

  cancelButton.hidden = false;
  acceptButton.textContent = "Confirmar";
  title.textContent = "Confirmar acción";
}

document.addEventListener("click", (event) => {
  const trigger = event.target.closest("[data-aviso]");
  if (!trigger) return;

  event.preventDefault();
  openInfo(trigger.dataset.avisoTitulo || "No se puede realizar", trigger.dataset.aviso);
});

document.addEventListener("click", (event) => {
  const trigger = event.target.closest("a[data-confirm]");
  if (!trigger) return;

  event.preventDefault();
  openConfirm(trigger.dataset.confirm, () => {
    window.location.href = trigger.href;
  });
});

document.addEventListener("submit", (event) => {
  const form = event.target.closest("form[data-confirm]");
  if (!form || form.dataset.confirmed === "true") return;

  event.preventDefault();

  const submitter = event.submitter;

  openConfirm(form.dataset.confirm, (motivoEscrito, respuesta) => {
    if (motivoEscrito) {
      const campo = document.createElement("input");
      campo.type = "hidden";
      campo.name = "motivo";
      campo.value = motivoEscrito;
      form.appendChild(campo);
    }
    if (respuesta !== null) {
      const marca = document.createElement("input");
      marca.type = "hidden";
      marca.name = "cliente_en_mesa";
      marca.value = respuesta ? "1" : "0";
      form.appendChild(marca);
    }
    if (submitter && submitter.name) {
      const oculto = document.createElement("input");
      oculto.type = "hidden";
      oculto.name = submitter.name;
      oculto.value = submitter.value;
      form.appendChild(oculto);
    }
    form.dataset.confirmed = "true";
    form.submit();
  }, form.dataset.motivo, form.dataset.pregunta);
});

cancelButton.addEventListener("click", closeConfirm);

acceptButton.addEventListener("click", () => {

  if (motivoCampo && !motivoCampo.hidden) {
    const escrito = motivoInput.value.trim();
    if (escrito.length < 4) {
      motivoError.hidden = false;
      motivoInput.focus();
      return;
    }
  }

  const action = pendingAction;
  const motivoEscrito = motivoCampo && !motivoCampo.hidden ? motivoInput.value.trim() : null;
  const respuesta = preguntaCampo && !preguntaCampo.hidden ? preguntaInput.checked : null;
  closeConfirm();
  if (action) action(motivoEscrito, respuesta);
});

overlay.addEventListener("click", (event) => {
  if (event.target === overlay) closeConfirm();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && overlay.classList.contains("visible")) {
    closeConfirm();
  }
});

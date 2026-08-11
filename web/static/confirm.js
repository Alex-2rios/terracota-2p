const overlay = document.getElementById("confirmOverlay");
const message = document.getElementById("confirmMessage");
const cancelButton = document.getElementById("cancelConfirm");
const acceptButton = document.getElementById("acceptConfirm");

const title = document.getElementById("confirmTitle");

let pendingAction = null;

function openConfirm(text, action) {
  pendingAction = action;
  title.textContent = "Confirmar acción";
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

  openConfirm(form.dataset.confirm, () => {
    if (submitter && submitter.name) {
      const oculto = document.createElement("input");
      oculto.type = "hidden";
      oculto.name = submitter.name;
      oculto.value = submitter.value;
      form.appendChild(oculto);
    }
    form.dataset.confirmed = "true";
    form.submit();
  });
});

cancelButton.addEventListener("click", closeConfirm);

acceptButton.addEventListener("click", () => {
  const action = pendingAction;
  closeConfirm();
  if (action) action();
});

overlay.addEventListener("click", (event) => {
  if (event.target === overlay) closeConfirm();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && overlay.classList.contains("visible")) {
    closeConfirm();
  }
});

const overlay = document.getElementById("confirmOverlay");
const message = document.getElementById("confirmMessage");
const cancelButton = document.getElementById("cancelConfirm");
const acceptButton = document.getElementById("acceptConfirm");

let pendingAction = null;

function openConfirm(text, action) {
  pendingAction = action;
  message.textContent = text || "¿Deseas continuar?";
  overlay.classList.add("visible");
  overlay.setAttribute("aria-hidden", "false");
  acceptButton.focus();
}

function closeConfirm() {
  pendingAction = null;
  overlay.classList.remove("visible");
  overlay.setAttribute("aria-hidden", "true");
}

// Enlaces con confirmación
document.addEventListener("click", (event) => {
  const trigger = event.target.closest("a[data-confirm]");
  if (!trigger) return;

  event.preventDefault();
  openConfirm(trigger.dataset.confirm, () => {
    window.location.href = trigger.href;
  });
});

// Formularios con confirmación
document.addEventListener("submit", (event) => {
  const form = event.target.closest("form[data-confirm]");
  if (!form || form.dataset.confirmed === "true") return;

  event.preventDefault();

  // `form.submit()` NO incluye el botón que disparó el envío, así que se guarda
  // aquí y se reinyecta como campo oculto. Sin esto, un formulario con varios
  // botones submit (por ejemplo PDF / XLSX) perdería cuál se presionó.
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

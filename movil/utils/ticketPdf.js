import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const formatMoney = (value) => Number(value || 0).toLocaleString('es-MX', {
  style: 'currency',
  currency: 'MXN',
  minimumFractionDigits: 2,
});

export function crearHtmlTicket(ticket) {
  if (!ticket?.folio || !Array.isArray(ticket.items)) {
    throw new Error('El ticket no contiene la informacion necesaria.');
  }

  const filas = ticket.items.map((item) => {
    const cantidad = Number(item.cantidad) || 0;
    const precio = Number(item.precio) || 0;

    return `
      <tr>
        <td>${escapeHtml(item.nombre)}</td>
        <td class="center">${cantidad}</td>
        <td class="right">${formatMoney(precio * cantidad)}</td>
      </tr>`;
  }).join('');

  const cambio = Number(ticket.cambio) || 0;

  return `<!DOCTYPE html>
  <html lang="es">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Ticket ${escapeHtml(ticket.folio)}</title>
      <style>
        @page { margin: 18mm; }
        * { box-sizing: border-box; }
        body {
          margin: 0;
          color: #2e211c;
          background: #ffffff;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          font-size: 12px;
        }
        .ticket { width: 100%; max-width: 360px; margin: 0 auto; }
        h1 { margin: 0; color: #6e321f; font-size: 28px; letter-spacing: 2px; text-align: center; }
        .subtitle { margin: 3px 0 18px; color: #8a7567; text-align: center; }
        .rule { margin: 14px 0; border: 0; border-top: 1px dashed #cdb7a5; }
        .meta { display: flex; justify-content: space-between; gap: 14px; }
        .meta div { flex: 1; }
        .meta div:nth-child(2) { text-align: center; }
        .meta div:last-child { text-align: right; }
        .label { display: block; color: #8a7567; font-size: 9px; font-weight: 700; }
        .value { display: block; margin-top: 3px; font-weight: 800; }
        .date { margin: 13px 0 0; color: #8a7567; text-align: center; }
        table { width: 100%; border-collapse: collapse; }
        th { padding: 6px 0; color: #8a7567; font-size: 9px; text-align: left; }
        td { padding: 9px 0; border-bottom: 1px solid #eee5dc; }
        .center { width: 42px; text-align: center; }
        .right { width: 88px; text-align: right; }
        .summary { display: flex; justify-content: space-between; margin-top: 8px; padding: 7px 0; }
        .total { color: #6e321f; font-size: 18px; font-weight: 900; }
        .change { color: #8a7567; }
        .thanks { margin-top: 22px; color: #8a7567; text-align: center; }
      </style>
    </head>
    <body>
      <main class="ticket">
        <h1>TERRACOTA</h1>
        <p class="subtitle">cocina artesanal</p>
        <hr class="rule" />
        <section class="meta">
          <div><span class="label">FOLIO</span><span class="value">#${escapeHtml(ticket.folio)}</span></div>
          <div><span class="label">MESA</span><span class="value">${escapeHtml(ticket.mesa)}</span></div>
          <div><span class="label">METODO</span><span class="value">${escapeHtml(ticket.metodo)}</span></div>
        </section>
        <p class="date">${escapeHtml(ticket.fecha)} · ${escapeHtml(ticket.hora)}</p>
        <hr class="rule" />
        <table>
          <thead><tr><th>PRODUCTO</th><th class="center">CANT.</th><th class="right">IMPORTE</th></tr></thead>
          <tbody>${filas}</tbody>
        </table>
        <section class="summary total"><span>TOTAL</span><span>${formatMoney(ticket.total)}</span></section>
        ${cambio > 0 ? `<section class="summary change"><span>CAMBIO ENTREGADO</span><span>${formatMoney(cambio)}</span></section>` : ''}
        <p class="thanks">Gracias por tu visita</p>
      </main>
    </body>
  </html>`;
}

export async function compartirTicketPdf(ticket) {
  const html = crearHtmlTicket(ticket);

  if (Platform.OS === 'web') {
    await Print.printAsync({ html });
    return { modo: 'impresion' };
  }

  const sharingDisponible = await Sharing.isAvailableAsync();
  if (!sharingDisponible) {
    throw new Error('Este dispositivo no permite compartir archivos.');
  }

  const { uri } = await Print.printToFileAsync({ html, base64: false });
  await Sharing.shareAsync(uri, {
    dialogTitle: `Compartir ticket #${ticket.folio}`,
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
  });

  return { modo: 'compartir', uri };
}

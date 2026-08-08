FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN useradd --create-home --uid 10002 terracota && chown -R terracota:terracota /app
USER terracota

EXPOSE 5000

# Comprueba que Flask sirve, no que la API esté viva: si la API se cae un
# momento, el panel sigue funcionando y no debe marcarse como enfermo.
# (urlopen lanza excepción con 503, por eso no se apunta a /salud.)
HEALTHCHECK --interval=20s --timeout=5s --start-period=15s --retries=5 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:5000/', timeout=4).status == 200 else 1)"

# Servidor WSGI de producción; nunca el servidor de desarrollo de Flask.
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "2", "--timeout", "60", "app:app"]

import eventlet
eventlet.monkey_patch()

import os, json, re, csv, io, traceback
from datetime import datetime
from flask import Flask, request, jsonify, make_response
from flask_socketio import SocketIO
from dotenv import load_dotenv
from flask_cors import CORS
import requests

load_dotenv()

# ---------- ORIGINS / CORS ----------
RAW_ORIGINS = os.getenv("CORS_ORIGINS") or os.getenv("FRONTEND_ORIGIN", "")
ALLOWED_ORIGINS = [o.strip() for o in RAW_ORIGINS.split(",") if o.strip()]
ALLOW_ANY = ("*" in ALLOWED_ORIGINS) or (not ALLOWED_ORIGINS)

# Vars de ambiente
FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")
DATA_FILE = os.getenv("DATA_FILE")
SHEET_CSV_URL = os.getenv("SHEET_CSV_URL", "").strip()

# App
app = Flask(__name__)

# Flask-CORS
CORS(app, resources={
    r"/api/*":     {"origins": ALLOWED_ORIGINS if not ALLOW_ANY else "*"},
    r"/webhook/*": {"origins": "*"},
})

# Socket.IO
socketio = SocketIO(
    app,
    async_mode="eventlet",
    cors_allowed_origins="*" if ALLOW_ANY else ALLOWED_ORIGINS
)

# Preflight (OPTIONS)
@app.before_request
def handle_preflight():
    if request.method == "OPTIONS":
        resp = make_response("", 204)
        origin = request.headers.get("Origin")
        if ALLOW_ANY or (origin and origin in ALLOWED_ORIGINS):
            resp.headers["Access-Control-Allow-Origin"] = origin if not ALLOW_ANY else "*"
            resp.headers["Vary"] = "Origin"
        req_headers = request.headers.get("Access-Control-Request-Headers", "Content-Type, Authorization")
        resp.headers["Access-Control-Allow-Headers"] = req_headers
        resp.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
        return resp
    return None

# Headers CORS em todas as respostas
@app.after_request
def add_cors_headers(resp):
    origin = request.headers.get("Origin")
    if ALLOW_ANY:
        if origin:
            resp.headers["Access-Control-Allow-Origin"] = origin
            resp.headers["Vary"] = "Origin"
        else:
            resp.headers["Access-Control-Allow-Origin"] = "*"
    elif origin in ALLOWED_ORIGINS:
        resp.headers["Access-Control-Allow-Origin"] = origin
        resp.headers["Vary"] = "Origin"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    resp.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    return resp

# ---------- Helpers de storage ----------
NOME_KEYS   = [s.strip() for s in os.getenv("SHEET_NOME_KEYS", "nome,Nome,NOME,Nome:").split(",")]
NUMERO_KEYS = [s.strip() for s in os.getenv("SHEET_NUMERO_KEYS", "numero,numero_processo,número_processo,processo,Número do processo,Nº Processo").split(",")]
TS_KEYS     = [s.strip() for s in os.getenv("SHEET_TIMESTAMP_KEYS", "timestamp,Timestamp,Carimbo de data/hora,Data/hora,Data,Submitted At,Submission Time").split(",")]
VALOR_KEYS  = [s.strip() for s in os.getenv("SHEET_VALOR_KEYS", "valor,Valor,Valor da Causa em,Valor da Causa em Reais (R$):,Valor da Causa").split(",")]

def load_data():
    try:
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return []

def save_data(data):
    os.makedirs(os.path.dirname(DATA_FILE), exist_ok=True)
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def coalesce(d, keys, default=""):
    for k in keys:
        if isinstance(d, dict) and k in d and str(d[k]).strip() != "":
            return str(d[k]).strip()
    return default

_TS_FORMATS = [
    "%Y-%m-%dT%H:%M:%S.%fZ",
    "%Y-%m-%d %H:%M:%S",
    "%d/%m/%Y %H:%M:%S",
    "%d/%m/%Y %H:%M",
    "%m/%d/%Y %H:%M:%S",
]

def parse_ts(val):
    s = (val or "").strip()
    if not s:
        return datetime.utcnow().isoformat() + "Z"
    for fmt in _TS_FORMATS:
        try:
            dt = datetime.strptime(s, fmt)
            return dt.isoformat() + ("Z" if fmt.endswith("Z") else "")
        except ValueError:
            pass
    try:
        return datetime.fromisoformat(s.replace("Z", "").replace(" ", "T")).isoformat() + "Z"
    except Exception:
        return datetime.utcnow().isoformat() + "Z"

def parse_valor(val):
    s = str(val or "").strip()
    if not s:
        return None
    s = re.sub(r"[^0-9,\.]", "", s)
    if "," in s and "." in s:
        s = s.replace(".", "").replace(",", ".")
    elif "," in s:
        s = s.replace(",", ".")
    try:
        return float(s)
    except Exception:
        return None

def deep_values(obj):
    if isinstance(obj, dict):
        yield obj
        for v in obj.values():
            yield from deep_values(v)
    elif isinstance(obj, list):
        for v in obj:
            yield from deep_values(v)

def pick_by_titles(payload, titles):
    T = set(titles)
    for node in deep_values(payload):
        if isinstance(node, dict):
            t = node.get("title") or node.get("question") or node.get("label") or node.get("name")
            if t in T:
                return node.get("value") or node.get("answer") or node.get("response") or node.get("text")
    return None

def get_any(payload, keys_or_titles, default=None):
    if isinstance(payload, dict):
        for k in keys_or_titles:
            if k in payload and str(payload[k]).strip() != "":
                return str(payload[k]).strip()
    for node in deep_values(payload):
        if isinstance(node, dict):
            for k in keys_or_titles:
                if k in node and str(node[k]).strip() != "":
                    return str(node[k]).strip()
    v = pick_by_titles(payload, keys_or_titles)
    if v not in (None, ""):
        return str(v).strip()
    return default

def normalize_row(row: dict):
    nome_titles   = ["Nome", "Nome:", "nome", "Nome do responsável"]
    numero_titles = ["Número do processo", "Número do processo:", "numero_processo", "número_processo", "processo"]
    ts_titles     = ["timestamp", "Timestamp", "Carimbo de data/hora", "Data/hora", "Data"]
    valor_titles  = ["Valor da Causa em", "Valor da Causa em Reais (R$):", "Valor da Causa", "Valor", "valor"]

    nome   = get_any(row,   nome_titles   + NOME_KEYS,   default="—")
    numero = get_any(row, numero_titles + NUMERO_KEYS,   default="—")
    ts     = get_any(row,     ts_titles     + TS_KEYS,   default="")
    v_raw  = get_any(row,   valor_titles   + VALOR_KEYS, default="")

    numero    = re.sub(r"\s+", " ", str(numero or "—")).strip()
    timestamp = parse_ts(ts)
    valor     = parse_valor(v_raw)

    _id = f"{numero}|{timestamp}"
    return {"nome": nome or "—", "numero": numero or "—", "timestamp": timestamp, "valor": valor, "_id": _id}

def dedupe(items):
    seen, out = set(), []
    for it in items:
        _id = it.get("_id") or f"{it.get('numero','—')}|{it.get('timestamp','')}"
        if _id not in seen:
            seen.add(_id)
            out.append({**it, "_id": _id})
    return out

# ---------- Rotas ----------
@app.post("/webhook/form")
def webhook_form():
    try:
        payload = request.get_json(force=True, silent=True) or {}
        print("Payload bruto:", json.dumps(payload, ensure_ascii=False)[:800])

        norm = normalize_row(payload)
        data = load_data()
        data.append(norm)
        data = dedupe(data)
        save_data(data)

        socketio.emit("form_update", norm, namespace="/")
        print("OK (normalizado):", json.dumps(norm, ensure_ascii=False))
        return jsonify({"ok": True})
    except Exception as e:
        tb = traceback.format_exc()
        print("ERRO /webhook/form:", e, "\n", tb)
        return jsonify({"ok": False, "error": str(e)}), 500

@app.route("/api/entries", methods=["GET", "OPTIONS"])
def get_entries():
    if request.method == "OPTIONS":
        return "", 204
    return jsonify(load_data())

@app.route("/api/reset", methods=["POST", "OPTIONS"])
def reset_data():
    if request.method == "OPTIONS":
        return "", 204
    save_data([])
    socketio.emit("form_update", {"reset": True}, namespace="/")
    return jsonify({"ok": True})

@app.post("/api/backfill_csv")
def backfill_csv():
    if not SHEET_CSV_URL:
        return jsonify({"ok": False, "error": "SHEET_CSV_URL não configurada"}), 400
    try:
        r = requests.get(SHEET_CSV_URL, timeout=20)
        r.raise_for_status()
        text = r.content.decode("utf-8", errors="replace")
        reader = csv.DictReader(io.StringIO(text))
        rows = list(reader)
        mapped = [normalize_row(row) for row in rows]

        current = load_data()
        merged = dedupe(mapped + current)
        save_data(merged)

        for it in mapped:
            socketio.emit("form_update", it, namespace="/")

        return jsonify({
            "ok": True,
            "rows_from_csv": len(rows),
            "added_total": len(merged) - len(current),
            "total_now": len(merged)
        })
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 400

@app.get("/healthz")
def healthz():
    return "ok", 200

if __name__ == "__main__":
    print(">> dev http://127.0.0.1:5000")
    socketio.run(app, host="0.0.0.0", port=5000)

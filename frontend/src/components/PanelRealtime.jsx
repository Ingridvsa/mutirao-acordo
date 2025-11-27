import { useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";
// import CircleProgress from "./CircleProgress"; // ❌ não precisamos mais
import "../App.css";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;
const STORAGE_KEY = "gol-monitor-acordos:v1";

const socket = io(BACKEND_URL, {
  transports: ["websocket", "polling"],
  path: "/socket.io",
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
});

socket.on("connect", () => console.log("Conectado ao backend:", socket.id));
socket.on("connect_error", (err) => console.error("Erro Socket.IO:", err.message));
socket.on("disconnect", (reason) => console.warn("Desconectado:", reason));

export default function PanelRealtime() {
  const [items, setItems] = useLocalStorageState(STORAGE_KEY, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/entries`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (Array.isArray(data)) {
          setItems((prev) => sortDesc(uniqById([...data.map(normalizeItem), ...prev])));
        }
      } catch (e) {
        console.warn("Erro buscando snapshot:", e);
      }
    })();
  }, [setItems]);

  // Realtime via socket
  useEffect(() => {
    const handler = (msg) => {
      if (msg?.reset) {
        setItems([]);
        localStorage.removeItem(STORAGE_KEY);
        return;
      }
      const item = normalizeItem(msg);
      setItems((prev) => sortDesc(uniqById([item, ...prev])));
    };
    socket.on("form_update", handler);
    return () => socket.off("form_update", handler);
  }, [setItems]);

  // ❌ não precisamos mais da porcentagem nem do círculo
  // const percent = useMemo(() => {
  //   return Math.min(100, Math.round((items.length / TARGET) * 100));
  // }, [items.length]);

  // zerar dados
  const handleReset = async () => {
    if (!window.confirm("Tem certeza que deseja zerar todos os dados do painel?")) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/reset`, { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        setItems([]);
        localStorage.removeItem(STORAGE_KEY);
        alert("Painel zerado com sucesso!");
      } else {
        alert("Erro ao zerar: " + (data.error || "desconhecido"));
      }
    } catch {
      alert("Falha ao comunicar com o servidor.");
    }
  };

  return (
    <div className="panel">
      <header
        className="panel-header"
        style={{ display: "flex", gap: 16, alignItems: "center", justifyContent: "space-between" }}
      >
        <div className="title">
          {/* ✅ novo título */}
          <h1>🧳 Acordos GOL</h1>
          {/* ✅ subtópico com quantidade */}
          <p>
            <strong>Quantidade acordos fechados:</strong> {items.length}
          </p>
        </div>

        {/* Se ainda quiser o botão de reset, pode ficar aqui, por exemplo */}
        {/* <button onClick={handleReset}>Zerar painel</button> */}
      </header>

      <section className="list-container">
        <h2>Últimos Acordos Fechados:</h2>
        <div className="scrollable">
          {items.length === 0 ? (
            <p className="empty">Nenhuma resposta ainda…</p>
          ) : (
            items.map((it, i) => (
              <div key={makeId(it)} className="item">
                <div>
                  {/* Pode manter a numeração do acordo, se quiser */}
                  <strong>{`${items.length - i}º acordo`}</strong>
                </div>
                {/* ✅ nome + número do processo */}
                <div>
                  <span>{it.nome} — {it.numero}</span>
                </div>
                {/* ✅ data e hora */}
                <div>
                  <small>{new Date(it.timestamp).toLocaleString()}</small>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function useLocalStorageState(key, initialValue) {
  const read = () => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.map(normalizeItem);
        return parsed;
      }
    } catch {}
    return typeof initialValue === "function" ? initialValue() : initialValue;
  };

  const [state, _setState] = useState(read);

  const setState = (updater) => {
    _setState((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch (e) {
        console.warn("Falha ao gravar localStorage:", e);
      }
      return next;
    });
  };

  // sincroniza com outras abas
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === key) {
        try {
          const next = e.newValue ? JSON.parse(e.newValue) : [];
          _setState(Array.isArray(next) ? next.map(normalizeItem) : next);
        } catch {}
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [key]);

  return [state, setState];
}

function normalizeItem(msg) {
  const nome = msg?.nome || msg?.Nome || msg?.NOME || "—";
  const numero =
    msg?.numero ||
    msg?.numero_processo ||
    msg?.número_processo ||
    msg?.processo ||
    "—";
  const ts = msg?.timestamp ?? new Date().toISOString();
  const timestamp = new Date(ts).toISOString();
  return { nome, numero, timestamp, _id: `${(numero || "—").trim()}|${timestamp}` };
}

function uniqById(list) {
  const seen = new Set();
  const out = [];
  for (const it of list) {
    const id = it._id ?? makeId(it);
    if (!seen.has(id)) {
      seen.add(id);
      out.push({ ...it, _id: id });
    }
  }
  return out;
}

function sortDesc(list) {
  return [...list].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

function makeId(it) {
  const num = (it.numero || "—").trim();
  const ts = new Date(it.timestamp ?? Date.now()).toISOString();
  return `${num}|${ts}`;
}

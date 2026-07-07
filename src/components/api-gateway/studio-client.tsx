"use client";

import { useEffect, useRef, useState } from "react";
import type { StudioClientOption, StudioModelOption } from "@/server/api-gateway/adminData";

interface StudioResult {
  requestId: string;
  model: string;
  creditCost: number;
  balanceAfter: number;
  urls: string[];
}

function isVideoUrl(url: string) {
  return /\.(mp4|webm|mov)(\?|$)/i.test(url);
}

const panelStyle: React.CSSProperties = {
  border: "1px solid rgba(120, 120, 120, 0.25)",
  borderRadius: 12,
  padding: 16
};

const fieldStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  fontSize: 13
};

const inputStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid rgba(120, 120, 120, 0.35)",
  fontSize: 14,
  background: "transparent",
  color: "inherit"
};

export function StudioClient({
  clients,
  models
}: {
  clients: StudioClientOption[];
  models: StudioModelOption[];
}) {
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [modelName, setModelName] = useState(models[0]?.name ?? "");
  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [duration, setDuration] = useState("5");
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<StudioResult | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const activeModel = models.find((model) => model.name === modelName);
  const activeClient = clients.find((client) => client.id === clientId);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  async function generate() {
    if (!prompt.trim() || busy) return;

    setBusy(true);
    setError(null);
    setResult(null);
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed((value) => value + 1), 1000);

    try {
      const response = await fetch("/api/admin/api-gateway/studio/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          model: modelName,
          prompt,
          aspectRatio,
          ...(activeModel?.supportsDuration ? { duration } : {})
        })
      });
      const data = (await response.json()) as
        | { ok: true; data: StudioResult }
        | { error?: { message?: string } }
        | StudioResult;

      if (!response.ok) {
        const message =
          typeof data === "object" && data && "error" in data
            ? (data.error?.message ?? "Үүсгэлт амжилтгүй боллоо.")
            : "Үүсгэлт амжилтгүй боллоо.";
        throw new Error(message);
      }

      const payload =
        typeof data === "object" && data && "ok" in data && data.ok
          ? data.data
          : (data as StudioResult);
      setResult(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Үүсгэлт амжилтгүй боллоо.");
    } finally {
      if (timerRef.current) clearInterval(timerRef.current);
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(280px, 380px) 1fr",
        gap: 16,
        alignItems: "start"
      }}
    >
      <div style={{ ...panelStyle, display: "flex", flexDirection: "column", gap: 12 }}>
        <label style={fieldStyle}>
          Хэрэглэгч (тооцоо энэ данснаас)
          <select style={inputStyle} value={clientId} onChange={(e) => setClientId(e.target.value)}>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name} — {client.creditBalance}₮
              </option>
            ))}
          </select>
        </label>
        <label style={fieldStyle}>
          Модель
          <select style={inputStyle} value={modelName} onChange={(e) => setModelName(e.target.value)}>
            {models.map((model) => (
              <option key={model.id} value={model.name}>
                {model.name} {model.kind === "video" ? "🎬" : "🖼"}
              </option>
            ))}
          </select>
        </label>
        <label style={fieldStyle}>
          Prompt
          <textarea
            style={{ ...inputStyle, minHeight: 120, resize: "vertical" }}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Юу үүсгэхээ дэлгэрэнгүй бичээрэй..."
          />
        </label>
        <div style={{ display: "flex", gap: 12 }}>
          <label style={{ ...fieldStyle, flex: 1 }}>
            Хэмжээс
            <select style={inputStyle} value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value)}>
              <option value="16:9">16:9</option>
              <option value="9:16">9:16</option>
              <option value="1:1">1:1</option>
              <option value="auto">auto</option>
            </select>
          </label>
          {activeModel?.supportsDuration ? (
            <label style={{ ...fieldStyle, flex: 1 }}>
              Хугацаа (сек)
              <select style={inputStyle} value={duration} onChange={(e) => setDuration(e.target.value)}>
                <option value="5">5</option>
                <option value="10">10</option>
              </select>
            </label>
          ) : null}
        </div>
        <button
          type="button"
          onClick={generate}
          disabled={busy || !prompt.trim() || !clientId || !modelName}
          style={{
            padding: "10px 16px",
            borderRadius: 8,
            border: "none",
            background: busy ? "rgba(120,120,120,0.4)" : "#e8590c",
            color: "#fff",
            fontSize: 15,
            fontWeight: 600,
            cursor: busy ? "wait" : "pointer"
          }}
        >
          {busy ? `Үүсгэж байна... ${elapsed}с` : "Үүсгэх"}
        </button>
        {activeModel?.kind === "video" ? (
          <p style={{ fontSize: 12, opacity: 0.7, margin: 0 }}>
            Видео 1-5 минут үргэлжилж болно — хуудсаа хаахгүй хүлээгээрэй.
          </p>
        ) : null}
        {error ? <p style={{ color: "#e03131", fontSize: 13, margin: 0 }}>{error}</p> : null}
      </div>

      <div style={{ ...panelStyle, minHeight: 320 }}>
        {result ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {result.urls.map((url) =>
              isVideoUrl(url) ? (
                <video
                  key={url}
                  src={url}
                  controls
                  autoPlay
                  style={{ width: "100%", borderRadius: 8, background: "#000" }}
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- remote short-lived Kie URL
                <img key={url} src={url} alt={result.model} style={{ width: "100%", borderRadius: 8 }} />
              )
            )}
            <p style={{ fontSize: 13, margin: 0 }}>
              <strong>{result.model}</strong> · зарцуулсан {result.creditCost}₮ · үлдэгдэл{" "}
              {result.balanceAfter}₮ ·{" "}
              {result.urls.map((url, index) => (
                <a key={url} href={url} target="_blank" rel="noreferrer">
                  татах{result.urls.length > 1 ? ` #${index + 1}` : ""}
                </a>
              ))}
            </p>
          </div>
        ) : busy ? (
          <div style={{ display: "grid", placeItems: "center", height: "100%", minHeight: 280 }}>
            <p style={{ opacity: 0.7 }}>
              {activeClient?.name ?? ""} — {modelName} ажиллаж байна... {elapsed}с
            </p>
          </div>
        ) : (
          <div style={{ display: "grid", placeItems: "center", height: "100%", minHeight: 280 }}>
            <p style={{ opacity: 0.5 }}>Үр дүн энд гарна</p>
          </div>
        )}
      </div>
    </div>
  );
}

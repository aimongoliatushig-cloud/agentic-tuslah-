"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import type { ApiClient, ApiModel } from "@/server/api-gateway/types";

type ActionState = {
  message: string;
  apiKey?: string;
  loading: boolean;
};

const initialState: ActionState = { message: "", loading: false };

export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  disabled,
  onConfirm
}: {
  title: string;
  description: string;
  confirmLabel: string;
  disabled?: boolean;
  onConfirm?: () => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function confirm() {
    setLoading(true);
    setError("");

    try {
      await onConfirm?.();
      setOpen(false);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Үйлдэл амжилтгүй боллоо.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button className="action-button danger" disabled={disabled} onClick={() => setOpen(true)} type="button">
        {confirmLabel}
      </button>
      {open ? (
        <div className="modal-backdrop" role="presentation">
          <section className="modal-panel compact" role="dialog" aria-modal="true" aria-label={title}>
            <div className="modal-head">
              <h2>{title}</h2>
              <button type="button" onClick={() => setOpen(false)}>
                Хаах
              </button>
            </div>
            <p className="dialog-copy">{description}</p>
            {error ? <p className="form-message">{error}</p> : null}
            <div className="modal-actions">
              <button className="action-button secondary" type="button" onClick={() => setOpen(false)}>
                Болих
              </button>
              <button className="action-button danger" disabled={loading} type="button" onClick={confirm}>
                Батлах
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

export function UserFormModal() {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<ActionState>(initialState);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setState({ message: "Үүсгэж байна...", loading: true });
    const response = await fetch("/api/admin/api-gateway/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        initialCredit: 0,
        metadata: { email: form.get("email") }
      })
    });
    const data = (await response.json()) as { apiKey?: string; error?: string };
    setState({
      message: response.ok
        ? "Хэрэглэгч үүслээ. API түлхүүрийг зөвхөн нэг удаа харуулж байна."
        : data.error ?? "Үүсгэхэд алдаа гарлаа.",
      apiKey: data.apiKey,
      loading: false
    });
  }

  return (
    <>
      <button className="primary-command" type="button" onClick={() => setOpen(true)}>
        Шинэ хэрэглэгч
      </button>
      {open ? (
        <div className="modal-backdrop" role="presentation">
          <section className="modal-panel" role="dialog" aria-modal="true" aria-label="Шинэ хэрэглэгч үүсгэх">
            <div className="modal-head">
              <h2>Шинэ хэрэглэгч үүсгэх</h2>
              <button type="button" onClick={() => setOpen(false)}>
                Хаах
              </button>
            </div>
            <form className="form-grid" onSubmit={onSubmit}>
              <label>
                <span>Нэр</span>
                <input name="name" required />
              </label>
              <label>
                <span>Имэйл</span>
                <input name="email" type="email" />
              </label>
              <button className="primary-command" disabled={state.loading} type="submit">
                Үүсгэх
              </button>
            </form>
            {state.message ? <p className="form-message">{state.message}</p> : null}
            {state.apiKey ? <code className="api-key-once">{state.apiKey}</code> : null}
          </section>
        </div>
      ) : null}
    </>
  );
}

export function CreditModal({ client }: { client: ApiClient }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<ActionState>(initialState);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setState({ message: "Кредит нэмж байна...", loading: true });
    const response = await fetch(`/api/admin/api-gateway/clients/${client.id}/add-credit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: Number(form.get("amount") ?? 0),
        note: form.get("note") || "Admin UI кредит нэмэлт"
      })
    });
    const data = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
    setState({
      message: response.ok
        ? "Кредит амжилттай нэмэгдлээ."
        : data.error?.message ?? "Кредит нэмэхэд алдаа гарлаа.",
      loading: false
    });

    if (response.ok) {
      router.refresh();
    }
  }

  return (
    <>
      <button className="action-button secondary" type="button" onClick={() => setOpen(true)}>
        Кредит нэмэх
      </button>
      {open ? (
        <div className="modal-backdrop" role="presentation">
          <section className="modal-panel compact" role="dialog" aria-modal="true" aria-label="Кредит нэмэх">
            <div className="modal-head">
              <h2>Кредит нэмэх</h2>
              <button type="button" onClick={() => setOpen(false)}>
                Хаах
              </button>
            </div>
            <form className="form-grid" onSubmit={onSubmit}>
              <p className="dialog-copy">{client.name}</p>
              <label>
                <span>Дүн</span>
                <input min="1" name="amount" required type="number" defaultValue="10" />
              </label>
              <label>
                <span>Тайлбар</span>
                <input name="note" defaultValue="Admin UI кредит нэмэлт" />
              </label>
              <button className="primary-command" disabled={state.loading} type="submit">
                Нэмэх
              </button>
            </form>
            {state.message ? <p className="form-message">{state.message}</p> : null}
          </section>
        </div>
      ) : null}
    </>
  );
}

export function ApiKeyModal({ client }: { client: ApiClient }) {
  const [state, setState] = useState<ActionState>(initialState);

  async function regenerate() {
    setState({ message: "Шинэ түлхүүр үүсгэж байна...", loading: true });
    const response = await fetch(`/api/admin/api-gateway/clients/${client.id}/regenerate-key`, {
      method: "POST"
    });
    const data = (await response.json()) as { apiKey?: string; error?: string };
    setState({
      message: response.ok
        ? "Шинэ API түлхүүрийг зөвхөн нэг удаа харуулж байна."
        : data.error ?? "Түлхүүр үүсгэхэд алдаа гарлаа.",
      apiKey: data.apiKey,
      loading: false
    });
  }

  return (
    <div className="stacked-action">
      <button className="action-button secondary" disabled={state.loading} type="button" onClick={regenerate}>
        API түлхүүр шинээр үүсгэх
      </button>
      {state.message ? <small>{state.message}</small> : null}
      {state.apiKey ? <code className="api-key-once inline">{state.apiKey}</code> : null}
    </div>
  );
}

export function ModelFormModal() {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<ActionState>(initialState);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setState({ message: "Модель үүсгэж байна...", loading: true });
    const response = await fetch("/api/admin/api-gateway/models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        providerModel: form.get("providerModel"),
        creditCost: Number(form.get("creditCost") ?? 1),
        billingType: form.get("billingType"),
        input1kTokenPriceMnt: Number(form.get("input1kTokenPriceMnt") ?? 0),
        output1kTokenPriceMnt: Number(form.get("output1kTokenPriceMnt") ?? 0),
        unitPriceMnt: Number(form.get("unitPriceMnt") ?? 0),
        inputCacheHit1mTokenPriceUsd: Number(form.get("inputCacheHit1mTokenPriceUsd") ?? 0),
        inputCacheMiss1mTokenPriceUsd: Number(form.get("inputCacheMiss1mTokenPriceUsd") ?? 0),
        output1mTokenPriceUsd: Number(form.get("output1mTokenPriceUsd") ?? 0),
        unitPriceUsd: Number(form.get("unitPriceUsd") ?? 0),
        pricingSourceUrl: form.get("pricingSourceUrl"),
        status: "active",
        config: { type: form.get("type") }
      })
    });
    const data = (await response.json()) as { error?: string };
    setState({
      message: response.ok ? "Модель амжилттай үүслээ." : data.error ?? "Модель үүсгэхэд алдаа гарлаа.",
      loading: false
    });
  }

  return (
    <>
      <button className="primary-command" type="button" onClick={() => setOpen(true)}>
        Шинэ модель
      </button>
      {open ? (
        <div className="modal-backdrop" role="presentation">
          <section className="modal-panel" role="dialog" aria-modal="true" aria-label="Шинэ модель">
            <div className="modal-head">
              <h2>Шинэ модель</h2>
              <button type="button" onClick={() => setOpen(false)}>
                Хаах
              </button>
            </div>
            <form className="form-grid" onSubmit={onSubmit}>
              <label>
                <span>Нэр</span>
                <input name="name" required />
              </label>
              <label>
                <span>Provider Model ID</span>
                <input name="providerModel" required />
              </label>
              <label>
                <span>Төрөл</span>
                <select name="type" defaultValue="Text">
                  <option>Text</option>
                  <option>Image</option>
                  <option>Video</option>
                  <option>Voice</option>
                </select>
              </label>
              <label>
                <span>Нэгж үнэ</span>
                <input min="1" name="creditCost" type="number" defaultValue="1" />
              </label>
              <label>
                <span>Billing type</span>
                <select name="billingType" defaultValue="credit">
                  <option value="credit">Credit</option>
                  <option value="token">Token</option>
                  <option value="image">Image</option>
                  <option value="request">Request</option>
                </select>
              </label>
              <label>
                <span>Input 1K token price (MNT)</span>
                <input min="0" name="input1kTokenPriceMnt" step="0.0001" type="number" defaultValue="0" />
              </label>
              <label>
                <span>Output 1K token price (MNT)</span>
                <input min="0" name="output1kTokenPriceMnt" step="0.0001" type="number" defaultValue="0" />
              </label>
              <label>
                <span>Unit price (MNT)</span>
                <input min="0" name="unitPriceMnt" step="0.0001" type="number" defaultValue="0" />
              </label>
              <label>
                <span>Cache hit 1M token price (USD)</span>
                <input min="0" name="inputCacheHit1mTokenPriceUsd" step="0.00000001" type="number" defaultValue="0" />
              </label>
              <label>
                <span>Cache miss 1M token price (USD)</span>
                <input min="0" name="inputCacheMiss1mTokenPriceUsd" step="0.00000001" type="number" defaultValue="0" />
              </label>
              <label>
                <span>Output 1M token price (USD)</span>
                <input min="0" name="output1mTokenPriceUsd" step="0.00000001" type="number" defaultValue="0" />
              </label>
              <label>
                <span>Unit price (USD)</span>
                <input min="0" name="unitPriceUsd" step="0.00000001" type="number" defaultValue="0" />
              </label>
              <label>
                <span>Pricing source URL</span>
                <input name="pricingSourceUrl" type="url" />
              </label>
              <button className="primary-command" disabled={state.loading} type="submit">
                Үүсгэх
              </button>
            </form>
            {state.message ? <p className="form-message">{state.message}</p> : null}
          </section>
        </div>
      ) : null}
    </>
  );
}

export function UsageLogDrawer({
  providerResponse,
  errorMessage,
  costBreakdown
}: {
  providerResponse: unknown;
  errorMessage: string | null;
  costBreakdown?: unknown;
}) {
  const [open, setOpen] = useState(false);
  const formatted = useMemo(() => JSON.stringify(providerResponse, null, 2), [providerResponse]);
  const formattedCost = useMemo(() => JSON.stringify(costBreakdown ?? {}, null, 2), [costBreakdown]);
  return (
    <>
      <button className="table-link-button" type="button" onClick={() => setOpen(true)}>
        Дэлгэрэнгүй
      </button>
      {open ? (
        <aside className="drawer-panel" aria-label="Хэрэглээний metadata">
          <div className="drawer-head">
            <h2>Хүсэлт ба хариу metadata</h2>
            <button type="button" onClick={() => setOpen(false)}>
              Хаах
            </button>
          </div>
          <h3>Request metadata</h3>
          <pre>{errorMessage ? `Алдаа: ${errorMessage}` : "Амжилттай хүсэлт"}</pre>
          <h3>Cost breakdown</h3>
          <pre>{formattedCost}</pre>
          <h3>Response metadata</h3>
          <pre>{formatted}</pre>
        </aside>
      ) : null}
    </>
  );
}

export function ClientRowActions({ client }: { client: ApiClient }) {
  const router = useRouter();
  const nextStatus = client.status === "active" ? "disabled" : "active";
  const statusActionLabel = client.status === "active" ? "Идэвхгүй болгох" : "Идэвхжүүлэх";

  async function updateStatus() {
    const response = await fetch(`/api/admin/api-gateway/clients/${client.id}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus })
    });

    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
      throw new Error(data.error?.message ?? "Client status update failed.");
    }

    router.refresh();
  }

  return (
    <div className="row-actions">
      <button type="button">Харах</button>
      <button type="button">Засах</button>
      <CreditModal client={client} />
      <ApiKeyModal client={client} />
      <ConfirmDialog
        title={statusActionLabel}
        description={`${client.name} хэрэглэгчийн төлөвийг ${
          nextStatus === "active" ? "идэвхтэй" : "идэвхгүй"
        } болгоно.`}
        confirmLabel={statusActionLabel}
        onConfirm={updateStatus}
      />
    </div>
  );
}

export function ModelRowActions({ model }: { model: ApiModel }) {
  return (
    <div className="row-actions">
      <button type="button">Засах</button>
      <ConfirmDialog
        disabled
        title="Модель идэвхгүй болгох"
        description={`${model.name} моделийг идэвхгүй болгох endpoint хараахан нэмэгдээгүй байна.`}
        confirmLabel="Идэвхгүй болгох"
      />
    </div>
  );
}

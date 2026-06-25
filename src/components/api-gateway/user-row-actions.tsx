"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { ConfirmDialog, CreditModal } from "@/components/api-gateway/admin-actions";
import type { ApiClient, ApiKey } from "@/server/api-gateway/types";

type ActionState = {
  message: string;
  apiKey?: string;
  loading: boolean;
};

type ClientWithKeys = ApiClient & { apiKeys?: ApiKey[] };

const initialState: ActionState = { message: "", loading: false };

function keyStatusLabel(status: string) {
  if (status === "active") return "Идэвхтэй";
  if (status === "revoked") return "Устсан";
  if (status === "suspended") return "Түр зогссон";
  return status;
}

function ApiKeyManagerModal({ client }: { client: ClientWithKeys }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<ActionState>(initialState);
  const apiKeys = Array.isArray(client.apiKeys) ? client.apiKeys : [];
  const activeKeyCount = apiKeys.filter((key) => key.status === "active").length;

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

    if (response.ok) {
      router.refresh();
    }
  }

  async function deleteKey(key: ApiKey) {
    const response = await fetch(`/api/admin/api-gateway/clients/${client.id}/keys/${key.id}`, {
      method: "DELETE"
    });

    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
      throw new Error(data.error?.message ?? "API түлхүүр устгахад алдаа гарлаа.");
    }

    setState({
      message: `${key.key_preview} түлхүүр устгагдлаа. Хэрэглээний бүртгэл болон төлбөрийн түүх хэвээр үлдэнэ.`,
      loading: false
    });
    router.refresh();
  }

  return (
    <>
      <button
        className="action-button secondary"
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`${client.name} хэрэглэгчийн API түлхүүрүүд`}
      >
        Түлхүүрүүд
      </button>
      {open ? (
        <div className="modal-backdrop" role="presentation">
          <section className="modal-panel key-manager-panel" role="dialog" aria-modal="true" aria-label="API түлхүүрийн удирдлага">
            <div className="modal-head">
              <div>
                <h2>API түлхүүрийн удирдлага</h2>
                <p>{client.name}</p>
              </div>
              <button type="button" onClick={() => setOpen(false)}>
                Хаах
              </button>
            </div>
            <div className="key-manager-summary">
              <strong>{activeKeyCount}</strong>
              <span>идэвхтэй түлхүүр байна. Шинэ түлхүүр үүсгэвэл бүтнээр нь зөвхөн нэг удаа харуулна.</span>
            </div>
            <button className="primary-command" disabled={state.loading} type="button" onClick={regenerate}>
              Шинэ API түлхүүр үүсгэх
            </button>
            {state.message ? <p className="form-message">{state.message}</p> : null}
            {state.apiKey ? <code className="api-key-once">{state.apiKey}</code> : null}
            {apiKeys.length > 0 ? (
              <div className="key-action-list">
                {apiKeys.map((key) => (
                  <div className="key-action-row" key={key.id}>
                    <span>
                      <code>{key.key_preview}</code>
                      <small>{keyStatusLabel(key.status)}</small>
                    </span>
                    <ConfirmDialog
                      title="API түлхүүр устгах"
                      description={`${key.key_preview} түлхүүрийг устгана. Энэ үйлдлийг буцаах боломжгүй. Хэрэглээний бүртгэл болон төлбөрийн түүх хэвээр үлдэнэ.`}
                      triggerLabel="Устгах"
                      confirmLabel="Устгах"
                      confirmationText="УСТГАХ"
                      disabled={key.status !== "active"}
                      onConfirm={() => deleteKey(key)}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <p className="empty-text">API түлхүүр одоогоор алга. Шинэ түлхүүр үүсгэж хэрэглэгчид өгнө.</p>
            )}
          </section>
        </div>
      ) : null}
    </>
  );
}

function readClientEmail(client: ClientWithKeys) {
  const metadata = client.metadata;
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    const email = (metadata as Record<string, unknown>).email;
    return typeof email === "string" ? email : "";
  }
  return "";
}

function EditClientModal({ client }: { client: ClientWithKeys }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(client.name);
  const [email, setEmail] = useState(readClientEmail(client));
  const [state, setState] = useState<ActionState>(initialState);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState({ message: "Хадгалж байна...", loading: true });
    const response = await fetch(`/api/admin/api-gateway/clients/${client.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), email: email.trim() })
    });
    const data = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
    setState({
      message: response.ok ? "Хадгалагдлаа." : data.error?.message ?? "Хадгалахад алдаа гарлаа.",
      loading: false
    });

    if (response.ok) {
      setOpen(false);
      router.refresh();
    }
  }

  return (
    <>
      <button className="action-button secondary" type="button" onClick={() => setOpen(true)}>
        Засах
      </button>
      {open ? (
        <div className="modal-backdrop" role="presentation">
          <section className="modal-panel compact" role="dialog" aria-modal="true" aria-label="Хэрэглэгч засах">
            <div className="modal-head">
              <h2>Хэрэглэгч засах</h2>
              <button type="button" onClick={() => setOpen(false)}>
                Хаах
              </button>
            </div>
            <form className="form-grid" onSubmit={onSubmit}>
              <label>
                <span>Нэр</span>
                <input value={name} onChange={(event) => setName(event.target.value)} required />
              </label>
              <label>
                <span>Gmail / И-мэйл</span>
                <input
                  type="email"
                  value={email}
                  placeholder="example@gmail.com"
                  onChange={(event) => setEmail(event.target.value)}
                />
              </label>
              <button className="primary-command" disabled={state.loading} type="submit">
                Хадгалах
              </button>
            </form>
            {state.message ? <p className="form-message">{state.message}</p> : null}
          </section>
        </div>
      ) : null}
    </>
  );
}

export function UserRowActions({ client }: { client: ClientWithKeys }) {
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
      throw new Error(data.error?.message ?? "Хэрэглэгчийн төлөв шинэчлэхэд алдаа гарлаа.");
    }

    router.refresh();
  }

  async function deleteClient() {
    const response = await fetch(`/api/admin/api-gateway/clients/${client.id}`, {
      method: "DELETE"
    });

    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
      throw new Error(data.error?.message ?? "Хэрэглэгч устгахад алдаа гарлаа.");
    }

    router.refresh();
  }

  return (
    <div className="row-actions compact-row-actions">
      <CreditModal client={client} />
      <EditClientModal client={client} />
      <ApiKeyManagerModal client={client} />
      <ConfirmDialog
        title={statusActionLabel}
        description={`${client.name} хэрэглэгчийн төлөвийг ${
          nextStatus === "active" ? "идэвхтэй" : "идэвхгүй"
        } болгоно.`}
        confirmLabel={statusActionLabel}
        variant="warning"
        onConfirm={updateStatus}
      />
      <ConfirmDialog
        title="Хэрэглэгч устгах"
        description={`${client.name} хэрэглэгчийг бүр мөсөн устгана. Түлхүүр, хэрэглээ, төлбөрийн түүх хамт устана. Энэ үйлдлийг буцаах боломжгүй.`}
        triggerLabel="Устгах"
        confirmLabel="Бүр мөсөн устгах"
        confirmationText="УСТГАХ"
        variant="danger"
        onConfirm={deleteClient}
      />
    </div>
  );
}

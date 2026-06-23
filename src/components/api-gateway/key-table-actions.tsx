"use client";

import { Check, Copy, Trash2 } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      className="icon-button"
      type="button"
      onClick={copy}
      aria-label={label ?? "Хуулах"}
      title={copied ? "Хуулагдлаа" : "Хуулах"}
    >
      {copied ? <Check size={15} strokeWidth={2.4} /> : <Copy size={15} strokeWidth={2} />}
    </button>
  );
}

export function DeleteKeyButton({
  clientId,
  keyId,
  keyPreview
}: {
  clientId: string;
  keyId: string;
  keyPreview: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function remove() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`/api/admin/api-gateway/clients/${clientId}/keys/${keyId}`, {
        method: "DELETE"
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
        throw new Error(data.error?.message ?? "API түлхүүр устгахад алдаа гарлаа.");
      }

      setOpen(false);
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Устгаж чадсангүй.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        className="icon-button danger"
        type="button"
        onClick={() => setOpen(true)}
        aria-label="API түлхүүр устгах"
        title="Устгах"
      >
        <Trash2 size={15} strokeWidth={2} />
      </button>
      {open ? (
        <div className="modal-backdrop" role="presentation">
          <section className="modal-panel compact" role="dialog" aria-modal="true" aria-label="API түлхүүр устгах">
            <div className="modal-head">
              <h2>API түлхүүр устгах</h2>
              <button type="button" onClick={() => setOpen(false)}>
                Хаах
              </button>
            </div>
            <p className="dialog-copy">
              <code>{keyPreview}</code> түлхүүрийг бүр мөсөн устгах гэж байна. Энэ үйлдлийг буцаах боломжгүй.
              Хэрэглээний бүртгэл болон төлбөрийн түүх хэвээр үлдэнэ.
            </p>
            {error ? <p className="form-message">{error}</p> : null}
            <div className="modal-actions">
              <button className="action-button secondary" type="button" onClick={() => setOpen(false)}>
                Болих
              </button>
              <button className="primary-command danger" disabled={loading} type="button" onClick={remove}>
                Устгах
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

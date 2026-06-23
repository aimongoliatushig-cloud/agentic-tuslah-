import {
  DataTable,
  FilterBar,
  FilterField,
  PageHeader,
  SearchBar,
  StatusBadge
} from "@/components/api-gateway";
import { CopyButton, DeleteKeyButton } from "@/components/api-gateway/key-table-actions";
import {
  formatDate,
  formatMoneyMnt,
  getGatewayAdminData
} from "@/server/api-gateway/adminData";
import type { ApiKey } from "@/server/api-gateway/types";

export const dynamic = "force-dynamic";

interface KeyRow extends ApiKey {
  clientId: string;
  clientName: string;
  monthSpentMnt: number;
}

export default async function ApiKeysPage() {
  const data = await getGatewayAdminData();
  const keyRows: KeyRow[] = data.clients.flatMap((client) =>
    client.apiKeys.map((key) => ({
      ...key,
      clientId: client.id,
      clientName: client.name,
      monthSpentMnt: client.monthSpentMnt
    }))
  );
  const activeKeys = keyRows.filter((key) => key.status === "active").length;

  return (
    <>
      <PageHeader
        title="API түлхүүр"
        description={`Нийт ${keyRows.length} түлхүүр, ${activeKeys} идэвхтэй. Шинэ түлхүүрийг “Хэрэглэгчид” хэсгээс хэрэглэгч бүр дээр үүсгэнэ.`}
      />
      <FilterBar>
        <SearchBar placeholder="Нэр, tracking ID, түлхүүрээр хайх" />
        <FilterField label="Хэрэглэгч">
          <select name="client" defaultValue="all">
            <option value="all">Бүгд</option>
            {data.clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Төлөв">
          <select name="status" defaultValue="all">
            <option value="all">Бүгд</option>
            <option value="active">Идэвхтэй</option>
            <option value="revoked">Устсан</option>
            <option value="suspended">Түр зогссон</option>
          </select>
        </FilterField>
      </FilterBar>
      <DataTable<KeyRow>
        rows={keyRows}
        emptyTitle="API түлхүүр алга"
        emptyDescription="Хэрэглэгчид хэсгээс хэрэглэгч сонгож шинэ API түлхүүр үүсгэнэ үү."
        columns={[
          { key: "name", label: "Нэр", render: (key) => <strong className="money-value">{key.clientName}</strong> },
          { key: "status", label: "Төлөв", render: (key) => <StatusBadge status={key.status} /> },
          {
            key: "trackingId",
            label: "Tracking ID",
            render: (key) => (
              <span className="key-cell">
                <code>key_{key.key_id}</code>
                <CopyButton value={`key_${key.key_id}`} label="Tracking ID хуулах" />
              </span>
            )
          },
          {
            key: "secret",
            label: "Secret key",
            render: (key) => (
              <span className="key-cell">
                <code>{key.key_preview}</code>
                <CopyButton value={key.key_preview} label="Түлхүүр хуулах" />
              </span>
            )
          },
          { key: "created", label: "Үүсгэсэн", render: (key) => formatDate(key.created_at) },
          {
            key: "lastUsed",
            label: "Сүүлд ашигласан",
            render: (key) => (key.last_used_at ? formatDate(key.last_used_at) : "—")
          },
          { key: "access", label: "Хандалт", render: (key) => key.clientName },
          { key: "permissions", label: "Эрх", render: () => "Бүгд" },
          {
            key: "spend",
            label: "Сарын зарцуулалт",
            render: (key) => <strong className="money-value">{formatMoneyMnt(key.monthSpentMnt)}</strong>
          },
          {
            key: "actions",
            label: "",
            className: "key-actions-col",
            render: (key) => (
              <div className="row-actions">
                <DeleteKeyButton clientId={key.clientId} keyId={key.id} keyPreview={key.key_preview} />
              </div>
            )
          }
        ]}
      />
    </>
  );
}

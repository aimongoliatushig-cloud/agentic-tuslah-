import {
  ClientRowActions,
  DataTable,
  FilterBar,
  FilterField,
  PageHeader,
  SearchBar,
  StatusBadge,
  UserFormModal
} from "@/components/api-gateway";
import {
  formatDate,
  getClientEmail,
  getGatewayAdminData,
  type AdminClient
} from "@/server/api-gateway/adminData";

export const dynamic = "force-dynamic";

function formatPercent(value: number) {
  return `${new Intl.NumberFormat("mn-MN", {
    minimumFractionDigits: value > 0 && value < 1 ? 1 : 0,
    maximumFractionDigits: 1
  }).format(value)}%`;
}

function formatProviderUsage(client: AdminClient) {
  return `DeepSeek ${formatPercent(client.deepseekRemainingPercent)} / Kie ${formatPercent(client.kieRemainingPercent)}`;
}

export default async function UsersPage() {
  const data = await getGatewayAdminData();

  return (
    <>
      <PageHeader
        title="Хэрэглэгчид"
        description="API хэрэглэгчийн түлхүүр, хэрэглээний үлдэгдэл хувь болон provider тус бүрийн лимитийг хянах."
        action={<UserFormModal />}
      />
      <FilterBar>
        <SearchBar placeholder="Нэр, имэйл, API түлхүүрээр хайх" />
        <FilterField label="Төлөв">
          <select name="status" defaultValue="all">
            <option value="all">Бүгд</option>
            <option value="active">Идэвхтэй</option>
            <option value="suspended">Түр зогссон</option>
            <option value="disabled">Идэвхгүй</option>
          </select>
        </FilterField>
      </FilterBar>
      <DataTable<AdminClient>
        rows={data.clients}
        columns={[
          { key: "name", label: "Нэр", render: (client) => client.name },
          { key: "email", label: "Имэйл", render: (client) => getClientEmail(client) || "Тохируулаагүй" },
          { key: "key", label: "API түлхүүр", render: (client) => <code>{client.api_key_preview}</code> },
          { key: "remaining", label: "Үлдэгдэл", render: (client) => formatPercent(client.usageRemainingPercent) },
          { key: "used", label: "Ашигласан", render: (client) => formatPercent(client.usageUsedPercent) },
          { key: "providerUsage", label: "Provider үлдэгдэл", render: formatProviderUsage },
          { key: "status", label: "Төлөв", render: (client) => <StatusBadge status={client.status} /> },
          { key: "created", label: "Үүсгэсэн огноо", render: (client) => formatDate(client.created_at) },
          { key: "actions", label: "Үйлдэл", render: (client) => <ClientRowActions client={client} /> }
        ]}
      />
    </>
  );
}

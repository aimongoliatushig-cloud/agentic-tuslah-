import {
  DataTable,
  FilterBar,
  FilterField,
  PageHeader,
  SearchBar,
  StatusBadge,
  UsageLogDrawer
} from "@/components/api-gateway";
import {
  formatDate,
  formatMoneyMnt,
  formatMoneyUsd,
  formatNumber,
  getGatewayAdminData,
  type NamedUsageLog
} from "@/server/api-gateway/adminData";

export const dynamic = "force-dynamic";

export default async function UsagePage() {
  const data = await getGatewayAdminData();

  return (
    <>
      <PageHeader
        title="Хэрэглээний бүртгэл"
        description="Gateway хүсэлт бүрийн хэрэглэгч, модель, token, нэгж, өртөг болон provider metadata."
      />
      <FilterBar>
        <SearchBar placeholder="Хэрэглэгч, модель, request id хайх" />
        <FilterField label="Хэрэглэгч">
          <select name="user" defaultValue="all">
            <option value="all">Бүгд</option>
            {data.clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Модель">
          <select name="model" defaultValue="all">
            <option value="all">Бүгд</option>
            {data.models.map((model) => (
              <option key={model.id} value={model.id}>
                {model.name}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Төлөв">
          <select name="status" defaultValue="all">
            <option value="all">Бүгд</option>
            <option value="success">Амжилттай</option>
            <option value="failed">Алдаа</option>
          </select>
        </FilterField>
        <FilterField label="Огноо">
          <input name="date" type="date" />
        </FilterField>
      </FilterBar>
      <DataTable<NamedUsageLog>
        rows={data.usageLogs}
        columns={[
          { key: "date", label: "Огноо", render: (log) => formatDate(log.created_at) },
          { key: "client", label: "Хэрэглэгч", render: (log) => log.clientName },
          { key: "model", label: "Модель", render: (log) => log.modelName },
          { key: "type", label: "Төрөл", render: (log) => log.modelType },
          { key: "inputTokens", label: "Input token", render: (log) => formatNumber(log.input_tokens ?? 0) },
          { key: "outputTokens", label: "Output token", render: (log) => formatNumber(log.output_tokens ?? 0) },
          { key: "totalTokens", label: "Нийт token", render: (log) => formatNumber(log.total_tokens ?? 0) },
          { key: "cacheHit", label: "Cache hit", render: (log) => formatNumber(log.input_cache_hit_tokens ?? 0) },
          { key: "cacheMiss", label: "Cache miss", render: (log) => formatNumber(log.input_cache_miss_tokens ?? 0) },
          { key: "units", label: "Нэгж", render: (log) => formatNumber(Number(log.billable_units ?? 0)) },
          { key: "costUsd", label: "USD", render: (log) => formatMoneyUsd(Number(log.cost_usd ?? 0)) },
          { key: "costMnt", label: "Өртөг", render: (log) => formatMoneyMnt(Number(log.cost_mnt ?? 0)) },
          { key: "status", label: "Төлөв", render: (log) => <StatusBadge status={log.status} /> },
          {
            key: "metadata",
            label: "Metadata",
            render: (log) => (
              <UsageLogDrawer
                providerResponse={log.provider_response}
                errorMessage={log.error_message}
                costBreakdown={log.cost_breakdown}
              />
            )
          }
        ]}
      />
    </>
  );
}

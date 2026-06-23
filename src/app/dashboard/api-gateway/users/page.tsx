import {
  DashboardGrid,
  DataTable,
  FilterBar,
  FilterField,
  PageHeader,
  SearchBar,
  StatCard,
  StatusBadge,
  UserFormModal
} from "@/components/api-gateway";
import { UserRowActions } from "@/components/api-gateway/user-row-actions";
import {
  formatDate,
  formatMoneyMnt,
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
  return (
    <div className="provider-usage-stack">
      <span>DeepSeek {formatPercent(client.deepseekRemainingPercent)}</span>
      <span>Kie {formatPercent(client.kieRemainingPercent)}</span>
    </div>
  );
}

function formatApiKeySummary(client: AdminClient) {
  const activeKeys = client.apiKeys.filter((key) => key.status === "active");
  const latestKey = activeKeys[0] ?? client.apiKeys[0];

  return (
    <div className="key-summary">
      <code>{latestKey?.key_preview ?? client.api_key_preview}</code>
      <small>
        {activeKeys.length > 0
          ? `${activeKeys.length} идэвхтэй түлхүүр`
          : "Идэвхтэй түлхүүргүй"}
      </small>
    </div>
  );
}

function ClientIdentity({ client }: { client: AdminClient }) {
  const email = getClientEmail(client);

  return (
    <div className="client-identity">
      <strong>{client.name}</strong>
      <span>{email || "Имэйл тохируулаагүй"}</span>
      <small>Үүсгэсэн: {formatDate(client.created_at)}</small>
    </div>
  );
}

function UsageMeter({ client }: { client: AdminClient }) {
  const usedPercent = Math.min(100, Math.max(0, client.usageUsedPercent));

  return (
    <div className="usage-meter" aria-label={`Ашигласан ${formatPercent(client.usageUsedPercent)}`}>
      <div className="usage-meter-head">
        <strong>{formatPercent(client.usageRemainingPercent)}</strong>
        <span>үлдсэн</span>
      </div>
      <span className="usage-track">
        <span style={{ width: `${usedPercent}%` }} />
      </span>
      <small>{formatPercent(client.usageUsedPercent)} ашигласан</small>
    </div>
  );
}

export default async function UsersPage() {
  const data = await getGatewayAdminData();
  const activeClients = data.clients.filter((client) => client.status === "active").length;
  const activeApiKeys = data.clients.reduce(
    (count, client) => count + client.apiKeys.filter((key) => key.status === "active").length,
    0
  );
  const lowRemainingClients = data.clients.filter(
    (client) => client.totalBudgetUsd > 0 && client.usageRemainingPercent <= 10
  ).length;

  return (
    <>
      <PageHeader
        title="Хэрэглэгчид"
        description="Клиент бүрийн түлхүүр, төгрөгийн үлдэгдэл, төсвийн ашиглалт, provider лимитийг нэг дор хянана."
        action={<UserFormModal />}
      />
      <DashboardGrid columns="four">
        <StatCard label="Нийт хэрэглэгч" value={data.clients.length} detail={`${activeClients} идэвхтэй`} />
        <StatCard label="Идэвхтэй API түлхүүр" value={activeApiKeys} detail="Хүсэлт авах боломжтой" />
        <StatCard
          label="Нийт төгрөгийн үлдэгдэл"
          value={formatMoneyMnt(data.stats.totalCreditBalance)}
          detail="Бүх хэрэглэгчийн баланс"
        />
        <StatCard
          label="Анхаарах лимит"
          value={lowRemainingClients}
          detail="10%-аас доош үлдэгдэлтэй"
          tone={lowRemainingClients > 0 ? "warning" : "good"}
        />
      </DashboardGrid>
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
          { key: "client", label: "Хэрэглэгч", render: (client) => <ClientIdentity client={client} />, className: "client-col" },
          { key: "key", label: "API түлхүүр", render: formatApiKeySummary, className: "key-col" },
          {
            key: "balance",
            label: "Төгрөгийн үлдэгдэл",
            render: (client) => <strong className="money-value">{formatMoneyMnt(client.credit_balance)}</strong>,
            className: "money-col"
          },
          { key: "remaining", label: "Төсвийн ашиглалт", render: (client) => <UsageMeter client={client} />, className: "usage-col" },
          { key: "providerUsage", label: "Provider", render: formatProviderUsage },
          { key: "status", label: "Төлөв", render: (client) => <StatusBadge status={client.status} /> },
          { key: "actions", label: "Удирдах", render: (client) => <UserRowActions client={client} />, className: "actions-col" }
        ]}
      />
    </>
  );
}

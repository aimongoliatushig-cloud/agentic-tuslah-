import {
  DashboardGrid,
  DataTable,
  ModelUsageChart,
  SectionCard,
  StatCard,
  StatusBadge,
  UsageChart
} from "@/components/api-gateway";
import { getAccountClientId } from "@/server/accountAuth";
import { getClientAccountData, type AccountUsageLog, type AccountTransaction } from "@/server/api-gateway/accountData";
import { formatDate, formatMoneyMnt, formatNumber } from "@/server/api-gateway/adminData";

export const dynamic = "force-dynamic";

function loginErrorMessage(error?: string) {
  if (error === "notfound") {
    return "Таны и-мэйл бүртгэлгүй байна. Админтай холбогдоно уу.";
  }

  if (error === "google") {
    return "Google-ээр нэвтрэхэд алдаа гарлаа. Дахин оролдоно уу.";
  }

  if (error) {
    return "API түлхүүр буруу эсвэл идэвхгүй байна.";
  }

  return null;
}

function LoginView({ error }: { error?: string }) {
  const message = loginErrorMessage(error);

  return (
    <main className="account-login-page">
      <section className="account-login-card">
        <div className="account-login-brand">
          <span className="login-hero-logo">AT</span>
          <div>
            <strong>Agentic Tuslah</strong>
            <small>Хэрэглэгчийн булан</small>
          </div>
        </div>
        <h1>Хэрэглээгээ хянах</h1>
        <p>Бүртгэлтэй Gmail-ээрээ нэвтэрч үлдэгдэл, хэрэглээ болон зарцуулалтаа харна.</p>
        {message ? <div className="login-error">{message}</div> : null}

        <a className="google-signin" href="/api/account/auth/google">
          <span className="google-mark" aria-hidden="true">G</span>
          Gmail-ээр нэвтрэх
        </a>

        <div className="login-divider">
          <span>эсвэл API түлхүүрээр</span>
        </div>

        <form action="/api/account/login" method="post" className="login-form">
          <label>
            <span>API түлхүүр</span>
            <input name="apiKey" type="password" autoComplete="off" placeholder="agf_live_•••••••" required />
          </label>
          <button className="primary-command" type="submit">
            Нэвтрэх
          </button>
        </form>
        <p className="account-login-hint">
          И-мэйл эсвэл API түлхүүр бүртгэлгүй бол админтай холбогдоно уу. Түлхүүр бусдад бүү дамжуул.
        </p>
      </section>
    </main>
  );
}

export default async function AccountPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const clientId = await getAccountClientId();
  const data = clientId ? await getClientAccountData(clientId) : null;

  if (!data) {
    return <LoginView error={params.error} />;
  }

  const lowBalance = data.balanceMnt <= 0;

  return (
    <main className="account-shell">
      <header className="account-topbar">
        <div className="account-identity">
          <span className="login-hero-logo">AT</span>
          <div>
            <strong>{data.client.name}</strong>
            <small>Хэрэглэгчийн булан</small>
          </div>
        </div>
        <form action="/api/account/logout" method="post">
          <button className="action-button secondary" type="submit">
            Гарах
          </button>
        </form>
      </header>

      <p className="section-caption">Миний үлдэгдэл</p>
      <DashboardGrid columns="four">
        <StatCard
          label="Одоогийн үлдэгдэл"
          value={formatMoneyMnt(data.balanceMnt)}
          detail={lowBalance ? "Цэнэглэх шаардлагатай" : "Боломжтой үлдэгдэл"}
          tone={lowBalance ? "danger" : "good"}
        />
        <StatCard label="Энэ сарын зарцуулалт" value={formatMoneyMnt(data.monthSpentMnt)} detail={`${formatNumber(data.monthRequests)} хүсэлт`} />
        <StatCard label="Нийт хүсэлт" value={data.totalRequests} detail={`Амжилт ${data.successRate}%`} />
        <StatCard label="Нийт token" value={data.totalTokens} detail={`Нийт зарцуулалт ${formatMoneyMnt(data.totalSpentMnt)}`} tone="warning" />
      </DashboardGrid>

      <p className="section-caption">Хэрэглээ</p>
      <DashboardGrid columns="two">
        <SectionCard title="Өдрийн хүсэлт" description="Сүүлийн 14 өдрийн хүсэлтийн тоо.">
          <UsageChart title="Өдрийн хүсэлт" points={data.dailyRequests} />
        </SectionCard>
        <SectionCard title="Модель хэрэглээ" description="Хамгийн их ашигласан моделиуд.">
          <ModelUsageChart points={data.modelUsage} />
        </SectionCard>
      </DashboardGrid>

      <p className="section-caption">Сүүлийн хүсэлтүүд</p>
      <DataTable<AccountUsageLog>
        rows={data.usageLogs}
        emptyTitle="Хэрэглээ алга"
        emptyDescription="Та API-аар хүсэлт явуулсны дараа энд харагдана."
        columns={[
          { key: "date", label: "Огноо", render: (log) => formatDate(log.created_at) },
          { key: "model", label: "Модель", render: (log) => log.modelName },
          { key: "type", label: "Төрөл", render: (log) => log.modelType },
          { key: "inputTokens", label: "Input", render: (log) => formatNumber(log.input_tokens ?? 0) },
          { key: "outputTokens", label: "Output", render: (log) => formatNumber(log.output_tokens ?? 0) },
          { key: "totalTokens", label: "Нийт token", render: (log) => formatNumber(log.total_tokens ?? 0) },
          { key: "cost", label: "Үнэ", render: (log) => formatMoneyMnt(log.retailCostMnt) },
          { key: "status", label: "Төлөв", render: (log) => <StatusBadge status={log.status} /> }
        ]}
      />

      <p className="section-caption">Төгрөгийн гүйлгээ</p>
      <DataTable<AccountTransaction>
        rows={data.transactions}
        emptyTitle="Гүйлгээ алга"
        emptyDescription="Цэнэглэлт, зарцуулалтын түүх энд харагдана."
        columns={[
          { key: "date", label: "Огноо", render: (row) => formatDate(row.created_at) },
          { key: "type", label: "Төрөл", render: (row) => (row.type === "credit" ? "Нэмэлт" : "Зарцуулалт") },
          {
            key: "amount",
            label: "Дүн",
            render: (row) => (
              <strong className={`tx-amount ${row.type === "credit" ? "credit" : "debit"}`}>
                {row.type === "credit" ? "+" : "−"}
                {formatMoneyMnt(row.retailAmount)}
              </strong>
            )
          },
          { key: "balance", label: "Дараах үлдэгдэл", render: (row) => formatMoneyMnt(row.retailBalanceAfter) },
          { key: "note", label: "Тайлбар", render: (row) => row.note ?? "Тайлбаргүй" }
        ]}
      />
    </main>
  );
}

import {
  DashboardGrid,
  ModelUsageChart,
  PageHeader,
  RevenueChart,
  SectionCard,
  StatCard,
  TopModelsWidget,
  TopUsersWidget,
  UsageChart
} from "@/components/api-gateway";
import {
  formatMoneyMnt,
  formatMoneyUsd,
  formatNumber,
  getGatewayAdminData
} from "@/server/api-gateway/adminData";

export const dynamic = "force-dynamic";

export default async function ApiGatewayDashboardPage() {
  const data = await getGatewayAdminData();

  return (
    <>
      <PageHeader
        title="Хяналтын самбар"
        description="API хэрэглэгч, кредит, token, өртөг, хүсэлт болон модель хэрэглээг нэг дор хянах самбар."
      />
      <DashboardGrid columns="four">
        <StatCard label="Нийт хэрэглэгч" value={data.stats.totalClients} />
        <StatCard label="Идэвхтэй хэрэглэгч" value={data.stats.activeClients} tone="good" />
        <StatCard
          label="Нийт $ үлдэгдэл"
          value={`${formatMoneyUsd(data.stats.totalBudgetRemainingUsd)} / ${formatMoneyUsd(data.stats.totalBudgetLimitUsd)}`}
        />
        <StatCard label="Өнөөдрийн хүсэлт" value={data.stats.todayRequests} />
        <StatCard label="Энэ сарын хүсэлт" value={data.stats.monthRequests} />
        <StatCard label="Нийт token" value={data.stats.totalTokens} />
        <StatCard label="Billable нэгж" value={formatNumber(data.stats.totalBillableUnits)} />
        <StatCard label="USD өртөг" value={formatMoneyUsd(data.stats.totalCostUsd)} tone="warning" />
        <StatCard label="Өртөг" value={formatMoneyMnt(data.stats.totalCostMnt)} tone="warning" />
        <StatCard label="Орлого (тооцоолсон)" value={formatMoneyMnt(data.stats.estimatedRevenue)} />
        <StatCard label="Топ хэрэглэгч" value={data.stats.topClient} />
        <StatCard label="Топ модель" value={data.stats.topModel} />
      </DashboardGrid>
      <DashboardGrid columns="two">
        <SectionCard title="Хэрэглээний өсөлт" description="Сүүлийн 14 өдрийн хүсэлтийн хандлага.">
          <UsageChart title="Хэрэглээний өсөлт" points={data.charts.usageGrowth} />
        </SectionCard>
        <SectionCard title="Өдрийн хүсэлтийн тоо" description="Сүүлийн 7 өдрийн хүсэлтийн хэмжээ.">
          <RevenueChart points={data.charts.dailyRequests} />
        </SectionCard>
        <SectionCard title="Кредит зарцуулалт" description="Амжилттай хүсэлтээр хасагдсан кредит.">
          <UsageChart title="Кредит зарцуулалт" points={data.charts.creditSpend} />
        </SectionCard>
        <SectionCard title="₮ өртөг" description="Амжилттай хүсэлтүүдийн бодит өртгийн дүн.">
          <RevenueChart points={data.charts.revenue} />
        </SectionCard>
        <SectionCard title="Модель хэрэглээ" description="Хамгийн их ашиглагдсан моделиуд.">
          <ModelUsageChart points={data.charts.modelUsage} />
        </SectionCard>
      </DashboardGrid>
      <DashboardGrid columns="two">
        <TopUsersWidget rows={data.leaders.topCustomers} />
        <TopModelsWidget rows={data.leaders.topModels} />
      </DashboardGrid>
    </>
  );
}

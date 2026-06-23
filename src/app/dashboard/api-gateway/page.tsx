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
        description="Хамгийн чухал үзүүлэлтүүдийг нэг дороос. Дэлгэрэнгүйг доорх хэсгүүдээс үзнэ үү."
      />

      <p className="section-caption">Гол үзүүлэлт</p>
      <DashboardGrid columns="four">
        <StatCard label="Идэвхтэй хэрэглэгч" value={data.stats.activeClients} detail={`Нийт ${formatNumber(data.stats.totalClients)}`} tone="good" />
        <StatCard label="Нийт ₮ үлдэгдэл" value={formatMoneyMnt(data.stats.totalCreditBalance)} detail="Бүх хэрэглэгчийн баланс" />
        <StatCard label="Өнөөдрийн хүсэлт" value={data.stats.todayRequests} detail={`Энэ сар ${formatNumber(data.stats.monthRequests)}`} />
        <StatCard label="Нийт өртөг" value={formatMoneyMnt(data.stats.totalCostMnt)} detail="Амжилттай хүсэлтүүд" tone="warning" />
      </DashboardGrid>

      <p className="section-caption">Хэрэглээ ба орлого</p>
      <DashboardGrid columns="four">
        <StatCard label="Нийт token" value={data.stats.totalTokens} />
        <StatCard label="Billable нэгж" value={formatNumber(data.stats.totalBillableUnits)} />
        <StatCard label="Орлого (тооцоолсон)" value={formatMoneyMnt(data.stats.estimatedRevenue)} tone="good" />
        <StatCard
          label="Лимит үлдэгдэл"
          value={formatMoneyMnt(data.stats.totalBudgetRemainingMnt)}
          detail={`Нийт лимит ${formatMoneyMnt(data.stats.totalBudgetLimitMnt)}`}
        />
      </DashboardGrid>

      <p className="section-caption">Хандлага</p>
      <DashboardGrid columns="two">
        <SectionCard title="Хэрэглээний өсөлт" description="Сүүлийн 14 өдрийн хүсэлтийн хандлага.">
          <UsageChart title="Хэрэглээний өсөлт" points={data.charts.usageGrowth} />
        </SectionCard>
        <SectionCard title="Өдрийн хүсэлтийн тоо" description="Сүүлийн 7 өдрийн хүсэлтийн хэмжээ.">
          <RevenueChart points={data.charts.dailyRequests} />
        </SectionCard>
        <SectionCard title="₮ өртөг" description="Амжилттай хүсэлтүүдийн бодит өртгийн дүн.">
          <RevenueChart points={data.charts.revenue} />
        </SectionCard>
        <SectionCard title="Модель хэрэглээ" description="Хамгийн их ашиглагдсан моделиуд.">
          <ModelUsageChart points={data.charts.modelUsage} />
        </SectionCard>
      </DashboardGrid>

      <p className="section-caption">Тэргүүлэгчид</p>
      <DashboardGrid columns="two">
        <TopUsersWidget rows={data.leaders.topCustomers} />
        <TopModelsWidget rows={data.leaders.topModels} />
      </DashboardGrid>
    </>
  );
}

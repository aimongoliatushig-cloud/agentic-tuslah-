import {
  DashboardGrid,
  PageHeader,
  RevenueChart,
  SectionCard,
  StatCard,
  TopModelsWidget,
  TopUsersWidget,
  UsageChart,
  UsageHeatmap
} from "@/components/api-gateway";
import { formatMoneyMnt, formatMoneyUsd, getGatewayAdminData } from "@/server/api-gateway/adminData";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const data = await getGatewayAdminData();
  const deductedCredits = data.usageLogs
    .filter((log) => log.status === "success")
    .reduce((sum, log) => sum + log.credit_cost, 0);

  return (
    <>
      <PageHeader
        title="Тайлан"
        description="Өдөр, 7 хоног, сар, token, image/request нэгж болон төгрөгийн өртгийн тайлан."
      />
      <DashboardGrid columns="three">
        <StatCard label="Өдөр" value={data.stats.todayRequests} detail="Өнөөдрийн хүсэлт" />
        <StatCard
          label="7 хоног"
          value={data.charts.dailyRequests.reduce((sum, point) => sum + point.value, 0)}
          detail="Сүүлийн 7 өдөр"
        />
        <StatCard label="Сар" value={data.stats.monthRequests} detail="Энэ сарын нийт хүсэлт" />
        <StatCard label="Хасагдсан кредит" value={deductedCredits} />
        <StatCard label="Нийт token" value={data.stats.totalTokens} />
        <StatCard label="Billable нэгж" value={data.stats.totalBillableUnits} />
        <StatCard label="USD өртөг" value={formatMoneyUsd(data.stats.totalCostUsd)} tone="warning" />
        <StatCard label="Нийт өртөг" value={formatMoneyMnt(data.stats.totalCostMnt)} tone="warning" />
        <StatCard label="Орлого" value={formatMoneyMnt(data.stats.estimatedRevenue)} tone="good" />
      </DashboardGrid>
      <DashboardGrid columns="two">
        <SectionCard title="Growth chart" description="Сүүлийн 14 өдрийн хэрэглээний өсөлт.">
          <UsageChart title="Growth chart" points={data.charts.usageGrowth} />
        </SectionCard>
        <SectionCard title="Revenue estimation" description="Usage log бүр дээр хадгалсан төгрөгийн өртөг.">
          <RevenueChart points={data.charts.revenue} />
        </SectionCard>
        <TopUsersWidget rows={data.leaders.topCustomers} />
        <TopModelsWidget rows={data.leaders.topModels} />
      </DashboardGrid>
      <SectionCard title="Usage heatmap" description="Өдөр болон цагийн бүсээр хэрэглээний тархалт.">
        <UsageHeatmap cells={data.charts.heatmap} />
      </SectionCard>
    </>
  );
}

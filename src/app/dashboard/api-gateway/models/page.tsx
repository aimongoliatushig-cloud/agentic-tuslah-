import {
  DataTable,
  FilterBar,
  FilterField,
  ModelFormModal,
  ModelRowActions,
  PageHeader,
  SearchBar,
  StatusBadge
} from "@/components/api-gateway";
import {
  formatMoneyMnt,
  formatMoneyUsd,
  formatNumber,
  getGatewayAdminData,
  getModelType
} from "@/server/api-gateway/adminData";
import type { ApiModel } from "@/server/api-gateway/types";

export const dynamic = "force-dynamic";

function formatModelPricing(model: ApiModel) {
  if (model.billing_type === "token") {
    return `Hit ${formatMoneyUsd(Number(model.input_cache_hit_1m_token_price_usd))}/1M, Miss ${formatMoneyUsd(Number(model.input_cache_miss_1m_token_price_usd))}/1M, Out ${formatMoneyUsd(Number(model.output_1m_token_price_usd))}/1M`;
  }

  if (model.billing_type === "image") {
    return `${formatMoneyUsd(Number(model.unit_price_usd))} / зураг`;
  }

  if (model.billing_type === "request") {
    return `${formatMoneyUsd(Number(model.unit_price_usd))} / request`;
  }

  return `${formatMoneyMnt(Number(model.unit_price_mnt))} / кредит`;
}

export default async function ModelsPage() {
  const data = await getGatewayAdminData();

  return (
    <>
      <PageHeader
        title="Моделиуд"
        description="Text, Image, Video, Voice model mapping, credit cost болон token/image өртгийн тохиргоо."
        action={<ModelFormModal />}
      />
      <FilterBar>
        <SearchBar placeholder="Модель нэр эсвэл provider ID хайх" />
        <FilterField label="Төрөл">
          <select name="type" defaultValue="all">
            <option value="all">Бүгд</option>
            <option>Text</option>
            <option>Image</option>
            <option>Video</option>
            <option>Voice</option>
          </select>
        </FilterField>
      </FilterBar>
      <DataTable<ApiModel>
        rows={data.models}
        columns={[
          { key: "name", label: "Нэр", render: (model) => model.name },
          { key: "provider", label: "Provider Model ID", render: (model) => <code>{model.provider_model}</code> },
          { key: "type", label: "Төрөл", render: (model) => getModelType(model) },
          { key: "billing", label: "Billing", render: (model) => model.billing_type },
          { key: "cost", label: "Кредит", render: (model) => `${formatNumber(model.credit_cost)} кредит` },
          { key: "price", label: "Үнэ", render: (model) => formatModelPricing(model) },
          {
            key: "source",
            label: "Эх сурвалж",
            render: (model) =>
              model.pricing_source_url ? (
                <a href={model.pricing_source_url} rel="noreferrer" target="_blank">
                  pricing
                </a>
              ) : (
                "Тохируулаагүй"
              )
          },
          { key: "status", label: "Төлөв", render: (model) => <StatusBadge status={model.status} /> },
          { key: "actions", label: "Үйлдэл", render: (model) => <ModelRowActions model={model} /> }
        ]}
      />
    </>
  );
}

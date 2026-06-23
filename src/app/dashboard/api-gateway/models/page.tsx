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
  formatNumber,
  getGatewayAdminData,
  getModelType,
  usdToMnt
} from "@/server/api-gateway/adminData";
import type { ApiModel } from "@/server/api-gateway/types";

export const dynamic = "force-dynamic";

function formatModelPricing(model: ApiModel) {
  if (model.billing_type === "token") {
    // Prefer MNT-native per-1K prices; otherwise convert the USD per-1M provider prices.
    const input1k = Number(model.input_1k_token_price_mnt) || 0;
    const output1k = Number(model.output_1k_token_price_mnt) || 0;

    if (input1k > 0 || output1k > 0) {
      return `Оролт ${formatMoneyMnt(input1k)}/1K, Гаралт ${formatMoneyMnt(output1k)}/1K`;
    }

    const hit = usdToMnt(Number(model.input_cache_hit_1m_token_price_usd) || 0);
    const miss = usdToMnt(Number(model.input_cache_miss_1m_token_price_usd) || 0);
    const output = usdToMnt(Number(model.output_1m_token_price_usd) || 0);
    return `Cache ${formatMoneyMnt(hit)}/1M, Оролт ${formatMoneyMnt(miss)}/1M, Гаралт ${formatMoneyMnt(output)}/1M`;
  }

  if (model.billing_type === "image") {
    const price = Number(model.unit_price_mnt) || usdToMnt(Number(model.unit_price_usd) || 0);
    return `${formatMoneyMnt(price)} / зураг`;
  }

  if (model.billing_type === "request") {
    const price = Number(model.unit_price_mnt) || usdToMnt(Number(model.unit_price_usd) || 0);
    return `${formatMoneyMnt(price)} / хүсэлт`;
  }

  return `${formatMoneyMnt(Number(model.unit_price_mnt))} / нэгж`;
}

export default async function ModelsPage() {
  const data = await getGatewayAdminData();

  return (
    <>
      <PageHeader
        title="Моделиуд"
        description="Text, Image, Video, Voice model mapping, нөөцлөх нэгж болон token/image өртгийн тохиргоо."
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
          { key: "cost", label: "Нөөцлөх нэгж", render: (model) => formatNumber(model.credit_cost) },
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

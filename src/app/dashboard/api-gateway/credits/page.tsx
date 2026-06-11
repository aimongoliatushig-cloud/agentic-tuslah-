import {
  DataTable,
  FilterBar,
  FilterField,
  InlineActions,
  PageHeader,
  SearchBar
} from "@/components/api-gateway";
import { formatDate, formatMoneyMnt, getGatewayAdminData, type NamedTransaction } from "@/server/api-gateway/adminData";

export const dynamic = "force-dynamic";

export default async function CreditsPage() {
  const data = await getGatewayAdminData();

  return (
    <>
      <PageHeader
        title="Төгрөгийн гүйлгээ"
        description="Хэрэглэгчийн төгрөгийн үлдэгдлийн цэнэглэлт, зарцуулалт, засварын түүхийг хянах хэсэг."
      />
      <FilterBar>
        <SearchBar placeholder="Хэрэглэгч эсвэл тайлбараар хайх" />
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
        <FilterField label="Төрөл">
          <select name="type" defaultValue="all">
            <option value="all">Бүгд</option>
            <option value="credit">Нэмэлт</option>
            <option value="debit">Зарцуулалт</option>
          </select>
        </FilterField>
        <FilterField label="Огноо">
          <input name="date" type="date" />
        </FilterField>
      </FilterBar>
      <InlineActions>
        <button className="action-button secondary" type="button">
          ₮ цэнэглэх
        </button>
        <button className="action-button secondary" disabled type="button">
          ₮ буцаах
        </button>
        <button className="action-button secondary" disabled type="button">
          ₮ засварлах
        </button>
      </InlineActions>
      <DataTable<NamedTransaction>
        rows={data.transactions}
        columns={[
          { key: "date", label: "Огноо", render: (row) => formatDate(row.created_at) },
          { key: "client", label: "Хэрэглэгч", render: (row) => row.clientName },
          { key: "type", label: "Төрөл", render: (row) => (row.type === "credit" ? "Нэмэлт" : "Зарцуулалт") },
          { key: "amount", label: "Дүн", render: (row) => formatMoneyMnt(row.amount) },
          { key: "note", label: "Тайлбар", render: (row) => row.note ?? "Тайлбаргүй" }
        ]}
      />
    </>
  );
}

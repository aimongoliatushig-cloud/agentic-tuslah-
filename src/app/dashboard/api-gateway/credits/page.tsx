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

function TransactionAmount({ row }: { row: NamedTransaction }) {
  const isCredit = row.type === "credit";
  return (
    <strong className={`tx-amount ${isCredit ? "credit" : "debit"}`}>
      {isCredit ? "+" : "−"}
      {formatMoneyMnt(row.amount)}
    </strong>
  );
}

export default async function CreditsPage() {
  const data = await getGatewayAdminData();
  const totalAdded = data.transactions
    .filter((row) => row.type === "credit")
    .reduce((sum, row) => sum + row.amount, 0);
  const totalSpent = data.transactions
    .filter((row) => row.type === "debit")
    .reduce((sum, row) => sum + row.amount, 0);

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
        <span className="inline-stat credit">Нийт цэнэглэлт: {formatMoneyMnt(totalAdded)}</span>
        <span className="inline-stat debit">Нийт зарцуулалт: {formatMoneyMnt(totalSpent)}</span>
        <span className="inline-hint">
          Цэнэглэх, хасах үйлдлийг “Хэрэглэгчид” хэсгээс хэрэглэгч бүр дээр “₮ үлдэгдэл” товчоор хийнэ.
        </span>
      </InlineActions>
      <DataTable<NamedTransaction>
        rows={data.transactions}
        columns={[
          { key: "date", label: "Огноо", render: (row) => formatDate(row.created_at) },
          { key: "client", label: "Хэрэглэгч", render: (row) => row.clientName },
          { key: "type", label: "Төрөл", render: (row) => (row.type === "credit" ? "Нэмэлт" : "Зарцуулалт") },
          { key: "amount", label: "Дүн", render: (row) => <TransactionAmount row={row} /> },
          { key: "balance", label: "Дараах үлдэгдэл", render: (row) => formatMoneyMnt(Number(row.balance_after ?? 0)) },
          { key: "note", label: "Тайлбар", render: (row) => row.note ?? "Тайлбаргүй" }
        ]}
      />
    </>
  );
}

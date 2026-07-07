import { PageHeader } from "@/components/api-gateway";
import {
  formatDate,
  formatMoneyMnt,
  getRecentGenerations
} from "@/server/api-gateway/adminData";

export const dynamic = "force-dynamic";

function isVideoUrl(url: string) {
  return /\.(mp4|webm|mov)(\?|$)/i.test(url);
}

export default async function GenerationsPage() {
  const items = await getRecentGenerations();

  return (
    <>
      <PageHeader
        title="Бүтээлүүд"
        description="Kie.ai-аар үүсгэсэн сүүлийн зураг, видеонууд. Линкүүд Kie-ийн түр хадгалалт тул ойролцоогоор 14 хоногийн дараа устдаг — чухал контентоо татаж авч хадгалаарай."
      />
      {items.length === 0 ? (
        <p>Одоогоор амжилттай зураг/видео үүсгэлт алга.</p>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 16
          }}
        >
          {items.map((item) =>
            item.urls.map((url) => (
              <figure
                key={`${item.id}-${url}`}
                style={{
                  margin: 0,
                  border: "1px solid rgba(120, 120, 120, 0.25)",
                  borderRadius: 12,
                  overflow: "hidden"
                }}
              >
                {isVideoUrl(url) ? (
                  <video
                    src={url}
                    controls
                    preload="metadata"
                    style={{
                      width: "100%",
                      aspectRatio: "16/9",
                      objectFit: "cover",
                      background: "#000",
                      display: "block"
                    }}
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element -- Kie temp URLs are remote and short-lived; next/image remote config is overkill here.
                  <img
                    src={url}
                    alt={item.modelName}
                    loading="lazy"
                    style={{
                      width: "100%",
                      aspectRatio: "1/1",
                      objectFit: "cover",
                      display: "block"
                    }}
                  />
                )}
                <figcaption style={{ padding: "8px 12px", fontSize: 13, lineHeight: 1.5 }}>
                  <strong>{item.modelName}</strong> — {item.clientName}
                  <br />
                  {formatDate(item.createdAt)} · {formatMoneyMnt(item.costMnt)} ·{" "}
                  <a href={url} target="_blank" rel="noreferrer">
                    татах
                  </a>
                </figcaption>
              </figure>
            ))
          )}
        </div>
      )}
    </>
  );
}

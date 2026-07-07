import { PageHeader } from "@/components/api-gateway";
import { StudioClient } from "@/components/api-gateway/studio-client";
import { getStudioBootstrap } from "@/server/api-gateway/adminData";

export const dynamic = "force-dynamic";

export default async function StudioPage() {
  const { clients, models } = await getStudioBootstrap();

  return (
    <>
      <PageHeader
        title="Студи"
        description="Prompt бичээд Kie.ai model-уудаар зураг, видео шууд үүсгэ. Тооцоо нь сонгосон хэрэглэгчийн кредитээс хасагдаж, үр дүн нь Бүтээлүүд хуудсанд бүртгэгдэнэ."
      />
      <StudioClient clients={clients} models={models} />
    </>
  );
}

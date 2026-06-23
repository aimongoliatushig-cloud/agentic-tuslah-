export default async function AdminLoginPage({
  searchParams
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const next = params.next ?? "/dashboard/api-gateway";

  return (
    <main className="login-page">
      <div className="login-card">
        <section className="login-hero" aria-hidden="true">
          <div className="login-hero-brand">
            <span className="login-hero-logo">AT</span>
            Agentic Tuslah
          </div>
          <div className="login-hero-copy">
            <h2>AI Gateway удирдлагын самбар</h2>
            <p>Хэрэглэгч, модель, төгрөгийн урсгал болон хэрэглээгээ нэг дороос хянаарай.</p>
          </div>
          <ul className="login-hero-points">
            <li>Хэрэглэгч ба API түлхүүрийн удирдлага</li>
            <li>Төгрөгийн үлдэгдэл цэнэглэх, хасах</li>
            <li>Token, өртөг, хэрэглээний бодит тайлан</li>
          </ul>
        </section>

        <section className="login-panel">
          <p className="eyebrow">API Gateway</p>
          <h1>Админ нэвтрэх</h1>
          <p>Админ токеноо оруулж удирдлагын самбарт нэвтэрнэ.</p>
          {params.error ? (
            <div className="login-error">Админ токен буруу эсвэл тохируулаагүй байна.</div>
          ) : null}
          <form action="/api/admin/login" method="post" className="login-form">
            <input name="next" type="hidden" value={next} />
            <label>
              <span>Админ токен</span>
              <input name="token" type="password" autoComplete="current-password" placeholder="agf_admin_•••••••" required />
            </label>
            <button className="primary-command" type="submit">
              Нэвтрэх
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}

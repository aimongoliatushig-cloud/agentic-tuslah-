export default async function AdminLoginPage({
  searchParams
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const next = params.next ?? "/dashboard/api-gateway";

  return (
    <main className="login-page">
      <section className="login-panel">
        <p className="eyebrow">API Gateway</p>
        <h1>Админ нэвтрэх</h1>
        <p>Админ токеноо оруулж dashboard-д нэвтэрнэ.</p>
        {params.error ? <div className="login-error">Админ токен буруу эсвэл тохируулаагүй байна.</div> : null}
        <form action="/api/admin/login" method="post" className="login-form">
          <input name="next" type="hidden" value={next} />
          <label>
            <span>Админ токен</span>
            <input name="token" type="password" autoComplete="current-password" required />
          </label>
          <button className="primary-command" type="submit">
            Нэвтрэх
          </button>
        </form>
      </section>
    </main>
  );
}

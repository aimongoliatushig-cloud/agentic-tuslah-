import { GatewaySubnav } from "@/components/api-gateway/gateway-subnav";

export default function ApiGatewayLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="gateway-admin">
      <div className="gateway-section-head">
        <div>
          <p>API Gateway</p>
          <h1>AI Gateway удирдлага</h1>
        </div>
      </div>
      <GatewaySubnav />
      {children}
    </div>
  );
}

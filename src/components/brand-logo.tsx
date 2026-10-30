import Image from "next/image";

export function BrandLogo({ className, alt = "Logo Pagar Nusa" }: { className: string; alt?: string }) {
  return <Image className={className} src="/logo-pagar-nusa.png" width={714} height={752} alt={alt} priority />;
}

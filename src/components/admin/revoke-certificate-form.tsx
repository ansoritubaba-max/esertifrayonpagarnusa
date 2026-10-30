"use client";

import type { FormEvent } from "react";
import { revokeCertificate } from "@/app/admin/sertifikat/actions";

export function RevokeCertificateForm({ certificateId }: { certificateId: string }) {
  function confirmRevocation(event: FormEvent<HTMLFormElement>) {
    if (!window.confirm("Cabut sertifikat ini? Status verifikasi publiknya akan berubah menjadi tidak berlaku.")) event.preventDefault();
  }

  return <form action={revokeCertificate} onSubmit={confirmRevocation} className="revoke-form">
    <input type="hidden" name="certificate_id" value={certificateId} />
    <label className="sr-only" htmlFor={`reason-${certificateId}`}>Alasan pencabutan</label>
    <input id={`reason-${certificateId}`} name="reason" required minLength={5} maxLength={500} placeholder="Alasan pencabutan" />
    <button className="text-button text-button-danger" type="submit">Cabut</button>
  </form>;
}

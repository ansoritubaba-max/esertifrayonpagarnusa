import { createClient } from "@supabase/supabase-js";
import { createInterface } from "node:readline";

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !secretKey) {
  console.error("SUPABASE_URL dan SUPABASE_SECRET_KEY harus diisi di .env.local.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function ask(prompt, { hidden = false } = {}) {
  return new Promise((resolve, reject) => {
    const input = process.stdin;
    const output = process.stdout;
    let value = "";

    output.write(prompt);
    if (!input.isTTY) {
      const rl = createInterface({ input, output });
      rl.question("", (answer) => {
        rl.close();
        resolve(answer.trim());
      });
      return;
    }

    if (hidden) {
      input.setRawMode(true);
      input.resume();
      const onData = (chunk) => {
        for (const character of chunk.toString()) {
          if (character === "\u0003") {
            cleanup();
            reject(new Error("Setup dibatalkan."));
            return;
          }
          if (character === "\r" || character === "\n") {
            cleanup();
            output.write("\n");
            resolve(value);
            return;
          }
          if (character === "\u007f" || character === "\b") {
            value = value.slice(0, -1);
            output.write("\b \b");
            continue;
          }
          if (character >= " ") {
            value += character;
            output.write("•");
          }
        }
      };
      function cleanup() {
        input.removeListener("data", onData);
        input.setRawMode(false);
      }
      input.on("data", onData);
      return;
    }

    const rl = createInterface({ input, output });
    rl.question("", (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  const { count, error: checkError } = await supabase
    .from("admin_profiles")
    .select("id", { count: "exact", head: true });

  if (checkError) {
    if (checkError.code === "PGRST205" || checkError.code === "42P01") {
      throw new Error("Tabel belum tersedia. Jalankan migration SQL di Supabase terlebih dahulu.");
    }
    throw new Error(`Tidak dapat memeriksa administrator: ${checkError.message}`);
  }
  if ((count ?? 0) > 0) {
    throw new Error("Administrator awal sudah dibuat. Setup awal tidak dapat dijalankan ulang.");
  }

  console.log("Setup administrator awal E-Sertifikat Pagar Nusa\n");
  const nama = await ask("Nama administrator: ");
  const email = await ask("Email administrator: ");
  const password = await ask("Kata sandi (minimal 12 karakter): ", { hidden: true });
  const confirmation = await ask("Ulangi kata sandi: ", { hidden: true });

  if (!nama || nama.length > 120) throw new Error("Nama wajib diisi dan maksimal 120 karakter.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Format email tidak valid.");
  if (password.length < 12) throw new Error("Kata sandi harus memiliki minimal 12 karakter.");
  if (password !== confirmation) throw new Error("Konfirmasi kata sandi tidak cocok.");

  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nama },
  });
  if (createError || !created.user) throw new Error(createError?.message || "Akun administrator gagal dibuat.");

  const { error: profileError } = await supabase.from("admin_profiles").insert({
    id: created.user.id,
    nama,
    email_display: email,
  });

  if (profileError) {
    await supabase.auth.admin.deleteUser(created.user.id);
    if (profileError.code === "23505") throw new Error("Administrator awal dibuat oleh proses lain. Akun duplikat dibatalkan.");
    throw new Error(`Profil administrator gagal disimpan: ${profileError.message}`);
  }

  console.log(`\nAdministrator ${email} berhasil disiapkan. Silakan masuk melalui /login.`);
}

main().catch((error) => {
  console.error(`\nSetup gagal: ${error.message}`);
  process.exitCode = 1;
});

import { hashPassword } from "./_password.mjs";

const password = process.argv[2];
if (!password) {
  console.error('Uso: pnpm user:password "password-segura"');
  process.exit(1);
}

console.log(hashPassword(password));
